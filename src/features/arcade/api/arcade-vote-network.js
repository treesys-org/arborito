/**
 * Background arcade like publish + network tally hydrate.
 * Mirrors Biblioteca tree-vote workers (optimistic UI, soft-fail PoW publish).
 */

import { getArboritoStore } from '../../../core/store-singleton.js';
import { ensureConnectedNostr } from '../../../shared/lib/connected-services/index.js';
import { yieldToPaint } from '../../../shared/lib/yield-to-paint.js';
import {
    arcadeGameVoteCountKey,
    arcadeGameVoteKey,
    arcadeGameVoteKeyFallback,
    readArcadeGameVoteCount,
    sourcesLsDel,
    sourcesLsGet,
    sourcesLsSet,
} from './arcade-local-storage.js';

const gameVoteJobs = new Map();

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveGameVoteIdentity(gameId) {
    const store = getArboritoStore();
    let pair = store.getNetworkUserPair?.() || null;
    if (!String(pair?.pub || '').trim()) {
        pair = await store.ensureNetworkUserPair?.();
    }
    const pub = String(pair?.pub || '').trim();
    if (!pub || !store.nostr || typeof store.nostr.putGameVote !== 'function') return null;
    const lsKey = arcadeGameVoteKey(gameId, pub);
    const fallback = arcadeGameVoteKeyFallback(gameId);
    if (sourcesLsGet(fallback) === '1') {
        sourcesLsSet(lsKey, '1');
        sourcesLsDel(fallback);
    }
    return { pair, pub, lsKey };
}

/** Enqueue PoW + publish; keeps retrying after the Arcade sheet closes. */
export function enqueueGameVotePublish(gameId) {
    const gid = String(gameId || '').trim();
    if (!gid) return;
    const cur = gameVoteJobs.get(gid) || { running: false };
    cur.pending = { gameId: gid };
    gameVoteJobs.set(gid, cur);
    if (cur.running) return;
    cur.running = true;
    void (async () => {
        await yieldToPaint();
        const store = getArboritoStore();
        try {
            while (true) {
                const slot = gameVoteJobs.get(gid);
                const next = slot?.pending;
                if (!next) break;
                slot.pending = null;

                let id = await resolveGameVoteIdentity(next.gameId);
                if (!id) {
                    await sleep(2500);
                    id = await resolveGameVoteIdentity(next.gameId);
                }
                if (!id) {
                    if (!slot.pending) slot.pending = next;
                    await sleep(5000);
                    continue;
                }

                const want = sourcesLsGet(id.lsKey) === '1';
                let ok = false;
                for (let attempt = 0; attempt < 6; attempt++) {
                    if ((sourcesLsGet(id.lsKey) === '1') !== want) break;
                    try {
                        await ensureConnectedNostr(store, { timeoutMs: 12000 });
                        if ((sourcesLsGet(id.lsKey) === '1') !== want) break;
                        await store.nostr.putGameVote({
                            pair: id.pair,
                            gameId: next.gameId,
                            vote: want,
                        });
                        ok = true;
                        break;
                    } catch (e) {
                        console.warn('putGameVote', e);
                        await sleep(Math.min(20000, 1000 * 2 ** attempt));
                    }
                }
                if (!ok && (sourcesLsGet(id.lsKey) === '1') === want && !slot.pending) {
                    slot.pending = next;
                    await sleep(8000);
                }
            }
        } finally {
            const slot = gameVoteJobs.get(gid);
            if (slot) {
                slot.running = false;
                if (!slot.pending) gameVoteJobs.delete(gid);
                else enqueueGameVotePublish(gid);
            }
        }
    })();
}

/**
 * Merge relay tally with local floor (same idea as tree vote floors).
 * @returns {number}
 */
export function mergeArcadeNetworkVotes(gameId, networkVotes) {
    const floor = readArcadeGameVoteCount(gameId);
    const netRaw =
        networkVotes == null || networkVotes === ''
            ? null
            : Math.floor(Number(networkVotes) || 0);
    const net = netRaw == null ? null : Math.max(0, netRaw);
    let n = net;
    if (floor > 0) {
        n = n == null ? floor : Math.max(n, floor);
    }
    if (net != null && net >= floor) {
        sourcesLsSet(arcadeGameVoteCountKey(gameId), String(net));
        return net;
    }
    return n == null ? 0 : n;
}

/**
 * Fetch network like counts for catalog ids and fold into React metrics state.
 * Soft-fails per game; never blocks the Arcade UI.
 */
export async function refreshArcadeGameVotesFromNetwork(gameIds, setGameMetrics) {
    const store = getArboritoStore();
    const ids = [...new Set((gameIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
    if (!ids.length || typeof setGameMetrics !== 'function') return;
    if (!store?.nostr || typeof store.nostr.countGameVotesOnce !== 'function') return;

    try {
        await ensureConnectedNostr(store, { timeoutMs: 8000 });
    } catch {
        return;
    }

    const concurrency = 3;
    let cursor = 0;
    const runOne = async (gameId) => {
        try {
            const votes = await store.nostr.countGameVotesOnce({ gameId });
            const merged = mergeArcadeNetworkVotes(gameId, votes);
            setGameMetrics((prev) => {
                const cur = prev[gameId] || {};
                if (Number(cur.votes) === merged) return prev;
                return { ...prev, [gameId]: { ...cur, votes: merged } };
            });
        } catch (e) {
            console.warn('countGameVotesOnce', gameId, e);
        }
    };

    const workers = Array.from({ length: Math.min(concurrency, ids.length) }, async () => {
        while (cursor < ids.length) {
            const i = cursor++;
            await runOne(ids[i]);
        }
    });
    await Promise.all(workers);
}
