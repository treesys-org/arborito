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
    userSourcesDTag,
    userSourcesPartDTag
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
     * @param {{ firstHit?: boolean }} [opts] `firstHit` returns on first relay event (auth UX).
     */
    async loadSyncLoginRecordOnce(username, signerPub, queryMs = 6000, opts = {}) {
        const u = normalizeUsername(username);
        if (!u) return null;
        const filter = {
            kinds: [KIND_USER_ACCOUNT_RECORD],
            '#d': [accountSyncLoginDTag(u)],
            limit: 1
        };
        const author = String(signerPub || '').trim();
        if (author) filter.authors = [author];
        const ev = await this._get(filter, queryMs, opts);
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
        const syncEvs = await this._query(
            {
                kinds: [KIND_USER_ACCOUNT_RECORD],
                '#d': [accountSyncLoginDTag(u)],
                limit: 20
            },
            6000
        );
        const candidates = [];
        for (const syncEv of syncEvs || []) {
            if (!syncEv || !verifyEvent(syncEv)) continue;
            let syncRaw;
            try {
                syncRaw = JSON.parse(syncEv.content || 'null');
            } catch {
                continue;
            }
            const syncHash = String(syncRaw?.hash || '').trim();
            if (!syncHash) continue;
            const powOk = await this._verifyPow(
                'account_register_v1',
                '',
                '',
                `sync-login:${u}`,
                String(syncEv.pubkey || ''),
                syncRaw?.powBits,
                syncRaw?.powNonce
            );
            if (!powOk) continue;
            const authorPub = String(syncEv.pubkey || '').trim();
            if (!authorPub) continue;
            candidates.push({ syncEv, authorPub, at: Number(syncEv.created_at) || 0 });
        }
        if (!candidates.length) return null;
        /* Prefer the oldest valid registration (first-writer), then resolve its network pub. */
        candidates.sort((a, b) => a.at - b.at);

        for (const c of candidates) {
            let networkUserPub = null;
            const netEv = await this._get(
                {
                    kinds: [KIND_USER_ACCOUNT_RECORD],
                    authors: [c.authorPub],
                    '#d': [accountNetworkPubDTag(u)],
                    limit: 1
                },
                6000
            );
            if (netEv && verifyEvent(netEv) && String(netEv.pubkey) === c.authorPub) {
                try {
                    const raw = JSON.parse(netEv.content || 'null');
                    const pub = String(raw?.networkUserPub || '').trim();
                    if (pub.length >= 32) networkUserPub = pub;
                } catch {
                    /* ignore */
                }
            }
            if (networkUserPub) {
                return { username: u, accountSignerPub: c.authorPub, networkUserPub };
            }
        }
        /* No candidate has a network user index yet — refuse invite (caller must not fall back). */
        return {
            username: u,
            accountSignerPub: candidates[0].authorPub,
            networkUserPub: null
        };
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
        const list = await this.listAccountRecoveryBlobs(username);
        return list[0] || null;
    },

    /** Newest-first recovery blobs (hostile empty overwrite → try older). */
    async listAccountRecoveryBlobs(username) {
        const u = normalizeUsername(username);
        if (!u) return [];
        const evs = await this._query(
            {
                kinds: [KIND_ACCOUNT_RECOVERY],
                '#d': [accountRecoveryDTag(u)],
                limit: 20
            },
            6000
        );
        const ranked = [...(evs || [])].sort(
            (a, b) => (Number(b.created_at) || 0) - (Number(a.created_at) || 0)
        );
        const out = [];
        for (const ev of ranked) {
            const raw = String(ev.content || '').trim();
            if (!raw) continue;
            try {
                const blob = JSON.parse(raw);
                if (blob && typeof blob === 'object') out.push(blob);
            } catch {
                /* ignore */
            }
        }
        return out;
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
        const list = await this.listAccountUserPairEscrowBlobs(username);
        return list[0] || null;
    },

    /** Newest-first escrow blobs for a username (multi-author `#d` clutter). */
    async listAccountUserPairEscrowBlobs(username) {
        const u = normalizeUsername(username);
        if (!u) return [];
        const evs = await this._query(
            {
                kinds: [KIND_ACCOUNT_USER_PAIR_ESCROW],
                '#d': [accountEscrowDTag(u)],
                limit: 20
            },
            6000
        );
        const ranked = [...(evs || [])].sort(
            (a, b) => (Number(b.created_at) || 0) - (Number(a.created_at) || 0)
        );
        const out = [];
        for (const ev of ranked) {
            if (!verifyEvent(ev)) continue;
            try {
                const blob = JSON.parse(ev.content || 'null');
                if (blob && typeof blob === 'object') out.push(blob);
            } catch {
                /* ignore */
            }
        }
        return out;
    },

    /**
     * Pack + publish installed-sources (any size) via NIP-44 multi-part like private trees.
     * @param {{ username: string, pair: object, data: object }} args
     */
    async putUserSourcesPacked({ username, pair, data }) {
        const u = normalizeUsername(username);
        if (!u || !pair?.priv || !data || typeof data !== 'object') return false;
        const packed = await this.packPrivateTreeForSync({ pair, data });
        const n = packed.partCiphertexts.length;
        const w = pair;
        const events = [
            finalizeEvent(
                {
                    kind: KIND_USER_SOURCES,
                    created_at: Math.floor(Date.now() / 1000),
                    tags: [
                        [TAG_APP, TAG_APP_VALUE],
                        ['d', userSourcesDTag(u)],
                        ['u', u],
                        ['role', 'hdr'],
                        ['n', String(n)]
                    ],
                    content: packed.manifestCiphertext
                },
                pairSecretKey(w)
            )
        ];
        for (let i = 0; i < n; i++) {
            events.push(
                finalizeEvent(
                    {
                        kind: KIND_USER_SOURCES,
                        created_at: Math.floor(Date.now() / 1000),
                        tags: [
                            [TAG_APP, TAG_APP_VALUE],
                            ['d', userSourcesPartDTag(u, i)],
                            ['u', u],
                            ['role', 'part'],
                            ['i', String(i)],
                            ['n', String(n)]
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

    /** Decrypt newest sources blob (packed hdr+parts, or older single ciphertext). */
    async loadUserSourcesDecrypted(username, pair) {
        const u = normalizeUsername(username);
        if (!u || !pair?.priv) return null;
        const hdrEvs = await this._query(
            {
                kinds: [KIND_USER_SOURCES],
                '#d': [userSourcesDTag(u)],
                limit: 20
            },
            6000
        );
        const ranked = [...(hdrEvs || [])].sort(
            (a, b) => (Number(b.created_at) || 0) - (Number(a.created_at) || 0)
        );
        for (const ev of ranked) {
            const role = tagValue(ev, 'role');
            if (role === 'part') continue;
            try {
                if (role === 'hdr') {
                    const n = Math.max(0, Math.floor(Number(tagValue(ev, 'n'))) || 0);
                    if (!n) continue;
                    const parts = new Array(n);
                    await Promise.all(
                        Array.from({ length: n }, async (_, i) => {
                            const pev = await this._get(
                                {
                                    kinds: [KIND_USER_SOURCES],
                                    '#d': [userSourcesPartDTag(u, i)],
                                    limit: 1
                                },
                                8000
                            );
                            if (pev) parts[i] = String(pev.content || '');
                        })
                    );
                    if (parts.some((p) => !p)) continue;
                    return this.unpackPrivateTreeFromSync({
                        pair,
                        manifestCiphertext: String(ev.content || ''),
                        partCiphertexts: parts
                    });
                }
                const ct = String(ev.content || '').trim();
                if (!ct) continue;
                return this.decryptForSelf({ pair, encrypted: ct });
            } catch {
                /* try next candidate */
            }
        }
        return null;
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
        /* Sign with the network user pair (same key that encrypts) so hostile
         * auth-writer tombstones on the shared `#u` cannot clobber restore. */
        const w = pair;
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
    async clearPrivateTreeBlob({ username, treeId, partCount = 0, pair = null }) {
        const u = normalizeUsername(username);
        const id = String(treeId || '').trim();
        if (!u || !id) return false;
        /* Prefer the network user pair (same key that published the draft). */
        const w = pair?.priv ? pair : this._authWriterPair();
        if (!w?.priv) return false;
        const events = [];
        const pushEmpty = (dTag, extraTags = []) => {
            events.push(
                finalizeEvent(
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
                )
            );
        };
        pushEmpty(privateTreeDTag(u, id), [['role', 'hdr'], ['n', '0']]);
        const n = Math.max(0, Math.floor(Number(partCount)) || 0);
        for (let i = 0; i < n; i++) {
            pushEmpty(privateTreePartDTag(u, id, i), [['role', 'part'], ['i', String(i)]]);
        }
        await this._publishBurst(events);
        return true;
    },

    /**
     * @returns {Promise<Array<{ treeId: string, manifestCiphertext: string, partCiphertexts: string[], updatedAt: string }>>}
     */
    async listPrivateTreeBlobsOnce(username) {
        const u = normalizeUsername(username);
        if (!u) return [];
        /* Filter by username `#u` (cross-device). Honor per-author tombstones so
         * Stop sync sticks, but ignore hostile empty/deleted events from other
         * pubkeys so they cannot wipe restore. */
        const evs = await this._fetchPrivateTreeEvents(u);
        /** @type {Map<string, import('nostr-tools').Event[]>} */
        const byD = new Map();
        for (const ev of evs) {
            const tagU = tagValue(ev, 'u');
            if (tagU && normalizeUsername(tagU) !== u) continue;
            const treeId = tagValue(ev, 't');
            if (!treeId) continue;
            const d = tagValue(ev, 'd');
            if (!d) continue;
            if (!byD.has(d)) byD.set(d, []);
            byD.get(d).push(ev);
        }
        for (const list of byD.values()) {
            list.sort((a, b) => (Number(b.created_at) || 0) - (Number(a.created_at) || 0));
        }

        const headerCandidates = new Map(); // treeId -> [{ciphertext, partCount, updatedAt, pubkey}]
        const partsByTreeAuthor = new Map(); // `${treeId}:${pubkey}` -> Map idx -> {ciphertext, updatedAt}

        for (const list of byD.values()) {
            /** @type {Map<string, 'tombstone' | 'live'>} */
            const authorNewestState = new Map();
            for (const ev of list.slice(0, 12)) {
                const pubkey = String(ev.pubkey || '');
                const deleted = (ev.tags || []).some((t) => t[0] === 'deleted' && String(t[1]) === '1');
                const ct = String(ev.content || '');
                let state = authorNewestState.get(pubkey);
                if (state === undefined) {
                    if (deleted || !ct.trim()) {
                        authorNewestState.set(pubkey, 'tombstone');
                        continue;
                    }
                    authorNewestState.set(pubkey, 'live');
                    state = 'live';
                } else if (state === 'tombstone') {
                    continue;
                }
                if (deleted || !ct) continue;
                const treeId = tagValue(ev, 't');
                const role = tagValue(ev, 'role');
                const updatedAt = new Date((ev.created_at || 0) * 1000).toISOString();
                if (role === 'part') {
                    const idx = Math.max(0, Math.floor(Number(tagValue(ev, 'i')) || 0));
                    const key = `${treeId}:${pubkey}`;
                    if (!partsByTreeAuthor.has(key)) partsByTreeAuthor.set(key, new Map());
                    const partMap = partsByTreeAuthor.get(key);
                    if (!partMap.has(idx)) partMap.set(idx, { ciphertext: ct, updatedAt });
                    continue;
                }
                if (role !== 'hdr') continue;
                const partCount = Math.max(0, Math.floor(Number(tagValue(ev, 'n')) || 0));
                if (!partCount) continue;
                if (!headerCandidates.has(treeId)) headerCandidates.set(treeId, []);
                headerCandidates.get(treeId).push({
                    ciphertext: ct,
                    updatedAt,
                    partCount,
                    pubkey
                });
            }
        }

        const out = [];
        for (const [treeId, headers] of headerCandidates) {
            for (const hdr of headers) {
                const partMap = partsByTreeAuthor.get(`${treeId}:${hdr.pubkey}`) || new Map();
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
        }
        return out;
    }
};
