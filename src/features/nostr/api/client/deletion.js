/**
 * Signed deletion records: a signing helper that wraps a `{ kind, targetId,
 * at }` JSON payload as an app-signed event, the verifier that pairs with
 * it, and the convenience flows that publish deletion records for forum
 * messages, threads, and accounts (self-delete and admin-delete).
 *
 * Account deletion in particular feeds the directory verifier — readers
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
            const v = await this._verifyJsonPayloadEvent(ev);
            return !!(v && String(v.kind) === String(kind) && String(v.targetId) === String(targetId) && typeof v.at === 'string');
        } catch {
            return false;
        }
    },

    async putDeletedMessage({ pub, universeId, messageId, record }) {
        const ev = record && record.sig ? record.sig : null;
        const wrapped = { ...record, sig: ev };
        void this._forumPut(pub, universeId, 'delmsg', String(messageId), wrapped);
    },

    async deleteMessage({ pub, universeId, messageId, adminPair }) {
        const rec = await this.signDeletion({ adminPair, kind: 'delete_message', targetId: messageId });
        await this.putDeletedMessage({ pub, universeId, messageId, record: { by: adminPair.pub, sig: rec } });
    },

    async putDeletedThread({ pub, universeId, threadId, record }) {
        void this._forumPut(pub, universeId, 'delthr', String(threadId), record);
    },

    async deleteThread({ pub, universeId, threadId, adminPair }) {
        const rec = await this.signDeletion({ adminPair, kind: 'delete_thread', targetId: threadId });
        await this.putDeletedThread({ pub, universeId, threadId, record: { by: adminPair.pub, sig: rec } });
    },

    async putDeletedAccount({ pub, universeId, userPub, record }) {
        void this._forumPut(pub, universeId, 'delacct', String(userPub), record);
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
            const ok = await this.verifyDeletionRecord({ record: raw, kind: 'delete_account', targetId: userPub });
            return ok ? raw : null;
        } catch {
            return null;
        }
    }
};
