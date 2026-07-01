/** @param {Record<string, unknown>|null|undefined} raw */
export function normalizeGamification(raw) {
    const g = raw && typeof raw === 'object' ? raw : {};
    return {
        username: '',
        avatar: '👤',
        xp: 0,
        dailyXP: 0,
        streak: 0,
        lastLoginDate: null,
        seeds: [],
        lumensSpent: 0,
        inventory: [],
        gardenDecor: {},
        rankingOptIn: false,
        rankingAnonymous: false,
        networkSocialConsentAt: null,
        networkSocialConsentVersion: null,
        streakShields: 0,
        weeklyLumens: 0,
        weeklyWeekKey: null,
        ...g,
        seeds: Array.isArray(g.seeds) ? g.seeds : [],
        inventory: Array.isArray(g.inventory) ? g.inventory : [],
        gardenDecor: g.gardenDecor && typeof g.gardenDecor === 'object' ? g.gardenDecor : {}
    };
}

/** Official catalog — served from the separate arborito-games repo (static HTTP). */
const OFFICIAL_ARCADE_GAMES_CATALOG_URL =
    'https://cdn.jsdelivr.net/gh/treesys-org/arborito-games@main/manifest.json';

/** Default official game catalog entry pinned in the Arcade repos list. */
export function getDefaultArcadeGameCatalog() {
    return {
        id: 'treesys-arborito-games-main',
        name: 'Arborito Games',
        url: OFFICIAL_ARCADE_GAMES_CATALOG_URL,
        isOfficial: true
    };
}
