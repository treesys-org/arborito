/** Map official catalog slugs → ui key in games.json */
const OFFICIAL_GAME_NAME_KEYS = [
    ['hacky-terminal', 'arcadeGameHackyTerminal'],
    ['classroom', 'arcadeGameClassroom'],
    ['memory', 'arcadeGameMemory'],
    ['match-pairs', 'arcadeGameMemory'],
];

/**
 * Localized display name for catalog games (manifest titles stay English).
 * @param {Record<string, string>} ui
 * @param {{ id?: string, name?: string, path?: string, url?: string }} game
 */
export function localizedArcadeGameName(ui, game) {
    const fallback = String(game?.name || '').trim() || ui.gameDefaultTitle || 'Game';
    const hay = `${game?.id || ''} ${game?.path || ''} ${game?.url || ''}`.toLowerCase();
    for (const [slug, key] of OFFICIAL_GAME_NAME_KEYS) {
        if (!hay.includes(slug)) continue;
        const localized = String(ui[key] || '').trim();
        if (localized) return localized;
    }
    return fallback;
}
