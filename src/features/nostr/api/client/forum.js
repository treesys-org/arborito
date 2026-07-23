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
import { hasArbRoot, pairSecretKey, tagValue, assertNostrContentSize, truncateUtf8, slimForumPendingRecord, FORUM_MESSAGE_BODY_MAX, FORUM_THREAD_TITLE_MAX } from './_shared.js';

export const forumMixin = {
    async verifyCollaboratorInviteRecord(record, ownerPub) {
        const v = await this._verify(record.sig, record.by);
        if (!v) return false;
        const role = String(v.role);
        const roleOk = role === 'editor' || role === 'proposer' || role === 'none';
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
        /* Newest replaceable per invitee wins so `role: 'none'` removals stick. */
        const newestByInvitee = new Map();
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
            const inviteePub = String(v.inviteePub || '').trim();
            if (!inviteePub) continue;
            const at = Number(ev.created_at) || 0;
            const prev = newestByInvitee.get(inviteePub);
            if (!prev || at >= prev.at) {
                newestByInvitee.set(inviteePub, { v, at });
            }
        }
        const out = [];
        for (const { v } of newestByInvitee.values()) {
            const role = String(v.role);
            if (role !== 'editor' && role !== 'proposer') continue;
            out.push({
                inviteePub: String(v.inviteePub),
                inviteeUsername: String(v.inviteeUsername || '').trim(),
                role,
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
        const username = truncateUtf8(String(inviteeUsername || '').trim(), 64);
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
            body: truncateUtf8(String(message.body || ''), FORUM_MESSAGE_BODY_MAX),
            createdAt: String(message.createdAt || ''),
            authorPub: String((message.author && message.author.pub) || ''),
            authorName: truncateUtf8(String((message.author && message.author.name) || ''), 120),
            authorAvatar: truncateUtf8(String((message.author && message.author.avatar) || '💬'), 32),
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
            /* Slim pending records omit outer `body`; recover it from the signed payload. */
            const effectiveBody =
                message.body != null && String(message.body) !== ''
                    ? String(message.body)
                    : String(v.body || '');
            const fieldsOk =
                String(v.id) === String(message.id) &&
                String(v.threadId) === String(message.threadId) &&
                String(v.body) === effectiveBody &&
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
        const safe = thread && typeof thread === 'object' ? { ...thread } : {};
        if (safe.title != null) safe.title = truncateUtf8(String(safe.title), FORUM_THREAD_TITLE_MAX);
        if (safe.name != null) safe.name = truncateUtf8(String(safe.name), FORUM_THREAD_TITLE_MAX);
        if (safe.body != null) safe.body = truncateUtf8(String(safe.body), FORUM_MESSAGE_BODY_MAX);
        await this._forumPut(pub, universeId, 'threadV3', `${this._placeKey(placeId)}:${safe.id}`, {
            ...safe,
            powBits: pow.powBits,
            powNonce: pow.powNonce
        });
    },

    _placeKey(placeId) {
        return placeId == null || placeId === '' ? '_general' : String(placeId);
    },

    async _forumPut(pub, universeId, bucket, key, obj, signerPair = null) {
        const w = signerPair?.priv ? signerPair : this._authWriterPair();
        if (!w?.priv) throw new Error('forum put: missing signer');
        const d = `arborito:forumv3:${bucket}:${String(pub)}:${String(universeId)}:${String(key)}`;
        const content = JSON.stringify(obj);
        assertNostrContentSize(content, 'forum bucket');
        const ev = finalizeEvent(
            {
                kind: KIND_FORUM_BUCKET,
                created_at: Math.floor(Date.now() / 1000),
                tags: [['d', d], arbRootTag(pub, universeId)],
                content
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

    putThreadPageRefV3({ pub, universeId, threadId, pageKey, ref, signerPair = null }) {
        return this._forumPut(pub, universeId, 'page', `${threadId}:${pageKey}`, ref, signerPair);
    },

    /**
     * Load every author\'s page ref for this thread/week (NIP-33 is per-author).
     * Callers merge magnets so concurrent posts and hostile overwrites cannot
     * hide messages that still exist on another author\'s page.
     */
    async loadThreadPageRefCandidatesV3({ pub, universeId, threadId, pageKey }) {
        const d = `arborito:forumv3:page:${String(pub)}:${String(universeId)}:${String(threadId)}:${String(pageKey || '')}`;
        const evs = await this._query({ kinds: [KIND_FORUM_BUCKET], '#d': [d], limit: 40 }, 8000);
        const byAuthor = new Map();
        for (const ev of evs || []) {
            if (!hasArbRoot(ev, pub, universeId)) continue;
            if (!verifyEvent(ev)) continue;
            const pk = String(ev.pubkey || '');
            if (!pk) continue;
            const prev = byAuthor.get(pk);
            if (prev && (Number(ev.created_at) || 0) < (Number(prev.created_at) || 0)) continue;
            try {
                const ref = JSON.parse(ev.content || 'null');
                if (ref && typeof ref === 'object' && ref.magnet && ref.path) {
                    byAuthor.set(pk, { ref, created_at: Number(ev.created_at) || 0, pubkey: pk });
                }
            } catch {
                /* ignore */
            }
        }
        return [...byAuthor.values()].sort((a, b) => b.created_at - a.created_at);
    },

    async loadThreadPageRefV3({ pub, universeId, threadId, pageKey }) {
        const candidates = await this.loadThreadPageRefCandidatesV3({ pub, universeId, threadId, pageKey });
        return candidates[0]?.ref || null;
    },

    async loadThreadPageRefsV3({ pub, universeId, threadId }) {
        const evs = await this._query({ kinds: [KIND_FORUM_BUCKET], limit: 600 }, 8000);
        const map = new Map();
        const prefix = `arborito:forumv3:page:${String(pub)}:${String(universeId)}:${String(threadId)}:`;
        for (const ev of evs) {
            const d = tagValue(ev, 'd');
            if (!d || !d.startsWith(prefix)) continue;
            if (!hasArbRoot(ev, pub, universeId)) continue;
            if (!verifyEvent(ev)) continue;
            const pk = d.slice(prefix.length);
            const at = Number(ev.created_at) || 0;
            const prev = map.get(pk);
            if (prev && at < (prev._at || 0)) continue;
            try {
                const ref = JSON.parse(ev.content || 'null');
                if (ref && typeof ref === 'object') map.set(pk, { ...ref, _at: at });
            } catch {
                /* ignore */
            }
        }
        for (const [k, v] of map) {
            const { _at, ...ref } = v;
            map.set(k, ref);
        }
        return map;
    },

    putForumSearchRefV3({ pub, universeId, pageKey, ref, signerPair = null }) {
        return this._forumPut(pub, universeId, 'search', String(pageKey || ''), ref, signerPair);
    },

    /** Newest-per-author search refs for one week key. */
    async loadForumSearchRefCandidatesV3({ pub, universeId, pageKey }) {
        const d = `arborito:forumv3:search:${String(pub)}:${String(universeId)}:${String(pageKey || '')}`;
        const evs = await this._query({ kinds: [KIND_FORUM_BUCKET], '#d': [d], limit: 40 }, 8000);
        const byAuthor = new Map();
        for (const ev of evs || []) {
            if (!hasArbRoot(ev, pub, universeId)) continue;
            if (!verifyEvent(ev)) continue;
            const pk = String(ev.pubkey || '');
            if (!pk) continue;
            const prev = byAuthor.get(pk);
            if (prev && (Number(ev.created_at) || 0) < (Number(prev.created_at) || 0)) continue;
            try {
                const ref = JSON.parse(ev.content || 'null');
                if (ref && typeof ref === 'object' && ref.magnet && ref.path) {
                    byAuthor.set(pk, { ref, created_at: Number(ev.created_at) || 0, pubkey: pk });
                }
            } catch {
                /* ignore */
            }
        }
        return [...byAuthor.values()].sort((a, b) => b.created_at - a.created_at);
    },

    async loadForumSearchRefsV3({ pub, universeId }) {
        const evs = await this._query({ kinds: [KIND_FORUM_BUCKET], limit: 600 }, 8000);
        const map = new Map();
        const prefix = `arborito:forumv3:search:${String(pub)}:${String(universeId)}:`;
        for (const ev of evs) {
            const d = tagValue(ev, 'd');
            if (!d || !d.startsWith(prefix)) continue;
            if (!hasArbRoot(ev, pub, universeId)) continue;
            if (!verifyEvent(ev)) continue;
            const pk = d.slice(prefix.length);
            const at = Number(ev.created_at) || 0;
            const prev = map.get(pk);
            if (prev && at < (prev._at || 0)) continue;
            try {
                const ref = JSON.parse(ev.content || 'null');
                if (ref && typeof ref === 'object' && ref.magnet && ref.path) {
                    map.set(pk, { ...ref, _at: at });
                }
            } catch {
                /* ignore */
            }
        }
        for (const [k, v] of map) {
            const { _at, ...ref } = v;
            map.set(k, ref);
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
    putPendingForumMessageV3({ pub, universeId, messageId, record, signerPair = null }) {
        const slim = slimForumPendingRecord(record);
        return this._forumPut(pub, universeId, 'pending', String(messageId || '').trim(), slim, signerPair);
    },

    async loadPendingForumMessageV3({ pub, universeId, messageId }) {
        const mid = String(messageId || '').trim();
        if (!mid) return null;
        const evs = await this._query(
            {
                kinds: [KIND_FORUM_BUCKET],
                '#d': [`arborito:forumv3:pending:${String(pub)}:${String(universeId)}:${mid}`],
                limit: 20
            },
            4000
        );
        const editors = await this._loadForumEditorSetOnce({ ownerPub: pub, universeId });
        let clearAt = -1;
        let best = null;
        let bestAt = -1;
        for (const ev of evs || []) {
            if (!hasArbRoot(ev, pub, universeId)) continue;
            if (!verifyEvent(ev)) continue;
            const at = Number(ev.created_at) || 0;
            const pk = String(ev.pubkey || '');
            let raw;
            try {
                raw = JSON.parse(ev.content || 'null');
            } catch {
                continue;
            }
            const empty = raw == null || (typeof raw === 'object' && !raw.sig);
            if (empty) {
                /* Only owner/editor tombstones can clear the queue. */
                if (editors.has(pk) && at >= clearAt) clearAt = at;
                continue;
            }
            if (!(await this.verifyForumMessage({ message: raw, treeRef: { pub, universeId } }))) {
                continue;
            }
            let hydrated = raw;
            if (raw && (raw.body == null || String(raw.body) === '') && raw.sig) {
                try {
                    const authorPub = String((raw.author && raw.author.pub) || '');
                    const v = authorPub ? await this._verify(raw.sig, authorPub) : null;
                    if (v && v.body != null) hydrated = { ...raw, body: String(v.body) };
                } catch {
                    /* keep slim record */
                }
            }
            if (at > bestAt) {
                best = hydrated;
                bestAt = at;
            }
        }
        if (clearAt >= 0 && clearAt >= bestAt) return null;
        return best;
    },

    async listPendingForumMessageIdsV3({ pub, universeId, max = 120 }) {
        const evs = await this._query({ kinds: [KIND_FORUM_BUCKET], limit: 400 }, 6000);
        const prefix = `arborito:forumv3:pending:${String(pub)}:${String(universeId)}:`;
        const editors = await this._loadForumEditorSetOnce({ ownerPub: pub, universeId });
        /** @type {Map<string, { clearAt: number, msgAt: number }>} */
        const byId = new Map();
        for (const ev of evs) {
            const d = tagValue(ev, 'd');
            if (!d || !d.startsWith(prefix)) continue;
            if (!hasArbRoot(ev, pub, universeId)) continue;
            if (!verifyEvent(ev)) continue;
            const mid = d.slice(prefix.length);
            if (!mid) continue;
            const at = Number(ev.created_at) || 0;
            const pk = String(ev.pubkey || '');
            if (!byId.has(mid)) byId.set(mid, { clearAt: -1, msgAt: -1 });
            const row = byId.get(mid);
            let raw;
            try {
                raw = JSON.parse(ev.content || 'null');
            } catch {
                continue;
            }
            const empty = raw == null || (typeof raw === 'object' && !raw.sig);
            if (empty) {
                if (editors.has(pk) && at >= row.clearAt) row.clearAt = at;
                continue;
            }
            if (raw && typeof raw === 'object' && raw.sig && at > row.msgAt) row.msgAt = at;
        }
        const out = [];
        const cap = Math.max(1, Math.min(500, Number(max) || 120));
        for (const [mid, row] of byId) {
            if (row.msgAt < 0) continue;
            if (row.clearAt >= 0 && row.clearAt >= row.msgAt) continue;
            out.push(mid);
            if (out.length >= cap) break;
        }
        return out;
    },

    /**
     * Clear pending requires owner/editor signer — not the throwaway auth writer.
     */
    async clearPendingForumMessageV3({ pub, universeId, messageId, adminPair }) {
        if (!adminPair?.priv) throw new Error('clearPending: admin signer required');
        await this._forumPut(pub, universeId, 'pending', String(messageId || '').trim(), null, adminPair);
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
            const by = String(ev.pubkey || '');
            if (!by) return false;
            /* Claimed `by` must match the inner event signer (no spoofed owner/editor). */
            if (record.by != null && String(record.by) !== by) return false;
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
        const prefix = `arborito:forumv3:ban:${String(ownerPub)}:${String(universeId)}:`;
        /** @type {Map<string, { at: number, action: string, targetPub: string }>} */
        const newestByTarget = new Map();
        let scanned = 0;
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
            if (!inner) continue;
            const targetPub = String(rec.targetPub || inner.targetPub || '');
            if (!targetPub) continue;
            const at = Number(ev.created_at) || 0;
            const prev = newestByTarget.get(targetPub);
            if (!prev || at >= prev.at) {
                newestByTarget.set(targetPub, {
                    at,
                    action: String(inner.action || ''),
                    targetPub
                });
            }
        }
        for (const row of newestByTarget.values()) {
            if (row.action === 'ban') banned.add(row.targetPub);
        }
        return banned;
    }
};
