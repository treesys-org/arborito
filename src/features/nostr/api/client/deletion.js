/**
 * Signed deletion records: a signing helper that wraps a `{ kind, targetId,
 * at }` JSON payload as an app-signed event, the verifier that pairs with
 * it, and the convenience flows that publish deletion records for forum
 * messages, threads, and accounts (self-delete and admin-delete).
 *
 * Account deletion in particular feeds the directory verifier, readers
 * call `getDeletedAccountRecord` to see whether an account should be
 * hidden everywhere.
 */

import { verifyEvent } from '../../../../../vendor/nostr-tools/lib/esm/index.js';
import { KIND_FORUM_BUCKET } from '../nostr-spec.js';
import { tagValue } from './_shared.js';

export const deletionMixin = {
    async signDeletion({ adminPair, kind, targetId }) {
        const payload = { kind: String(kind), targetId: String(targetId), at: new Date().toISOString() };
        return this._signJsonPayload(adminPair, payload);
    },

    async verifyDeletionRecord({ record, kind, targetId }) {
        try {
            const ev = record && record.sig && typeof record.sig === 'object' ? record.sig : null;
            if (!ev || !verifyEvent(ev)) return false;
            const by = String(record.by || tagValue(ev, 'pk') || ev.pubkey || '');
            if (!by) return false;
            /* Signer of the inner event must match the claimed `by`. */
            if (String(ev.pubkey) !== by) return false;
            const v = await this._verifyJsonPayloadEvent(ev);
            return !!(v && String(v.kind) === String(kind) && String(v.targetId) === String(targetId) && typeof v.at === 'string');
        } catch {
            return false;
        }
    },

    /**
     * Cryptographic check plus authorization: tree owner, forum editor, message
     * author (self-delete), or self account delete.
     */
    async isAuthorizedForumDeletion({
        record,
        kind,
        targetId,
        ownerPub,
        universeId,
        messageAuthorPub = null
    }) {
        if (!(await this.verifyDeletionRecord({ record, kind, targetId }))) return false;
        const by = String(record.by || '');
        if (!by) return false;
        if (by === String(ownerPub || '')) return true;
        if (String(kind) === 'delete_message' && messageAuthorPub && by === String(messageAuthorPub)) {
            return true;
        }
        if (String(kind) === 'delete_account' && by === String(targetId)) return true;
        if (
            String(kind) === 'delete_message' ||
            String(kind) === 'delete_thread' ||
            String(kind) === 'delete_account'
        ) {
            try {
                if (typeof this._loadForumEditorSetOnce === 'function') {
                    const editors = await this._loadForumEditorSetOnce({
                        ownerPub: String(ownerPub || ''),
                        universeId: String(universeId || '')
                    });
                    if (editors && editors.has(by)) return true;
                }
            } catch {
                /* ignore */
            }
        }
        return false;
    },

    async putDeletedMessage({ pub, universeId, messageId, record }) {
        const ev = record && record.sig ? record.sig : null;
        const wrapped = { ...record, sig: ev };
        await this._forumPut(pub, universeId, 'delmsg', String(messageId), wrapped);
    },

    async deleteMessage({ pub, universeId, messageId, adminPair }) {
        const rec = await this.signDeletion({ adminPair, kind: 'delete_message', targetId: messageId });
        await this.putDeletedMessage({ pub, universeId, messageId, record: { by: adminPair.pub, sig: rec } });
    },

    async putDeletedThread({ pub, universeId, threadId, record }) {
        await this._forumPut(pub, universeId, 'delthr', String(threadId), record);
    },

    async deleteThread({ pub, universeId, threadId, adminPair }) {
        const rec = await this.signDeletion({ adminPair, kind: 'delete_thread', targetId: threadId });
        await this.putDeletedThread({ pub, universeId, threadId, record: { by: adminPair.pub, sig: rec } });
    },

    async putDeletedAccount({ pub, universeId, userPub, record }) {
        await this._forumPut(pub, universeId, 'delacct', String(userPub), record);
    },

    async deleteAccountByAdmin({ pub, universeId, userPub, adminPair }) {
        const rec = await this.signDeletion({ adminPair, kind: 'delete_account', targetId: userPub });
        await this.putDeletedAccount({ pub, universeId, userPub, record: { by: adminPair.pub, sig: rec } });
    },

    async deleteAccountSelf({ pub, universeId, pair }) {
        const userPub = String(pair.pub);
        const rec = await this.signDeletion({ adminPair: pair, kind: 'delete_account', targetId: userPub });
        await this.putDeletedAccount({ pub, universeId, userPub, record: { by: pair.pub, sig: rec } });
    },

    async getDeletedAccountRecord({ pub, universeId, userPub }) {
        const ev = await this._get(
            {
                kinds: [KIND_FORUM_BUCKET],
                '#d': [`arborito:forumv3:delacct:${String(pub)}:${String(universeId)}:${String(userPub)}`],
                limit: 1
            },
            5000
        );
        if (!ev) return null;
        try {
            const raw = JSON.parse(ev.content || 'null');
            const ok = await this.isAuthorizedForumDeletion({
                record: raw,
                kind: 'delete_account',
                targetId: userPub,
                ownerPub: pub,
                universeId
            });
            return ok ? raw : null;
        } catch {
            return null;
        }
    },

    /** Crypto-valid delmsg records per message id (may include unauthorized rows). */
    async loadDeletedMessageRecords({ pub, universeId, max = 800 }) {
        const evs = await this._query({ kinds: [KIND_FORUM_BUCKET], limit: Math.min(2000, Math.max(50, max * 2)) }, 8000);
        const prefix = `arborito:forumv3:delmsg:${String(pub)}:${String(universeId)}:`;
        /** @type {Map<string, object[]>} */
        const out = new Map();
        const cap = Math.max(1, Math.min(2000, Number(max) || 800));
        for (const ev of evs) {
            const d = tagValue(ev, 'd');
            if (!d || !d.startsWith(prefix)) continue;
            const messageId = d.slice(prefix.length);
            if (!messageId) continue;
            try {
                const raw = JSON.parse(ev.content || 'null');
                if (!(await this.verifyDeletionRecord({ record: raw, kind: 'delete_message', targetId: messageId }))) {
                    continue;
                }
                if (!out.has(messageId)) out.set(messageId, []);
                out.get(messageId).push(raw);
                if (out.size >= cap) break;
            } catch {
                /* ignore */
            }
        }
        return out;
    },

    /** Verified message ids with an owner/editor-authorized `delmsg` (no self-delete without author context). */
    async loadDeletedMessageIds({ pub, universeId, max = 800 }) {
        const records = await this.loadDeletedMessageRecords({ pub, universeId, max });
        const out = new Set();
        for (const [messageId, list] of records) {
            const rows = Array.isArray(list) ? list : [list];
            for (const record of rows) {
                if (
                    await this.isAuthorizedForumDeletion({
                        record,
                        kind: 'delete_message',
                        targetId: messageId,
                        ownerPub: pub,
                        universeId
                    })
                ) {
                    out.add(messageId);
                    break;
                }
            }
        }
        return out;
    },

    /** Verified thread ids with an owner/editor-authorized `delthr` tombstone. */
    async loadDeletedThreadIds({ pub, universeId, max = 400 }) {
        const evs = await this._query({ kinds: [KIND_FORUM_BUCKET], limit: Math.min(1000, Math.max(50, max * 2)) }, 8000);
        const prefix = `arborito:forumv3:delthr:${String(pub)}:${String(universeId)}:`;
        const out = new Set();
        const cap = Math.max(1, Math.min(1000, Number(max) || 400));
        for (const ev of evs) {
            const d = tagValue(ev, 'd');
            if (!d || !d.startsWith(prefix)) continue;
            const threadId = d.slice(prefix.length);
            if (!threadId) continue;
            try {
                const raw = JSON.parse(ev.content || 'null');
                if (
                    !(await this.isAuthorizedForumDeletion({
                        record: raw,
                        kind: 'delete_thread',
                        targetId: threadId,
                        ownerPub: pub,
                        universeId
                    }))
                ) {
                    continue;
                }
                out.add(threadId);
                if (out.size >= cap) break;
            } catch {
                /* ignore */
            }
        }
        return out;
    }
};
