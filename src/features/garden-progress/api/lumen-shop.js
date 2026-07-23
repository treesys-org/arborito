/** Garden shop catalog. Costs are in lumens (study XP currency). */

export const STREAK_SHIELD_MAX = 3;

export const GARDEN_SHOP_ITEMS = [
    {
        id: 'consumable-streak-shield',
        cost: 200,
        icon: '☂️',
        kind: 'consumable',
        grant: 'streakShield',
        maxOwned: STREAK_SHIELD_MAX,
        labelKey: 'gardenShopStreakShield',
    },
    { id: 'deco-mushroom', cost: 120, icon: '🍄', slot: 'ground', labelKey: 'gardenShopMushroom' },
    { id: 'deco-butterfly', cost: 150, icon: '🦋', slot: 'sky', labelKey: 'gardenShopButterfly' },
    { id: 'deco-fireflies', cost: 180, icon: '✨', slot: 'sky', labelKey: 'gardenShopFireflies' },
    { id: 'deco-birdhouse', cost: 220, icon: '🪺', slot: 'sky', labelKey: 'gardenShopBirdhouse' },
    { id: 'deco-lantern', cost: 280, icon: '🏮', slot: 'ground', labelKey: 'gardenShopLantern' },
    { id: 'deco-fountain', cost: 400, icon: '⛲', slot: 'ground', labelKey: 'gardenShopFountain' },
];

/** @param {string} id */
function getShopItem(id) {
    return GARDEN_SHOP_ITEMS.find((i) => i.id === id) || null;
}

export { getShopItem };

/** @param {import('../../../core/user-store/index.js' ).UserStore['state']['gamification']} g */
export function getAvailableLumens(g) {
    const xp = Math.max(0, Number(g.xp) || 0);
    const spent = Math.max(0, Number(g.lumensSpent) || 0);
    return Math.max(0, xp - spent);
}

/**
 * @param {import('../../../core/user-store/index.js' ).UserStore['state']['gamification']} g
 * @param {{ grant?: string }} item
 */
export function getConsumableOwnedCount(g, item) {
    if (item?.grant === 'streakShield') return Math.max(0, Number(g?.streakShields) || 0);
    return 0;
}

/**
 * @param {import('../../../core/user-store/index.js' ).UserStore} userStore
 * @param {string} itemId
 * @returns {{ ok: boolean, error?: string, item?: object, kind?: string }}
 */
export function buyGardenItem(userStore, itemId) {
    const item = getShopItem(itemId);
    if (!item) return { ok: false, error: 'unknown' };
    const g = userStore.state.gamification;
    const balance = getAvailableLumens(g);

    if (item.kind === 'consumable') {
        const owned = getConsumableOwnedCount(g, item);
        const max = Math.max(1, Number(item.maxOwned) || STREAK_SHIELD_MAX);
        if (owned >= max) return { ok: false, error: 'max' };
        if (balance < item.cost) return { ok: false, error: 'insufficient' };
        const patch = {
            lumensSpent: (Number(g.lumensSpent) || 0) + item.cost,
        };
        if (item.grant === 'streakShield') {
            patch.streakShields = owned + 1;
        }
        userStore.updateGamification(patch);
        return { ok: true, item, kind: 'consumable' };
    }

    if ((g.inventory || []).includes(item.id)) return { ok: false, error: 'owned' };
    if (balance < item.cost) return { ok: false, error: 'insufficient' };

    const decor = { ...(g.gardenDecor || {}) };
    if (!decor[item.slot]) decor[item.slot] = item.id;
    userStore.updateGamification({
        lumensSpent: (Number(g.lumensSpent) || 0) + item.cost,
        inventory: [...(g.inventory || []), item.id],
        gardenDecor: decor,
    });
    return { ok: true, item, kind: 'decor' };
}

/**
 * @param {import('../../../core/user-store/index.js' ).UserStore} userStore
 * @param {string} itemId
 */
export function equipGardenDecor(userStore, itemId) {
    const item = getShopItem(itemId);
    if (!item || item.kind === 'consumable') return false;
    const g = userStore.state.gamification;
    if (!(g.inventory || []).includes(item.id)) return false;
    const decor = { ...(g.gardenDecor || {}) };
    decor[item.slot] = item.id;
    userStore.updateGamification({ gardenDecor: decor });
    return true;
}

/**
 * @param {import('../../../core/user-store/index.js' ).UserStore} userStore
 * @param {'sky'|'ground'} slot
 */
export function unequipGardenDecor(userStore, slot) {
    const g = userStore.state.gamification;
    const decor = { ...(g.gardenDecor || {}) };
    delete decor[slot];
    userStore.updateGamification({ gardenDecor: decor });
}

/** @param {import('../../../core/user-store/index.js' ).UserStore['state']['gamification']} g @param {'sky'|'ground'} slot */
export function getEquippedDecor(g, slot) {
    const id = g.gardenDecor?.[slot];
    return id ? getShopItem(id) : null;
}
