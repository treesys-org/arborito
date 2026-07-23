/** Map official catalog slugs → ui keys in games.json */
const OFFICIAL_GAME_NAME_KEYS = [
    ['alonso-duel', 'arcadeGameAlonsoDuel'],
    ['hacky-terminal', 'arcadeGameHackyTerminal'],
    ['classroom', 'arcadeGameClassroom'],
    ['firstjob', 'arcadeGameFirstJob'],
    ['memory', 'arcadeGameMemory'],
    ['match-pairs', 'arcadeGameMemory'],
    ['starship', 'arcadeGameStarship'],
    ['wrong-fruit', 'arcadeGameWrongFruit'],
    ['fruto-equivocado', 'arcadeGameWrongFruit'],
];

const OFFICIAL_GAME_DESC_KEYS = [
    ['alonso-duel', 'arcadeGameAlonsoDuelDesc'],
    ['hacky-terminal', 'arcadeGameHackyTerminalDesc'],
    ['classroom', 'arcadeGameClassroomDesc'],
    ['firstjob', 'arcadeGameFirstJobDesc'],
    ['memory', 'arcadeGameMemoryDesc'],
    ['match-pairs', 'arcadeGameMemoryDesc'],
    ['starship', 'arcadeGameStarshipDesc'],
    ['wrong-fruit', 'arcadeGameWrongFruitDesc'],
    ['fruto-equivocado', 'arcadeGameWrongFruitDesc'],
];

function matchOfficialKey(game, pairs) {
    const hay = `${game?.id || ''} ${game?.path || ''} ${game?.url || ''}`.toLowerCase();
    for (const [slug, key] of pairs) {
        if (!hay.includes(slug)) continue;
        return key;
    }
    return null;
}

/**
 * Display name for catalog games.
 * Official games use `arcadeGame*` keys in locales.
 *
 * @param {Record<string, string>} ui
 * @param {{ id?: string, name?: string, path?: string, url?: string }} game
 */
export function localizedArcadeGameName(ui, game) {
    const fallback = String(game?.name || '').trim() || ui.gameDefaultTitle || 'Game';
    const key = matchOfficialKey(game, OFFICIAL_GAME_NAME_KEYS);
    if (key) {
        const localized = String(ui[key] || '').trim();
        if (localized) return localized;
    }
    return fallback;
}

/**
 * Catalog blurb under the title (manifest description fallback).
 * @param {Record<string, string>} ui
 * @param {{ id?: string, name?: string, description?: string, path?: string, url?: string }} game
 */
export function localizedArcadeGameDescription(ui, game) {
    const fallback = String(game?.description || game?.path || '').trim();
    const key = matchOfficialKey(game, OFFICIAL_GAME_DESC_KEYS);
    if (key) {
        const localized = String(ui[key] || '').trim();
        if (localized) return localized;
    }
    return fallback;
}
