import { getArboritoStore } from '../../../../../../core/store-singleton.js';
import {
    arcadeGameVoteCountKey,
    arcadeGameVoteKey,
    arcadeGameVoteKeyFallback,
    readArcadeGameVoteCount,
    sourcesLsDel,
    sourcesLsGet,
    sourcesLsSet,
} from '../../../arcade-local-storage.js';

function parseHttpGameUrl(raw) {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return null;
    try {
        const parsed = new URL(trimmed);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
        return trimmed;
    } catch {
        return null;
    }
}

export async function runArcadeGamesAction(ctx, action, fields = {}) {
    const store = getArboritoStore();
    const ui = ctx.ui || store?.ui || {};

    if (action === 'game-vote') {
        const gameId = String(fields.gameId || '');
        const dir = String(fields.vote || 'up');
        if (!gameId) return true;

        const pair = await ctx.getNetworkUserPair?.();
        const pub = String(pair?.pub || '').trim();
        const lsKey = pub ? arcadeGameVoteKey(gameId, pub) : arcadeGameVoteKeyFallback(gameId);
        const prev = sourcesLsGet(lsKey) === '1';
        const finalVote = dir === 'up' ? !prev : false;

        if (finalVote) sourcesLsSet(lsKey, '1');
        else sourcesLsDel(lsKey);

        ctx.setGameMetrics((prevMetrics) => {
            const cur = prevMetrics[gameId] || { votes: readArcadeGameVoteCount(gameId) };
            const base = Number(cur.votes) || 0;
            const delta = (finalVote ? 1 : 0) - (prev ? 1 : 0);
            const votes = Math.max(0, base + delta);
            sourcesLsSet(arcadeGameVoteCountKey(gameId), String(votes));
            return { ...prevMetrics, [gameId]: { ...cur, votes } };
        });
        ctx.bump?.();
        return true;
    }

    if (action === 'add-game') {
        const url = parseHttpGameUrl(fields.url);
        if (!url) {
            store?.notify?.(ui.arcadeAddGameInvalidUrl || 'Enter a valid http(s) URL.', true);
            return true;
        }
        let name = 'Custom Game';
        try {
            name = new URL(url).hostname;
        } catch {
            /* keep default */
        }
        store?.userStore?.settings?.addGame(name, url);
        ctx.setShowAddGameSheet?.(false);
        store?.notify?.(ui.arcadeAddGameSuccess || 'Game added.');
        ctx.bump?.();
        return true;
    }

    if (action === 'open-add-game-sheet') {
        ctx.setShowAddGameSheet?.(true);
        return true;
    }

    if (action === 'close-add-game-sheet') {
        ctx.setShowAddGameSheet?.(false);
        return true;
    }

    return false;
}
