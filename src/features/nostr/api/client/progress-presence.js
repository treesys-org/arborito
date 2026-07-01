/**
 * Per-user replicated state: encrypted progress records, weekly leaderboard
 * entries, and the presence beacon that emits a periodic ping so a live
 * "X people are looking at this tree right now" indicator can count
 * distinct session ids over a sliding window.
 */

import { finalizeEvent } from '../../../../../vendor/nostr-tools/lib/esm/index.js';
import { hasGdprNetworkConsent } from '../../../../shared/lib/connected-services/index.js';
import { randomUUIDSafe } from '../../../../shared/lib/secure-web-crypto.js';
import { normalizeNostrRelayUrls } from '../nostr-relays-runtime.js';
import {
    KIND_PRESENCE_PING,
    KIND_TREE_LEADERBOARD,
    KIND_USER_PROGRESS,
    arbRootTag,
    treeLeaderboardDTag
} from '../nostr-spec.js';
import { hasArbRoot, pairSecretKey, tagValue } from './_shared.js';

export const progressPresenceMixin = {
    putUserProgress({ pub, universeId, userPub, record }) {
        void this._publishUserProgress(pub, universeId, userPub, record, this._relays());
    },

    async _publishUserProgress(pub, universeId, userPub, record, relays) {
        if (!hasGdprNetworkConsent()) return;
        const w = this._authWriterPair();
        const ev = finalizeEvent(
            {
                kind: KIND_USER_PROGRESS,
                created_at: Math.floor(Date.now() / 1000),
                tags: [arbRootTag(pub, universeId), ['user', String(userPub)]],
                content: JSON.stringify(record)
            },
            pairSecretKey(w)
        );
        try {
            await this._publishToRelays(ev, relays);
        } catch {
            /* fire-and-forget: progress is best-effort replicated state */
        }
    },

    putUserProgressReplicated({ pub, universeId, userPub, record, peers }) {
        const list = normalizeNostrRelayUrls(peers);
        if (!list.length) {
            this.putUserProgress({ pub, universeId, userPub, record });
            return;
        }
        void this._publishUserProgress(pub, universeId, userPub, record, list);
    },

    clearUserProgress({ pub, universeId, userPub }) {
        this.putUserProgress({ pub, universeId, userPub, record: null });
    },

    async getUserProgress({ pub, universeId, userPub }) {
        const evs = await this._query(
            {
                kinds: [KIND_USER_PROGRESS],
                '#user': [String(userPub)],
                limit: 20
            },
            6000
        );
        for (const ev of evs) {
            if (!hasArbRoot(ev, pub, universeId)) continue;
            try {
                return JSON.parse(ev.content || 'null');
            } catch {
                continue;
            }
        }
        return null;
    },

    putTreeLeaderboardEntry({ pub, universeId, userPub, signerPair, record }) {
        void this._publishTreeLeaderboard(pub, universeId, userPub, signerPair, record, this._relays());
    },

    async _publishTreeLeaderboard(pub, universeId, userPub, signerPair, record, relays) {
        if (!hasGdprNetworkConsent()) return;
        const w = signerPair?.priv ? signerPair : this._authWriterPair();
        if (!w?.priv) return;
        const weekKey = record?.weekKey || '';
        const ev = finalizeEvent(
            {
                kind: KIND_TREE_LEADERBOARD,
                created_at: Math.floor(Date.now() / 1000),
                tags: [
                    arbRootTag(pub, universeId),
                    ['d', treeLeaderboardDTag(userPub, weekKey)],
                    ['user', String(userPub)]
                ],
                content: JSON.stringify(record || {})
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
         * doesn't need second-level freshness — minute-level is plenty for
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
