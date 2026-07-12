import { discoverListingScore } from '../../sources/api/modals/logic/sources-search-utils.js';

/** Reuses Biblioteca Discover scoring, likes drive engagement term. */
export function arcadeGameDiscoverScore(game, metrics = {}) {
    const row = { updatedAt: game?.version || game?.updatedAt || '' };
    let score = discoverListingScore(row, metrics);
    if (game?.isOfficial) score += 25;
    return score;
}

export function sortArcadeGamesForDiscovery(games, metricsMap = {}) {
    return [...games].sort((a, b) => {
        const aId = String(a?.id ?? '');
        const bId = String(b?.id ?? '');
        const sa = arcadeGameDiscoverScore(a, metricsMap[aId] || {});
        const sb = arcadeGameDiscoverScore(b, metricsMap[bId] || {});
        if (sb !== sa) return sb - sa;
        return String(a?.name || '').localeCompare(String(b?.name || ''), undefined, {
            sensitivity: 'base',
        });
    });
}
