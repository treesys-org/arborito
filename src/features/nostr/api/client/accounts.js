/**
 * Per-username account records: the sync-login hash, identity claim, the
 * passphrase-encrypted user-pair escrow, the encrypted installed-sources
 * blob, and one encrypted private-tree blob per local tree id. All of these
 * are published under the throwaway auth-writer pair (so relays can verify
 * the signature) while the user's true identity stays in the payload.
 */

import { finalizeEvent, verifyEvent } from '../../../../../vendor/nostr-tools/lib/esm/index.js';
import { normalizeUsername } from '../../../../shared/lib/normalize-username.js';
import {
    KIND_ACCOUNT_USER_PAIR_ESCROW,
    KIND_PRIVATE_TREE_BLOB,
    KIND_USER_ACCOUNT_RECORD,
    KIND_USER_SOURCES,
    TAG_APP,
    TAG_APP_VALUE,
    accountEscrowDTag,
    accountIdentityDTag,
    accountSyncLoginDTag,
    privateTreeDTag,
    userSourcesDTag
} from '../nostr-spec.js';
import { pairSecretKey, tagValue } from './_shared.js';

export const accountsMixin = {
    /**
     * Load the sync-login record for `username`.
     *
     * When `signerPub` is supplied (the pubkey derived from the candidate
     * secret — see `deriveAccountSigningPair`), this is the AUTHENTICATED path
     * used for sign-in / post-publish confirmation: it fetches only that
     * author's record and verifies the signature + author binding, so a record
     * forged by anyone who doesn't know the secret is ignored. Without
     * `signerPub` it is a best-effort, unauthenticated existence check (used
     * only for "is this username already taken?").
     * @param {string} username
     * @param {string} [signerPub]
     */
    async loadSyncLoginRecordOnce(username, signerPub) {
        const u = normalizeUsername(username);
        if (!u) return null;
        const filter = {
            kinds: [KIND_USER_ACCOUNT_RECORD],
            '#d': [accountSyncLoginDTag(u)],
            limit: 1
        };
        const author = String(signerPub || '').trim();
        if (author) filter.authors = [author];
        const ev = await this._get(filter, 6000);
        if (!ev) return null;
        if (author && (!verifyEvent(ev) || String(ev.pubkey) !== author)) return null;
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
    /**
     * Publish (or clear, when `hash === ''`) the sync-login record for `username`,
     * signed by `signerPair` — the keypair derived from the account secret
     * (`deriveAccountSigningPair`). Signing with this key (NOT the per-browser
     * auth writer) is what makes the record un-squattable: only a holder of the
     * secret can produce or replace it. `signerPair` is required.
     * @param {{ username: string, hash: string, signerPair: { pub: string, priv: string } }} args
     */
    async putSyncLoginHash({ username, hash, signerPair }) {
        const u = normalizeUsername(username);
        if (!u) return false;
        if (!(signerPair && signerPair.priv && signerPair.pub)) {
            throw new Error('putSyncLoginHash requires the secret-derived signer pair');
        }
        const h = String(hash || '').trim();
        const rec = { v: 1, hash: h, updatedAt: new Date().toISOString() };
        const ev = finalizeEvent(
            {
                kind: KIND_USER_ACCOUNT_RECORD,
                created_at: Math.floor(Date.now() / 1000),
                tags: [
                    [TAG_APP, TAG_APP_VALUE],
                    ['d', accountSyncLoginDTag(u)]
                ],
                content: JSON.stringify(rec)
            },
            pairSecretKey(signerPair)
        );
        await this._publish(ev);
        return true;
    },

    async clearSyncLoginRecord({ username, signerPair }) {
        return this.putSyncLoginHash({ username, hash: '', signerPair });
    },

    putIdentityClaim({ username, record }) {
        const u = normalizeUsername(username);
        if (!u || !record || typeof record !== 'object') return false;
        const w = this._authWriterPair();
        const ev = finalizeEvent(
            {
                kind: KIND_USER_ACCOUNT_RECORD,
                created_at: Math.floor(Date.now() / 1000),
                tags: [
                    [TAG_APP, TAG_APP_VALUE],
                    ['d', accountIdentityDTag(u)]
                ],
                content: JSON.stringify(record)
            },
            pairSecretKey(w)
        );
        void this._publish(ev);
        return true;
    },

    async loadIdentityClaimOnce(username) {
        const u = normalizeUsername(username);
        if (!u) return null;
        const ev = await this._get(
            {
                kinds: [KIND_USER_ACCOUNT_RECORD],
                '#d': [accountIdentityDTag(u)],
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
        const u = normalizeUsername(username);
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
        const u = normalizeUsername(username);
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
        const u = normalizeUsername(username);
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
        const u = normalizeUsername(username);
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
        const u = normalizeUsername(username);
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
        const u = normalizeUsername(username);
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
        const u = normalizeUsername(username);
        if (!u) return [];
        /* Filter by the username (`#u`) tag, NOT by the local auth-writer
         * pubkey: blobs are published under a per-browser throwaway writer, so
         * an `authors` filter would hide every blob created on a different
         * device and silently break cross-device private-tree restore. The
         * content is end-to-end encrypted (NIP-44, user pair) so reading the
         * ciphertext from any writer is safe — only the holder of the sync
         * secret can decrypt it. */
        const evs = await this._query(
            {
                kinds: [KIND_PRIVATE_TREE_BLOB],
                '#u': [u],
                limit: 400
            },
            6000
        );
        const latestById = new Map();
        for (const ev of evs) {
            const tagU = tagValue(ev, 'u');
            if (tagU && normalizeUsername(tagU) !== u) continue;
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
