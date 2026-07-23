import {
    sourcesLsDel,
    sourcesLsGet,
    sourcesLsSet,
} from '../../sources/api/modals/logic/sources-local-storage.js';

export { sourcesLsDel, sourcesLsGet, sourcesLsSet };

export function arcadeGameVoteKey(gameId, voterPub) {
    return `arborito-game-vote-v1:${String(gameId || '')}:${String(voterPub || '')}`;
}

export function arcadeGameVoteKeyFallback(gameId) {
    return `arborito-game-vote-local-v1:${String(gameId || '')}`;
}

export function arcadeGameVoteCountKey(gameId) {
    return `arborito-game-vote-count-v1:${String(gameId || '')}`;
}

export function readArcadeGameVoteCount(gameId) {
    const id = String(gameId || '');
    if (!id) return 0;
    const raw = sourcesLsGet(arcadeGameVoteCountKey(id));
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function readArcadeGameLiked(getNetworkUserPair, gameId) {
    const id = String(gameId || '');
    if (!id) return false;
    try {
        const pair = getNetworkUserPair?.();
        const pub = String(pair?.pub || '').trim();
        const lsKey = pub ? arcadeGameVoteKey(id, pub) : arcadeGameVoteKeyFallback(id);
        return sourcesLsGet(lsKey) === '1';
    } catch {
        return false;
    }
}

export function hydrateArcadeGameMetrics(gameIds) {
    /** @type {Record<string, { votes: number }>} */
    const metrics = {};
    for (const rawId of gameIds) {
        const id = String(rawId || '');
        if (!id) continue;
        metrics[id] = { votes: readArcadeGameVoteCount(id) };
    }
    return metrics;
}
