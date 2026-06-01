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

/** Default catalog (manifest JSON) — repo https://github.com/treesys-org/arborito-games */
export const DEFAULT_ARCADE_GAME_CATALOG = {
    id: 'treesys-arborito-games-main',
    name: 'Arborito Games',
    url: 'https://raw.githubusercontent.com/treesys-org/arborito-games/main/manifest.json',
    isOfficial: true
};
