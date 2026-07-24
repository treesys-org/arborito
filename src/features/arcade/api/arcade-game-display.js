/** Map official catalog slugs → optional ui name overrides in games.json (titles only). */
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

function matchOfficialKey(game, pairs) {
    const hay = `${game?.id || ''} ${game?.path || ''} ${game?.url || ''}`.toLowerCase();
    for (const [slug, key] of pairs) {
        if (!hay.includes(slug)) continue;
        return key;
    }
    return null;
}

function normalizeUiLang(lang) {
    const raw = String(lang || '').trim().toLowerCase();
    if (raw.startsWith('es')) return 'es';
    if (raw.startsWith('en')) return 'en';
    return raw.slice(0, 2) || 'en';
}

/**
 * Blurb from the games catalog (arborito-games manifest), not Arborito locales.
 * Prefers `descriptions[lang]`, then `description`. New catalog games work with no app release.
 *
 * @param {{ description?: string, descriptions?: Record<string, string> }} game
 * @param {string} [lang]
 */
export function catalogGameDescription(game, lang) {
    const code = normalizeUiLang(lang);
    const map = game?.descriptions;
    if (map && typeof map === 'object') {
        const hit = String(map[code] || map[code.toUpperCase()] || '').trim();
        if (hit) return hit;
        const en = String(map.en || map.EN || '').trim();
        if (en) return en;
        const es = String(map.es || map.ES || '').trim();
        if (es) return es;
    }
    return String(game?.description || '').trim();
}

/**
 * Display name for catalog games.
 * Official titles may use `arcadeGame*` overrides; new games use manifest `name`.
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
 * Catalog blurb under the title — always from the games repo / catalog entry.
 * @param {Record<string, string>} _ui unused (kept for call-site compatibility)
 * @param {{ id?: string, name?: string, description?: string, descriptions?: Record<string, string>, path?: string, url?: string }} game
 * @param {string} [lang]
 */
export function localizedArcadeGameDescription(_ui, game, lang) {
    const fromCatalog = catalogGameDescription(game, lang);
    if (fromCatalog) return fromCatalog;
    return String(game?.path || game?.url || '').trim();
}
