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
        lastStudyDate: null,
        quizXpAwarded: {},
        arcadeXpDay: null,
        arcadeDailyXP: 0,
        arcadeScore: 0,
        profileUpdatedAt: null,
        ...g,
        seeds: Array.isArray(g.seeds) ? g.seeds : [],
        inventory: Array.isArray(g.inventory) ? g.inventory : [],
        gardenDecor: g.gardenDecor && typeof g.gardenDecor === 'object' ? g.gardenDecor : {},
        quizXpAwarded: g.quizXpAwarded && typeof g.quizXpAwarded === 'object' ? g.quizXpAwarded : {},
    };
}

/** Stored as @main; Arborito resolves the live GitHub commit when fetching (see arcade-games-cdn.js). */
const OFFICIAL_ARCADE_GAMES_CATALOG_URL =
    'https://cdn.jsdelivr.net/gh/treesys-org/arborito-games@main/manifest.json';

export function getDefaultArcadeGameCatalog() {
    return {
        id: 'treesys-arborito-games-main',
        name: 'Arborito Games',
        url: OFFICIAL_ARCADE_GAMES_CATALOG_URL,
        isOfficial: true,
    };
}
