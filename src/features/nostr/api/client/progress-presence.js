/**
 * Per-user replicated state: encrypted progress records, weekly leaderboard
 * entries, and the presence beacon that emits a periodic ping so a live
 * "X people are looking at this tree right now" indicator can count
 * distinct session ids over a sliding window.
 */

import { finalizeEvent } from '../../../../../vendor/nostr-tools/lib/esm/index.js';
import { hasGdprNetworkConsent } from '../../../privacy-gdpr/api/network-consent.js';
import { randomUUIDSafe } from '../../../../shared/lib/secure-web-crypto.js';
import { normalizeNostrRelayUrls } from '../nostr-relays-runtime.js';
import {
    KIND_PRESENCE_PING,
    KIND_TREE_LEADERBOARD,
    KIND_USER_PROGRESS,
    arbRootTag,
    treeLeaderboardDTag
} from '../nostr-spec.js';
import { assertNostrContentSize, hasArbRoot, isNostrContentTooLargeError, pairSecretKey, tagValue, truncateUtf8 } from './_shared.js';

function userProgressDTag(ownerPub, universeId, userPub) {
    return `arborito:progress:${String(ownerPub)}:${String(universeId)}:${String(userPub)}`;
}

function userProgressPartDTag(ownerPub, universeId, userPub, index) {
    return `arborito:progress:${String(ownerPub)}:${String(universeId)}:${String(userPub)}:p:${Math.max(0, Math.floor(Number(index)) || 0)}`;
}

export const progressPresenceMixin = {
    /** Tombstone / tiny JSON only. For sync payloads use putUserProgressPacked. */
    putUserProgress({ pub, universeId, userPub, record, signerPair = null }) {
        if (record && typeof record === 'object' && record.ct && record.v !== 2) {
            throw new Error('putUserProgress: single-ciphertext sync removed; use putUserProgressPacked');
        }
        void this._publishUserProgress(pub, universeId, userPub, record, this._relays(), signerPair);
    },

    async _publishUserProgress(pub, universeId, userPub, record, relays, signerPair = null) {
        if (!hasGdprNetworkConsent()) return;
        const w = signerPair?.priv ? signerPair : null;
        if (!w?.priv || String(w.pub || '') !== String(userPub || '')) {
            /* Progress must be signed by the claimed userPub (same bind as leaderboard). */
            return;
        }
        const content = JSON.stringify(record);
        assertNostrContentSize(content, 'user progress');
        const ev = finalizeEvent(
            {
                kind: KIND_USER_PROGRESS,
                created_at: Math.floor(Date.now() / 1000),
                tags: [
                    arbRootTag(pub, universeId),
                    ['d', userProgressDTag(pub, universeId, userPub)],
                    ['user', String(userPub)]
                ],
                content
            },
            pairSecretKey(w)
        );
        try {
            await this._publishToRelays(ev, relays);
        } catch (e) {
            if (isNostrContentTooLargeError(e)) throw e;
            /* fire-and-forget for relay flakiness only */
        }
    },

    /**
     * Pack + publish progress that may exceed a single NIP-44 / relay event.
     * Header at progress d-tag; ciphertext parts at `:p:{i}`.
     */
    async putUserProgressPacked({ pub, universeId, userPub, pair, data, peers = null }) {
        if (!hasGdprNetworkConsent()) return false;
        if (!pair?.priv || String(pair.pub || '') !== String(userPub || '')) return false;
        const packed = await this.packPrivateTreeForSync({ pair, data });
        const n = packed.partCiphertexts.length;
        const updatedAt = data?.updatedAt || new Date().toISOString();
        const header = {
            v: 2,
            updatedAt,
            n,
            ct: packed.manifestCiphertext
        };
        const relays =
            Array.isArray(peers) && peers.length ? normalizeNostrRelayUrls(peers) : this._relays();
        await this._publishUserProgress(pub, universeId, userPub, header, relays, pair);
        const partEvents = packed.partCiphertexts.map((ct, i) =>
            finalizeEvent(
                {
                    kind: KIND_USER_PROGRESS,
                    created_at: Math.floor(Date.now() / 1000),
                    tags: [
                        arbRootTag(pub, universeId),
                        ['d', userProgressPartDTag(pub, universeId, userPub, i)],
                        ['user', String(userPub)],
                        ['role', 'part'],
                        ['i', String(i)],
                        ['n', String(n)]
                    ],
                    content: String(ct)
                },
                pairSecretKey(pair)
            )
        );
        for (const ev of partEvents) {
            assertNostrContentSize(ev.content, 'user progress part');
        }
        /* Keep part publishes on the same relay set as the header. */
        if (relays.length) this.setPeers(relays);
        await this._publishBurst(partEvents, 5);
        return true;
    },

    clearUserProgress({ pub, universeId, userPub, signerPair = null }) {
        this.putUserProgress({ pub, universeId, userPub, record: null, signerPair });
    },

    async listUserProgressRecords({ pub, universeId, userPub }) {
        const d = userProgressDTag(pub, universeId, userPub);
        const byD = await this._query(
            {
                kinds: [KIND_USER_PROGRESS],
                authors: [String(userPub)],
                '#d': [d],
                limit: 20
            },
            6000
        );
        const byUser = await this._query(
            {
                kinds: [KIND_USER_PROGRESS],
                authors: [String(userPub)],
                '#user': [String(userPub)],
                limit: 20
            },
            6000
        );
        const byId = new Map();
        for (const ev of [...(byD || []), ...(byUser || [])]) {
            if (!ev?.id) continue;
            if (!hasArbRoot(ev, pub, universeId)) continue;
            if (String(ev.pubkey) !== String(userPub)) continue;
            const role = tagValue(ev, 'role');
            if (role === 'part') continue;
            byId.set(ev.id, ev);
        }
        const ranked = [...byId.values()].sort(
            (a, b) => (Number(b.created_at) || 0) - (Number(a.created_at) || 0)
        );
        const out = [];
        for (const ev of ranked) {
            try {
                const parsed = JSON.parse(ev.content || 'null');
                if (parsed && typeof parsed === 'object') out.push(parsed);
            } catch {
                /* ignore */
            }
        }
        return out;
    },

    /** Decrypt a progress record (v1 single ct or v2 packed parts). */
    async decryptUserProgressRecord({ pub, universeId, userPub, pair, record }) {
        if (!record || typeof record !== 'object' || !pair?.priv) return null;
        const n = Math.max(0, Math.floor(Number(record.n)) || 0);
        if (record.v === 2 && n > 0 && record.ct) {
            const parts = new Array(n);
            await Promise.all(
                Array.from({ length: n }, async (_, i) => {
                    const pd = userProgressPartDTag(pub, universeId, userPub, i);
                    const ev = await this._get(
                        {
                            kinds: [KIND_USER_PROGRESS],
                            authors: [String(userPub)],
                            '#d': [pd],
                            limit: 1
                        },
                        8000
                    );
                    if (ev && String(ev.pubkey) === String(userPub)) {
                        parts[i] = String(ev.content || '');
                    }
                })
            );
            if (parts.some((p) => !p)) return null;
            return this.unpackPrivateTreeFromSync({
                pair,
                manifestCiphertext: String(record.ct),
                partCiphertexts: parts
            });
        }
        if (record.ct) {
            return this.decryptForSelf({ pair, encrypted: record.ct });
        }
        return null;
    },

    async getUserProgress({ pub, universeId, userPub }) {
        const list = await this.listUserProgressRecords({ pub, universeId, userPub });
        return list[0] || null;
    },

    putTreeLeaderboardEntry({ pub, universeId, userPub, signerPair, record }) {
        void this._publishTreeLeaderboard(pub, universeId, userPub, signerPair, record, this._relays());
    },

    async _publishTreeLeaderboard(pub, universeId, userPub, signerPair, record, relays) {
        if (!hasGdprNetworkConsent()) return;
        const w = signerPair?.priv ? signerPair : this._authWriterPair();
        if (!w?.priv) return;
        /* Bind the event author to the claimed userPub so rows cannot be spoofed. */
        if (String(w.pub || '') !== String(userPub || '')) return;
        const weekKey = record?.weekKey || '';
        const safe = record && typeof record === 'object' ? { ...record } : {};
        if (safe.displayName != null) safe.displayName = truncateUtf8(String(safe.displayName), 120);
        if (safe.note != null) safe.note = truncateUtf8(String(safe.note), 400);
        const content = JSON.stringify(safe || {});
        assertNostrContentSize(content, 'leaderboard');
        const ev = finalizeEvent(
            {
                kind: KIND_TREE_LEADERBOARD,
                created_at: Math.floor(Date.now() / 1000),
                tags: [
                    arbRootTag(pub, universeId),
                    ['d', treeLeaderboardDTag(userPub, weekKey)],
                    ['user', String(userPub)]
                ],
                content
            },
            pairSecretKey(w)
        );
        try {
            await this._publishToRelays(ev, relays);
        } catch {
            /* fire-and-forget: leaderboard entries are best-effort */
        }
    },

    async queryTreeLeaderboard({ pub, universeId, weekKey, limit = 80 }) {
        const evs = await this._query(
            {
                kinds: [KIND_TREE_LEADERBOARD],
                limit: 200
            },
            8000
        );
        const out = [];
        for (const ev of evs) {
            if (!hasArbRoot(ev, pub, universeId)) continue;
            const dTag = (ev.tags || []).find((t) => t[0] === 'd')?.[1] || '';
            if (weekKey && !String(dTag).endsWith(`:${weekKey}`)) continue;
            try {
                const row = JSON.parse(ev.content || 'null');
                if (!row?.userPub) continue;
                if (String(ev.pubkey) !== String(row.userPub)) continue;
            } catch {
                continue;
            }
            out.push(ev);
            if (out.length >= limit) break;
        }
        return out;
    },

    startUniversePresence({ pub, universeId, onCount }) {
        const emit = (total) => {
            if (typeof onCount === 'function') onCount(total);
        };
        if (!this.available) {
            emit(0);
            return { stop: () => {}, ping: () => {} };
        }
        let sid = '';
        try {
            sid = sessionStorage.getItem('arborito-tree-presence-sid') || '';
            if (!sid) {
                sid = randomUUIDSafe();
                sessionStorage.setItem('arborito-tree-presence-sid', sid);
            }
        } catch {
            sid = `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
        }
        const w = this._authWriterPair();
        const ping = () => {
            const ev = this._finalize(w, {
                kind: KIND_PRESENCE_PING,
                created_at: Math.floor(Date.now() / 1000),
                tags: [arbRootTag(pub, universeId), ['sid', sid]],
                content: ''
            });
            void this._publish(ev);
        };
        ping();
        /* 60 s heartbeat / 90 s poll. Older 20/14 s pacing was producing a
         * sustained background load (3–4 REQs per minute per relay just from
         * one tab) that combined with modal-driven queries was tripping
         * "too many concurrent REQs" on stricter relays. The presence count
         * doesn't need second-level freshness, minute-level is plenty for
         * a "X people are looking at this tree right now" indicator. */
        const hb = setInterval(ping, 60000);
        const runPoll = async () => {
            try {
                const since = Math.floor(Date.now() / 1000) - 180;
                const evs = await this._query(
                    {
                        kinds: [KIND_PRESENCE_PING],
                        since,
                        limit: 2000
                    },
                    4000
                );
                let total = 0;
                const seen = new Set();
                for (const ev of evs) {
                    if (!hasArbRoot(ev, pub, universeId)) continue;
                    const s = tagValue(ev, 'sid');
                    if (!s || seen.has(s)) continue;
                    seen.add(s);
                    total++;
                }
                emit(total);
            } catch {
                emit(0);
            }
        };
        runPoll();
        const pollIv = setInterval(runPoll, 90000);
        const stop = () => {
            clearInterval(hb);
            clearInterval(pollIv);
        };
        return { stop, ping };
    }
};
