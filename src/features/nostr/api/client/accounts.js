/**
 * Per-username account records: the sync-login hash, identity claim, the
 * passphrase-encrypted user-pair escrow, the encrypted installed-sources
 * blob, and chunked encrypted private-tree sync per local tree id. All of these
 * are published under the throwaway auth-writer pair (so relays can verify
 * the signature) while the user's true identity stays in the payload.
 */

import { finalizeEvent, verifyEvent } from '../../../../../vendor/nostr-tools/lib/esm/index.js';
import { normalizeUsername } from '../../../../shared/lib/normalize-username.js';
import {
    KIND_ACCOUNT_RECOVERY,
    KIND_ACCOUNT_USER_PAIR_ESCROW,
    KIND_PRIVATE_TREE_BLOB,
    KIND_USER_ACCOUNT_RECORD,
    KIND_USER_SOURCES,
    TAG_APP,
    TAG_APP_VALUE,
    accountEscrowDTag,
    accountIdentityDTag,
    accountNetworkPubDTag,
    accountRecoveryDTag,
    accountSyncLoginDTag,
    privateTreeDTag,
    privateTreePartDTag,
    userSourcesDTag
} from '../nostr-spec.js';
import { pairSecretKey, tagValue, QUERY_MS_LONG } from './_shared.js';

export const accountsMixin = {
    /**
     * Load the sync-login record for `username`.
     *
     * When `signerPub` is supplied (the pubkey derived from the candidate
     * secret, see `deriveAccountSigningPair`), this is the AUTHENTICATED path
     * used for sign-in / post-publish confirmation: it fetches only that
     * author's record and verifies the signature + author binding, so a record
     * forged by anyone who doesn't know the secret is ignored. Without
     * `signerPub` it is a best-effort, unauthenticated existence check (used
     * only for "is this username already taken?").
     * @param {string} username
     * @param {string} [signerPub]
     * @param {number} [queryMs]
     */
    async loadSyncLoginRecordOnce(username, signerPub, queryMs = 6000) {
        const u = normalizeUsername(username);
        if (!u) return null;
        const filter = {
            kinds: [KIND_USER_ACCOUNT_RECORD],
            '#d': [accountSyncLoginDTag(u)],
            limit: 1
        };
        const author = String(signerPub || '').trim();
        if (author) filter.authors = [author];
        const ev = await this._get(filter, queryMs);
        if (!ev) return null;
        if (!verifyEvent(ev)) return null;
        if (author && String(ev.pubkey) !== author) return null;
        try {
            const raw = JSON.parse(ev.content || 'null');
            const h = String(raw?.hash || '').trim();
            if (!h) return null;
            /* Registration is price-gated: a record only counts if it carries
             * a valid PoW bound to the username and the signing key. This
             * makes mass username squatting by bots cost real CPU and lets
             * readers ignore zero-cost squat records entirely. */
            const powOk = await this._verifyPow(
                'account_register_v1',
                '',
                '',
                `sync-login:${u}`,
                String(ev.pubkey || ''),
                raw?.powBits,
                raw?.powNonce
            );
            if (!powOk) return null;
            const credential = String(raw?.credential || '').trim() === 'password' ? 'password' : 'sync_code';
            return {
                v: Number(raw.v) || 1,
                hash: h,
                credential,
                updatedAt: String(raw.updatedAt || '')
            };
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
     * signed by `signerPair`, the keypair derived from the account secret
     * (`deriveAccountSigningPair`). Signing with this key (NOT the per-browser
     * auth writer) is what makes the record un-squattable: only a holder of the
     * secret can produce or replace it. `signerPair` is required.
     * @param {{ username: string, hash: string, signerPair: { pub: string, priv: string }, credential?: string }} args
     */
    async putSyncLoginHash({ username, hash, signerPair, credential }) {
        const u = normalizeUsername(username);
        if (!u) return false;
        if (!(signerPair && signerPair.priv && signerPair.pub)) {
            throw new Error('putSyncLoginHash requires the secret-derived signer pair');
        }
        const h = String(hash || '').trim();
        /* Registration PoW (readers require it, see loadSyncLoginRecordOnce).
         * Clearing a record (empty hash) skips the work: readers treat empty
         * hashes as "no account" regardless. */
        const pow = h
            ? await this._solvePow('account_register_v1', '', '', `sync-login:${u}`, signerPair.pub, this._powBits('account_register_v1'))
            : { powBits: 0, powNonce: '' };
        const cred =
            String(credential || '').trim() === 'password' ? 'password' : credential ? 'sync_code' : undefined;
        const rec = {
            v: 2,
            hash: h,
            powBits: pow.powBits,
            powNonce: pow.powNonce,
            updatedAt: new Date().toISOString()
        };
        if (cred) rec.credential = cred;
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
        this._mirrorAccountEvent(ev);
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
     * Publish the public network-user pubkey for `username`, signed by the
     * account secret-derived signer (same key as the sync-login record).
     * Lets tree owners invite collaborators by username alone.
     * @param {{ username: string, networkUserPub: string, signerPair: { pub: string, priv: string } }} args
     */
    async putNetworkUserPubIndex({ username, networkUserPub, signerPair }) {
        const u = normalizeUsername(username);
        const networkPub = String(networkUserPub || '').trim();
        if (!u || networkPub.length < 32 || !(signerPair && signerPair.priv && signerPair.pub)) {
            throw new Error('putNetworkUserPubIndex requires username, networkUserPub, and signerPair');
        }
        const rec = { v: 1, networkUserPub: networkPub, updatedAt: new Date().toISOString() };
        const ev = finalizeEvent(
            {
                kind: KIND_USER_ACCOUNT_RECORD,
                created_at: Math.floor(Date.now() / 1000),
                tags: [
                    [TAG_APP, TAG_APP_VALUE],
                    ['d', accountNetworkPubDTag(u)],
                    ['u', u]
                ],
                content: JSON.stringify(rec)
            },
            pairSecretKey(signerPair)
        );
        await this._publish(ev);
        this._mirrorAccountEvent(ev);
        return true;
    },

    /**
     * Resolve a username to its network user pubkey (for collaborator invites).
     * Requires a live sync-login record and a matching signed network-pub index.
     * @param {string} username
     * @returns {Promise<string|null>}
     */
    async loadNetworkUserPubOnce(username) {
        const resolved = await this.resolveInviteAccountOnce(username);
        return resolved?.networkUserPub || null;
    },

    /**
     * Resolve invite target: sync-login account + optional network user pubkey index.
     * @param {string} username
     * @returns {Promise<{ username: string, accountSignerPub: string, networkUserPub: string|null }|null>}
     */
    async resolveInviteAccountOnce(username) {
        const u = normalizeUsername(username);
        if (!u) return null;
        const syncEv = await this._get(
            {
                kinds: [KIND_USER_ACCOUNT_RECORD],
                '#d': [accountSyncLoginDTag(u)],
                limit: 1
            },
            6000
        );
        if (!syncEv || !verifyEvent(syncEv)) return null;
        let syncRaw;
        try {
            syncRaw = JSON.parse(syncEv.content || 'null');
        } catch {
            return null;
        }
        const syncHash = String(syncRaw?.hash || '').trim();
        if (!syncHash) return null;
        const powOk = await this._verifyPow(
            'account_register_v1',
            '',
            '',
            `sync-login:${u}`,
            String(syncEv.pubkey || ''),
            syncRaw?.powBits,
            syncRaw?.powNonce
        );
        if (!powOk) return null;
        const authorPub = String(syncEv.pubkey || '').trim();
        if (!authorPub) return null;

        let networkUserPub = null;
        const netEv = await this._get(
            {
                kinds: [KIND_USER_ACCOUNT_RECORD],
                '#d': [accountNetworkPubDTag(u)],
                limit: 1
            },
            6000
        );
        if (netEv && verifyEvent(netEv) && String(netEv.pubkey) === authorPub) {
            try {
                const raw = JSON.parse(netEv.content || 'null');
                const pub = String(raw?.networkUserPub || '').trim();
                if (pub.length >= 32) networkUserPub = pub;
            } catch {
                /* ignore */
            }
        }

        return { username: u, accountSignerPub: authorPub, networkUserPub };
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
        void this._publish(ev).then(() => this._mirrorAccountEvent(ev));
        return true;
    },

    /**
     * Publish the recovery blob (sync secret scrypt-encrypted under the
     * recovery passphrase) under the username. Signed by the per-browser auth
     * writer, content is self-protecting (only the passphrase decrypts it),
     * and readers look it up by username `d` tag, not by author, so a new
     * device can fetch it. The blob is PII-free by construction.
     * @param {{ username: string, blob: object }} args
     */
    putAccountRecoveryBlob({ username, blob }) {
        const u = normalizeUsername(username);
        if (!u || !blob || typeof blob !== 'object') return false;
        const w = this._authWriterPair();
        const ev = finalizeEvent(
            {
                kind: KIND_ACCOUNT_RECOVERY,
                created_at: Math.floor(Date.now() / 1000),
                tags: [
                    [TAG_APP, TAG_APP_VALUE],
                    ['d', accountRecoveryDTag(u)],
                    ['u', u]
                ],
                content: JSON.stringify(blob)
            },
            pairSecretKey(w)
        );
        void this._publish(ev);
        return true;
    },

    /** @returns {Promise<object|null>} */
    async loadAccountRecoveryBlobOnce(username) {
        const u = normalizeUsername(username);
        if (!u) return null;
        const ev = await this._get(
            {
                kinds: [KIND_ACCOUNT_RECOVERY],
                '#d': [accountRecoveryDTag(u)],
                limit: 1
            },
            6000
        );
        if (!ev) return null;
        try {
            const blob = JSON.parse(ev.content || 'null');
            return blob && typeof blob === 'object' ? blob : null;
        } catch {
            return null;
        }
    },

    /** Remove the recovery blob (publishes an empty replaceable event). */
    clearAccountRecoveryBlob({ username }) {
        const u = normalizeUsername(username);
        if (!u) return false;
        const w = this._authWriterPair();
        const ev = finalizeEvent(
            {
                kind: KIND_ACCOUNT_RECOVERY,
                created_at: Math.floor(Date.now() / 1000),
                tags: [
                    [TAG_APP, TAG_APP_VALUE],
                    ['d', accountRecoveryDTag(u)],
                    ['u', u]
                ],
                content: ''
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

    /** Paginated fetch of all private-tree sync events for a username. */
    async _fetchPrivateTreeEvents(username, ms = QUERY_MS_LONG) {
        const u = normalizeUsername(username);
        if (!u) return [];
        const pageSize = 5000;
        const all = [];
        let until;
        for (let page = 0; page < 200; page++) {
            const filter = {
                kinds: [KIND_PRIVATE_TREE_BLOB],
                '#u': [u],
                limit: pageSize
            };
            if (until != null) filter.until = until;
            const evs = await this._query(filter, ms);
            if (!evs.length) break;
            all.push(...evs);
            if (evs.length < pageSize) break;
            const minTs = Math.min(...evs.map((ev) => ev.created_at || 0));
            if (!Number.isFinite(minTs) || minTs <= 0) break;
            until = minTs - 1;
        }
        return all;
    },

    /**
     * @param {{ username: string, treeId: string, pair: object, body: object }} args
     */
    async putPrivateTreeBlob({ username, treeId, pair, body }) {
        const u = normalizeUsername(username);
        const id = String(treeId || '').trim();
        if (!u || !id || !pair || !body || typeof body !== 'object') return false;
        const packed = await this.packPrivateTreeForSync({ pair, data: body });
        const w = this._authWriterPair();
        const events = [
            finalizeEvent(
                {
                    kind: KIND_PRIVATE_TREE_BLOB,
                    created_at: Math.floor(Date.now() / 1000),
                    tags: [
                        [TAG_APP, TAG_APP_VALUE],
                        ['d', privateTreeDTag(u, id)],
                        ['u', u],
                        ['t', id],
                        ['role', 'hdr'],
                        ['n', String(packed.partCiphertexts.length)]
                    ],
                    content: packed.manifestCiphertext
                },
                pairSecretKey(w)
            )
        ];
        for (let i = 0; i < packed.partCiphertexts.length; i++) {
            events.push(
                finalizeEvent(
                    {
                        kind: KIND_PRIVATE_TREE_BLOB,
                        created_at: Math.floor(Date.now() / 1000),
                        tags: [
                            [TAG_APP, TAG_APP_VALUE],
                            ['d', privateTreePartDTag(u, id, i)],
                            ['u', u],
                            ['t', id],
                            ['role', 'part'],
                            ['i', String(i)]
                        ],
                        content: packed.partCiphertexts[i]
                    },
                    pairSecretKey(w)
                )
            );
        }
        await this._publishBurst(events);
        return true;
    },

    /** Remove a private tree from account sync (header + all part events). */
    async clearPrivateTreeBlob({ username, treeId, partCount = 0 }) {
        const u = normalizeUsername(username);
        const id = String(treeId || '').trim();
        if (!u || !id) return false;
        const w = this._authWriterPair();
        const publishEmpty = (dTag, extraTags = []) => {
            const ev = finalizeEvent(
                {
                    kind: KIND_PRIVATE_TREE_BLOB,
                    created_at: Math.floor(Date.now() / 1000),
                    tags: [
                        [TAG_APP, TAG_APP_VALUE],
                        ['d', dTag],
                        ['u', u],
                        ['t', id],
                        ['deleted', '1'],
                        ...extraTags
                    ],
                    content: ''
                },
                pairSecretKey(w)
            );
            void this._publish(ev);
        };
        publishEmpty(privateTreeDTag(u, id));
        const n = Math.max(0, Math.floor(Number(partCount)) || 0);
        for (let i = 0; i < n; i++) {
            publishEmpty(privateTreePartDTag(u, id, i), [['role', 'part'], ['i', String(i)]]);
        }
        return true;
    },

    /**
     * @returns {Promise<Array<{ treeId: string, manifestCiphertext: string, partCiphertexts: string[], updatedAt: string }>>}
     */
    async listPrivateTreeBlobsOnce(username) {
        const u = normalizeUsername(username);
        if (!u) return [];
        /* Filter by the username (`#u`) tag, NOT by the local auth-writer
         * pubkey: blobs are published under a per-browser throwaway writer, so
         * an `authors` filter would hide every blob created on a different
         * device and silently break cross-device private-tree restore. The
         * content is end-to-end encrypted (NIP-44, user pair) so reading the
         * ciphertext from any writer is safe, only the holder of the sync
         * secret can decrypt it. */
        const evs = await this._fetchPrivateTreeEvents(u);
        const latestByD = new Map();
        for (const ev of evs) {
            const tagU = tagValue(ev, 'u');
            if (tagU && normalizeUsername(tagU) !== u) continue;
            const treeId = tagValue(ev, 't');
            if (!treeId) continue;
            const d = tagValue(ev, 'd');
            if (!d) continue;
            const prev = latestByD.get(d);
            if (!prev || (ev.created_at || 0) > (prev.created_at || 0)) {
                latestByD.set(d, ev);
            }
        }
        const headers = new Map();
        const partsByTree = new Map();
        for (const ev of latestByD.values()) {
            const deleted = (ev.tags || []).some((t) => t[0] === 'deleted' && String(t[1]) === '1');
            const ct = String(ev.content || '');
            if (deleted || !ct) continue;
            const treeId = tagValue(ev, 't');
            const role = tagValue(ev, 'role');
            const updatedAt = new Date((ev.created_at || 0) * 1000).toISOString();
            if (role === 'part') {
                const idx = Math.max(0, Math.floor(Number(tagValue(ev, 'i')) || 0));
                if (!partsByTree.has(treeId)) partsByTree.set(treeId, new Map());
                partsByTree.get(treeId).set(idx, { ciphertext: ct, updatedAt });
                continue;
            }
            if (role !== 'hdr') continue;
            const partCount = Math.max(0, Math.floor(Number(tagValue(ev, 'n')) || 0));
            if (!partCount) continue;
            headers.set(treeId, { ciphertext: ct, updatedAt, partCount });
        }
        const out = [];
        for (const [treeId, hdr] of headers) {
            const partMap = partsByTree.get(treeId) || new Map();
            const partCiphertexts = [];
            let latest = hdr.updatedAt;
            for (let i = 0; i < hdr.partCount; i++) {
                const row = partMap.get(i);
                if (!row?.ciphertext) {
                    partCiphertexts.length = 0;
                    break;
                }
                partCiphertexts.push(row.ciphertext);
                if (row.updatedAt > latest) latest = row.updatedAt;
            }
            if (partCiphertexts.length !== hdr.partCount) continue;
            out.push({
                treeId,
                manifestCiphertext: hdr.ciphertext,
                partCiphertexts,
                updatedAt: latest
            });
        }
        return out;
    }
};
