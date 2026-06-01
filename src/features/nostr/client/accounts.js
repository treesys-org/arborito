/**
 * Per-username account records: the sync-login hash, identity claim, the
 * passphrase-encrypted user-pair escrow, the encrypted installed-sources
 * blob, and one encrypted private-tree blob per local tree id. All of these
 * are published under the throwaway auth-writer pair (so relays can verify
 * the signature) while the user's true identity stays in the payload.
 */

import { finalizeEvent } from '../../../../vendor/nostr-tools/lib/esm/index.js';
import {
    KIND_ACCOUNT_USER_PAIR_ESCROW,
    KIND_PRIVATE_TREE_BLOB,
    KIND_USER_ACCOUNT_RECORD,
    KIND_USER_SOURCES,
    TAG_APP,
    TAG_APP_VALUE,
    accountEscrowDTag,
    privateTreeDTag,
    userSourcesDTag
} from '../nostr-spec.js';
import { pairSecretKey, tagValue } from './_shared.js';

export const accountsMixin = {
    async loadSyncLoginRecordOnce(username) {
        const ev = await this._get(
            {
                kinds: [KIND_USER_ACCOUNT_RECORD],
                '#u': [String(username || '').trim()],
                '#cid': ['sync-login-v1'],
                limit: 1
            },
            6000
        );
        if (!ev) return null;
        try {
            const raw = JSON.parse(ev.content || 'null');
            const h = String(raw?.hash || '').trim();
            if (!h) return null;
            return { v: Number(raw.v) || 1, hash: h, updatedAt: String(raw.updatedAt || '') };
        } catch {
            return null;
        }
    },

    /**
     * Publish (or clear, when `hash === ''`) the sync-login record for `username`.
     *
     * Awaits the publish promise so callers learn if every relay rejected the event
     * (e.g. NIP-20 «blocked: only notes signed by the owner…», «restricted», «auth-required»,
     * «public key does not have permission to write…», or pure connectivity timeouts).
     * Throws the underlying error so the UI can show an accurate message instead of
     * silently establishing a local session that has no record on the network.
     */
    async putSyncLoginHash({ username, hash }) {
        const u = String(username || '').trim();
        if (!u) return false;
        const h = String(hash || '').trim();
        const w = this._authWriterPair();
        const rec = { v: 1, hash: h, updatedAt: new Date().toISOString() };
        const ev = finalizeEvent(
            {
                kind: KIND_USER_ACCOUNT_RECORD,
                created_at: Math.floor(Date.now() / 1000),
                tags: [
                    [TAG_APP, TAG_APP_VALUE],
                    ['u', u],
                    ['cid', 'sync-login-v1']
                ],
                content: JSON.stringify(rec)
            },
            pairSecretKey(w)
        );
        await this._publish(ev);
        return true;
    },

    async clearSyncLoginRecord(username) {
        return this.putSyncLoginHash({ username, hash: '' });
    },

    putIdentityClaim({ username, record }) {
        const u = String(username || '').trim();
        if (!u || !record || typeof record !== 'object') return false;
        const w = this._authWriterPair();
        const ev = finalizeEvent(
            {
                kind: KIND_USER_ACCOUNT_RECORD,
                created_at: Math.floor(Date.now() / 1000),
                tags: [
                    [TAG_APP, TAG_APP_VALUE],
                    ['u', u],
                    ['cid', 'identity-v1']
                ],
                content: JSON.stringify(record)
            },
            pairSecretKey(w)
        );
        void this._publish(ev);
        return true;
    },

    async loadIdentityClaimOnce(username) {
        const ev = await this._get(
            {
                kinds: [KIND_USER_ACCOUNT_RECORD],
                '#u': [String(username || '').trim()],
                '#cid': ['identity-v1'],
                limit: 1
            },
            5000
        );
        if (!ev) return null;
        try {
            return JSON.parse(ev.content || 'null');
        } catch {
            return null;
        }
    },

    /**
     * Publish the passphrase-encrypted user pair under the username so a fresh
     * device with the sync secret can recover the pair (and therefore decrypt
     * everything else: progress, sources, private trees).
     *
     * The blob is already encrypted: this call only signs + publishes.
     * @param {{ username: string, escrow: object }} args
     */
    putAccountUserPairEscrow({ username, escrow }) {
        const u = String(username || '').trim();
        if (!u || !escrow || typeof escrow !== 'object') return false;
        const w = this._authWriterPair();
        const ev = finalizeEvent(
            {
                kind: KIND_ACCOUNT_USER_PAIR_ESCROW,
                created_at: Math.floor(Date.now() / 1000),
                tags: [
                    [TAG_APP, TAG_APP_VALUE],
                    ['d', accountEscrowDTag(u)],
                    ['u', u]
                ],
                content: JSON.stringify(escrow)
            },
            pairSecretKey(w)
        );
        void this._publish(ev);
        return true;
    },

    /** @returns {Promise<object|null>} */
    async loadAccountUserPairEscrowOnce(username) {
        const u = String(username || '').trim();
        if (!u) return null;
        const ev = await this._get(
            {
                kinds: [KIND_ACCOUNT_USER_PAIR_ESCROW],
                '#d': [accountEscrowDTag(u)],
                limit: 1
            },
            6000
        );
        if (!ev) return null;
        try {
            return JSON.parse(ev.content || 'null');
        } catch {
            return null;
        }
    },

    /**
     * Publish encrypted installed-sources blob (replaceable).
     * @param {{ username: string, encryptedContent: string }} args
     */
    putUserSourcesEncrypted({ username, encryptedContent }) {
        const u = String(username || '').trim();
        const ct = String(encryptedContent || '').trim();
        if (!u || !ct) return false;
        const w = this._authWriterPair();
        const ev = finalizeEvent(
            {
                kind: KIND_USER_SOURCES,
                created_at: Math.floor(Date.now() / 1000),
                tags: [
                    [TAG_APP, TAG_APP_VALUE],
                    ['d', userSourcesDTag(u)],
                    ['u', u]
                ],
                content: ct
            },
            pairSecretKey(w)
        );
        void this._publish(ev);
        return true;
    },

    /** @returns {Promise<string>} ciphertext (caller decrypts) */
    async loadUserSourcesEncryptedOnce(username) {
        const u = String(username || '').trim();
        if (!u) return '';
        const ev = await this._get(
            {
                kinds: [KIND_USER_SOURCES],
                '#d': [userSourcesDTag(u)],
                limit: 1
            },
            6000
        );
        return ev ? String(ev.content || '') : '';
    },

    /**
     * @param {{ username: string, treeId: string, encryptedContent: string }} args
     */
    putPrivateTreeBlob({ username, treeId, encryptedContent }) {
        const u = String(username || '').trim();
        const id = String(treeId || '').trim();
        const ct = String(encryptedContent || '').trim();
        if (!u || !id || !ct) return false;
        const w = this._authWriterPair();
        const ev = finalizeEvent(
            {
                kind: KIND_PRIVATE_TREE_BLOB,
                created_at: Math.floor(Date.now() / 1000),
                tags: [
                    [TAG_APP, TAG_APP_VALUE],
                    ['d', privateTreeDTag(u, id)],
                    ['u', u],
                    ['t', id]
                ],
                content: ct
            },
            pairSecretKey(w)
        );
        void this._publish(ev);
        return true;
    },

    /** Remove a private tree blob (publishes an empty replaceable event). */
    clearPrivateTreeBlob({ username, treeId }) {
        const u = String(username || '').trim();
        const id = String(treeId || '').trim();
        if (!u || !id) return false;
        const w = this._authWriterPair();
        const ev = finalizeEvent(
            {
                kind: KIND_PRIVATE_TREE_BLOB,
                created_at: Math.floor(Date.now() / 1000),
                tags: [
                    [TAG_APP, TAG_APP_VALUE],
                    ['d', privateTreeDTag(u, id)],
                    ['u', u],
                    ['t', id],
                    ['deleted', '1']
                ],
                content: ''
            },
            pairSecretKey(w)
        );
        void this._publish(ev);
        return true;
    },

    /** @returns {Promise<Array<{ treeId: string, encryptedContent: string, updatedAt: string }>>} */
    async listPrivateTreeBlobsOnce(username) {
        const u = String(username || '').trim();
        if (!u) return [];
        const evs = await this._query(
            {
                kinds: [KIND_PRIVATE_TREE_BLOB],
                '#u': [u],
                limit: 200
            },
            6000
        );
        const latestById = new Map();
        for (const ev of evs) {
            const treeId = tagValue(ev, 't');
            if (!treeId) continue;
            const prev = latestById.get(treeId);
            if (!prev || (ev.created_at || 0) > (prev.created_at || 0)) {
                latestById.set(treeId, ev);
            }
        }
        const out = [];
        for (const [treeId, ev] of latestById) {
            const deleted = (ev.tags || []).some((t) => t[0] === 'deleted' && String(t[1]) === '1');
            const ct = String(ev.content || '');
            if (deleted || !ct) continue;
            out.push({
                treeId,
                encryptedContent: ct,
                updatedAt: new Date((ev.created_at || 0) * 1000).toISOString()
            });
        }
        return out;
    }
};
