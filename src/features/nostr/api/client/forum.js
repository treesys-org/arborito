/**
 * Forum v3 live read/write surface: thread/message buckets keyed by
 * `arborito:forumv3:*` d-tags, moderation policy + pending-message queue
 * for strict-mode forums, ban records (verified against the cached
 * editor set), and the collaborator-invite records that feed
 * `_loadForumEditorSetOnce`.
 *
 * Per-message signing helpers (`signForumMessage`/`verifyForumMessage`)
 * also live here since they only make sense inside the forum flow.
 */

import { finalizeEvent, verifyEvent } from '../../../../../vendor/nostr-tools/lib/esm/index.js';
import {
    KIND_APP_SIGNED_PAYLOAD,
    KIND_FORUM_BUCKET,
    arbRootTag
} from '../nostr-spec.js';
import { hasArbRoot, pairSecretKey, tagValue } from './_shared.js';

export const forumMixin = {
    async verifyCollaboratorInviteRecord(record, ownerPub) {
        const v = await this._verify(record.sig, record.by);
        if (!v) return false;
        const roleOk = String(v.role) === 'editor' || String(v.role) === 'proposer';
        return (
            String(v.kind) === 'collab_invite' &&
            roleOk &&
            String(v.ownerPub) === String(ownerPub) &&
            String(v.universeId) === String(record.universeId) &&
            String(v.inviteePub) === String(record.inviteePub)
        );
    },

    async loadCollaboratorInvites({ ownerPub, universeId }) {
        const evs = await this._query(
            {
                kinds: [KIND_APP_SIGNED_PAYLOAD],
                authors: [String(ownerPub)],
                '#m': [this.metricKindName('collab')],
                limit: 500
            },
            8000
        );
        const out = [];
        for (const ev of evs) {
            if (!hasArbRoot(ev, ownerPub, universeId)) continue;
            let v;
            try {
                v = JSON.parse(ev.content || 'null');
            } catch {
                continue;
            }
            if (!v || typeof v !== 'object') continue;
            const ok = await this.verifyCollaboratorInviteRecord(v, ownerPub);
            if (!ok) continue;
            out.push({
                inviteePub: String(v.inviteePub),
                inviteeUsername: String(v.inviteeUsername || '').trim(),
                role: String(v.role),
                invitedAt: typeof v.invitedAt === 'string' ? v.invitedAt : ''
            });
        }
        return out;
    },

    async putCollaboratorInvite({ ownerPair, universeId, inviteePub, inviteeUsername, role }) {
        const r = role === 'proposer' ? 'proposer' : 'editor';
        const payload = {
            kind: 'collab_invite',
            ownerPub: String(ownerPair.pub),
            universeId: String(universeId),
            inviteePub: String(inviteePub).trim(),
            role: r,
            invitedAt: new Date().toISOString()
        };
        const username = String(inviteeUsername || '').trim();
        if (username) payload.inviteeUsername = username;
        const inner = await this._signJsonPayload(ownerPair, payload);
        const ev = await this._finalize(ownerPair, {
            kind: KIND_APP_SIGNED_PAYLOAD,
            tags: [
                arbRootTag(ownerPair.pub, universeId),
                ['m', this.metricKindName('collab')],
                ['d', `collab:${ownerPair.pub}:${universeId}:${inviteePub}`]
            ],
            content: JSON.stringify({ ...payload, by: ownerPair.pub, sig: inner })
        });
        await this._publish(ev);
    },

    async removeCollaboratorInvite({ ownerPair, universeId, inviteePub }) {
        const payload = {
            kind: 'collab_invite',
            ownerPub: String(ownerPair.pub),
            universeId: String(universeId),
            inviteePub: String(inviteePub).trim(),
            role: 'none',
            invitedAt: new Date().toISOString()
        };
        const inner = await this._signJsonPayload(ownerPair, payload);
        const ev = await this._finalize(ownerPair, {
            kind: KIND_APP_SIGNED_PAYLOAD,
            tags: [
                arbRootTag(ownerPair.pub, universeId),
                ['m', this.metricKindName('collab')],
                ['d', `collab:${ownerPair.pub}:${universeId}:${inviteePub}`]
            ],
            content: JSON.stringify({ ...payload, by: ownerPair.pub, sig: inner })
        });
        await this._publish(ev);
    },

    /**
     * Signs a forum message with the author pair AND embeds a proof-of-work
     * bound to the tree + thread + author inside the signed payload, so a
     * relay/torrent peer cannot strip it and readers can price-gate floods.
     * `treeRef` = `{ pub, universeId }` of the public tree.
     */
    async signForumMessage({ pair, message, treeRef }) {
        const ownerPub = String((treeRef && (treeRef.pub || treeRef.ownerPub)) || '');
        const universeId = String((treeRef && treeRef.universeId) || '');
        const pow = await this._solvePow(
            'forum_message_v1',
            ownerPub,
            universeId,
            `msg:${String(message.threadId)}`,
            pair.pub,
            this._powBits('forum_message_v1')
        );
        const payload = {
            id: String(message.id),
            threadId: String(message.threadId),
            body: String(message.body || ''),
            createdAt: String(message.createdAt || ''),
            authorPub: String((message.author && message.author.pub) || ''),
            authorName: String((message.author && message.author.name) || ''),
            authorAvatar: String((message.author && message.author.avatar) || '💬'),
            parentId: String(message.parentId || ''),
            ownerPub,
            universeId,
            powBits: pow.powBits,
            powNonce: pow.powNonce
        };
        const inner = await this._signJsonPayload(pair, payload);
        return { ...message, sig: inner, author: message.author };
    },

    /**
     * STRICT: unsigned messages are rejected. Forum pages are untrusted JSON
     * pulled from arbitrary peers, accepting sig-less "legacy-shaped"
     * entries let anyone inject anonymous posts at zero cost. Signature,
     * field binding AND per-message PoW are all required.
     */
    async verifyForumMessage({ message, treeRef }) {
        try {
            if (!(message && message.sig)) return false;
            const authorPub = String((message.author && message.author.pub) || '');
            if (!authorPub) return false;
            const v = await this._verify(message.sig, authorPub);
            if (!v) return false;
            const fieldsOk =
                String(v.id) === String(message.id) &&
                String(v.threadId) === String(message.threadId) &&
                String(v.body) === String(message.body || '') &&
                String(v.createdAt) === String(message.createdAt || '') &&
                String(v.authorPub) === authorPub &&
                String(v.authorName) === String((message.author && message.author.name) || '') &&
                String(v.authorAvatar) === String((message.author && message.author.avatar) || '💬') &&
                String(v.parentId || '') === String(message.parentId || '');
            if (!fieldsOk) return false;
            const ownerPub = String((treeRef && (treeRef.pub || treeRef.ownerPub)) || v.ownerPub || '');
            const universeId = String((treeRef && treeRef.universeId) || v.universeId || '');
            if (treeRef) {
                if (String(v.ownerPub || '') !== ownerPub || String(v.universeId || '') !== universeId) return false;
            }
            return this._verifyPow(
                'forum_message_v1',
                ownerPub,
                universeId,
                `msg:${String(v.threadId)}`,
                authorPub,
                v.powBits,
                v.powNonce
            );
        } catch {
            return false;
        }
    },

    async addThreadV3({ pub, universeId, placeId, thread }) {
        const writer = this._authWriterPair();
        const pow = await this._solvePow(
            'forum_thread_v1',
            pub,
            universeId,
            `thread:${String(thread.id)}`,
            writer.pub,
            this._powBits('forum_thread_v1')
        );
        await this._forumPut(pub, universeId, 'threadV3', `${this._placeKey(placeId)}:${thread.id}`, {
            ...thread,
            powBits: pow.powBits,
            powNonce: pow.powNonce
        });
    },

    _placeKey(placeId) {
        return placeId == null || placeId === '' ? '_general' : String(placeId);
    },

    async _forumPut(pub, universeId, bucket, key, obj) {
        const w = this._authWriterPair();
        const d = `arborito:forumv3:${bucket}:${String(pub)}:${String(universeId)}:${String(key)}`;
        const ev = finalizeEvent(
            {
                kind: KIND_FORUM_BUCKET,
                created_at: Math.floor(Date.now() / 1000),
                tags: [['d', d], arbRootTag(pub, universeId)],
                content: JSON.stringify(obj)
            },
            pairSecretKey(w)
        );
        await this._publish(ev);
    },

    async loadThreadsByPlaceV3({ pub, universeId, placeId }) {
        const pk = this._placeKey(placeId);
        const evs = await this._query(
            {
                kinds: [KIND_FORUM_BUCKET],
                limit: 400
            },
            12000
        );
        const out = [];
        const prefix = `arborito:forumv3:threadV3:${String(pub)}:${String(universeId)}:${pk}:`;
        for (const ev of evs) {
            const d = tagValue(ev, 'd');
            if (!d || !d.startsWith(prefix)) continue;
            if (!hasArbRoot(ev, pub, universeId)) continue;
            if (!verifyEvent(ev)) continue;
            try {
                const t = JSON.parse(ev.content || 'null');
                if (!(t && typeof t === 'object' && t.id)) continue;
                /* Thread creation is price-gated: the PoW is bound to the tree
                 * + thread id + the writer key that signed the bucket event. */
                const powOk = await this._verifyPow(
                    'forum_thread_v1',
                    pub,
                    universeId,
                    `thread:${String(t.id)}`,
                    String(ev.pubkey || ''),
                    t.powBits,
                    t.powNonce
                );
                if (!powOk) continue;
                out.push(t);
            } catch {
                /* ignore */
            }
        }
        return out;
    },

    putThreadPageRefV3({ pub, universeId, threadId, pageKey, ref }) {
        void this._forumPut(pub, universeId, 'page', `${threadId}:${pageKey}`, ref);
    },

    async loadThreadPageRefsV3({ pub, universeId, threadId }) {
        const evs = await this._query({ kinds: [KIND_FORUM_BUCKET], limit: 600 }, 8000);
        const map = new Map();
        const prefix = `arborito:forumv3:page:${String(pub)}:${String(universeId)}:${String(threadId)}:`;
        for (const ev of evs) {
            const d = tagValue(ev, 'd');
            if (!d || !d.startsWith(prefix)) continue;
            if (!hasArbRoot(ev, pub, universeId)) continue;
            const pk = d.slice(prefix.length);
            try {
                map.set(pk, JSON.parse(ev.content || 'null'));
            } catch {
                /* ignore */
            }
        }
        return map;
    },

    async loadThreadPageRefV3({ pub, universeId, threadId, pageKey }) {
        const m = await this.loadThreadPageRefsV3({ pub, universeId, threadId });
        return m.get(String(pageKey || '')) || null;
    },

    putForumSearchRefV3({ pub, universeId, pageKey, ref }) {
        void this._forumPut(pub, universeId, 'search', String(pageKey || ''), ref);
    },

    async loadForumSearchRefsV3({ pub, universeId }) {
        const evs = await this._query({ kinds: [KIND_FORUM_BUCKET], limit: 600 }, 8000);
        const map = new Map();
        const prefix = `arborito:forumv3:search:${String(pub)}:${String(universeId)}:`;
        for (const ev of evs) {
            const d = tagValue(ev, 'd');
            if (!d || !d.startsWith(prefix)) continue;
            if (!hasArbRoot(ev, pub, universeId)) continue;
            const pk = d.slice(prefix.length);
            try {
                map.set(pk, JSON.parse(ev.content || 'null'));
            } catch {
                /* ignore */
            }
        }
        return map;
    },

    /** Strict moderation policy: 'free' (default) or 'strict' (hold messages until owner approves). */
    async putForumModerationPolicyV3({ pub, universeId, adminPair, mode }) {
        const m = mode === 'strict' ? 'strict' : 'free';
        const uid = String(universeId || '');
        const payload = { v: 1, mode: m, universeId: uid, at: new Date().toISOString() };
        const ev = await this._finalize(adminPair, {
            kind: KIND_FORUM_BUCKET,
            tags: [arbRootTag(pub, universeId), ['d', `arborito:forumv3:policy:${pub}:${universeId}`]],
            content: JSON.stringify(payload)
        });
        await this._publish(ev);
    },

    async loadForumModerationPolicyV3({ pub, universeId }) {
        const ev = await this._get(
            {
                kinds: [KIND_FORUM_BUCKET],
                authors: [String(pub)],
                '#d': [`arborito:forumv3:policy:${pub}:${universeId}`],
                limit: 1
            },
            5000
        );
        if (!ev || !verifyEvent(ev)) return 'free';
        try {
            const v = JSON.parse(ev.content || 'null');
            if (!v || String(v.v) !== '1' || String(v.universeId) !== String(universeId)) return 'free';
            return v.mode === 'strict' ? 'strict' : 'free';
        } catch {
            return 'free';
        }
    },

    /** Pending forum messages (strict mode): a record per messageId held for owner approval. */
    putPendingForumMessageV3({ pub, universeId, messageId, record }) {
        void this._forumPut(pub, universeId, 'pending', String(messageId || '').trim(), record);
    },

    async loadPendingForumMessageV3({ pub, universeId, messageId }) {
        const mid = String(messageId || '').trim();
        if (!mid) return null;
        const ev = await this._get(
            {
                kinds: [KIND_FORUM_BUCKET],
                '#d': [`arborito:forumv3:pending:${String(pub)}:${String(universeId)}:${mid}`],
                limit: 1
            },
            4000
        );
        if (!ev) return null;
        try {
            return JSON.parse(ev.content || 'null');
        } catch {
            return null;
        }
    },

    async listPendingForumMessageIdsV3({ pub, universeId, max = 120 }) {
        const evs = await this._query({ kinds: [KIND_FORUM_BUCKET], limit: 400 }, 6000);
        const prefix = `arborito:forumv3:pending:${String(pub)}:${String(universeId)}:`;
        const out = [];
        const cap = Math.max(1, Math.min(500, Number(max) || 120));
        for (const ev of evs) {
            const d = tagValue(ev, 'd');
            if (!d || !d.startsWith(prefix)) continue;
            out.push(d.slice(prefix.length));
            if (out.length >= cap) break;
        }
        return out;
    },

    clearPendingForumMessageV3({ pub, universeId, messageId }) {
        void this._forumPut(pub, universeId, 'pending', String(messageId || '').trim(), null);
    },

    async signForumBanV3(pair, { ownerPub, universeId, targetPub, action = 'ban' }) {
        const a = String(action || '').toLowerCase() === 'unban' ? 'unban' : 'ban';
        const payload = {
            kind: 'forum_ban_v1',
            ownerPub: String(ownerPub),
            universeId: String(universeId),
            targetPub: String(targetPub),
            action: a,
            at: new Date().toISOString()
        };
        return this._signJsonPayload(pair, payload);
    },

    async _loadForumEditorSetOnce({ ownerPub, universeId }) {
        const k = `${String(ownerPub)}:${String(universeId)}`;
        const now = Date.now();
        if ((this._forumEditorsCache && this._forumEditorsCache.key) === k && now - (this._forumEditorsCache.t || 0) < 120_000) {
            return this._forumEditorsCache.set || new Set();
        }
        const set = new Set([String(ownerPub)]);
        try {
            const rows = await this.loadCollaboratorInvites({ ownerPub, universeId });
            for (const row of rows) {
                if (row.role === 'editor' && row.inviteePub) set.add(String(row.inviteePub));
            }
        } catch {
            /* ignore */
        }
        this._forumEditorsCache = { key: k, t: now, set };
        return set;
    },

    async verifyForumBanV3(record, ownerPub, universeId) {
        try {
            const ev = record && record.sig && typeof record.sig === 'object' ? record.sig : null;
            if (!ev || !verifyEvent(ev)) return false;
            const by = String(record.by || ev.pubkey || '');
            const allowed = await this._loadForumEditorSetOnce({ ownerPub, universeId });
            if (!allowed.has(by)) return false;
            const v = await this._verifyJsonPayloadEvent(ev);
            return (
                !!v &&
                String(v.kind) === 'forum_ban_v1' &&
                String(v.ownerPub) === String(ownerPub) &&
                String(v.universeId) === String(universeId) &&
                String(v.targetPub) === String(record.targetPub) &&
                (v.action === 'ban' || v.action === 'unban')
            );
        } catch {
            return false;
        }
    },

    async putForumBanV3({ ownerPub, universeId, pair, targetPub, action = 'ban' }) {
        const inner = await this.signForumBanV3(pair, { ownerPub, universeId, targetPub, action });
        const ev = await this._finalize(pair, {
            kind: KIND_FORUM_BUCKET,
            tags: [
                arbRootTag(ownerPub, universeId),
                ['d', `arborito:forumv3:ban:${ownerPub}:${universeId}:${targetPub}`]
            ],
            content: JSON.stringify({ targetPub, by: pair.pub, sig: inner })
        });
        await this._publish(ev);
        return { targetPub, by: pair.pub, sig: inner };
    },

    async loadForumBansV3({ ownerPub, universeId, max = 1200 }) {
        const evs = await this._query({ kinds: [KIND_FORUM_BUCKET], limit: Math.min(3000, max * 2) }, 8000);
        const banned = new Set();
        let scanned = 0;
        const prefix = `arborito:forumv3:ban:${String(ownerPub)}:${String(universeId)}:`;
        for (const ev of evs) {
            const d = tagValue(ev, 'd');
            if (!d || !d.startsWith(prefix)) continue;
            if (!hasArbRoot(ev, ownerPub, universeId)) continue;
            if (scanned++ > max) break;
            let rec;
            try {
                rec = JSON.parse(ev.content || 'null');
            } catch {
                continue;
            }
            if (!rec || typeof rec !== 'object') continue;
            const ok = await this.verifyForumBanV3({ ...rec, sig: rec.sig }, ownerPub, universeId);
            if (!ok) continue;
            const inner = await this._verifyJsonPayloadEvent(rec.sig);
            if (inner && inner.action === 'ban') banned.add(String(rec.targetPub));
            else banned.delete(String(rec.targetPub));
        }
        return banned;
    }
};
