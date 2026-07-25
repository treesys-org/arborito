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
import { enqueueGameVotePublish } from '../../../arcade-vote-network.js';

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
        if (!gameId) return true;

        /* Instant local toggle — network publish continues in the background. */
        let pair = store.getNetworkUserPair?.() || null;
        if (!String(pair?.pub || '').trim()) {
            try {
                pair = (await store.ensureNetworkUserPair?.()) || pair;
            } catch {
                /* soft-fail; publish worker retries */
            }
        }
        const pub = String(pair?.pub || '').trim();
        const realKey = pub ? arcadeGameVoteKey(gameId, pub) : '';
        const fallbackKey = arcadeGameVoteKeyFallback(gameId);
        const prev =
            (realKey && sourcesLsGet(realKey) === '1') || sourcesLsGet(fallbackKey) === '1';
        const finalVote =
            typeof fields.liked === 'boolean' ? !!fields.liked : !prev;

        if (finalVote) {
            if (realKey) sourcesLsSet(realKey, '1');
            sourcesLsSet(fallbackKey, '1');
        } else {
            if (realKey) sourcesLsDel(realKey);
            sourcesLsDel(fallbackKey);
        }

        ctx.setGameMetrics((prevMetrics) => {
            const cur = prevMetrics[gameId] || { votes: readArcadeGameVoteCount(gameId) };
            const base = Number(cur.votes) || 0;
            const delta = (finalVote ? 1 : 0) - (prev ? 1 : 0);
            const votes =
                typeof fields.votes === 'number'
                    ? Math.max(0, Math.floor(fields.votes))
                    : Math.max(0, base + delta);
            sourcesLsSet(arcadeGameVoteCountKey(gameId), String(votes));
            return { ...prevMetrics, [gameId]: { ...cur, votes } };
        });
        ctx.bump?.();
        enqueueGameVotePublish(gameId);
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
