/** Garden decoration catalog — edit here, no logic. Costs are in lumens. */

export const GARDEN_SHOP_ITEMS = [
    { id: 'deco-fireflies', cost: 35, icon: '✨', slot: 'sky', labelKey: 'gardenShopFireflies' },
    { id: 'deco-butterfly', cost: 30, icon: '🦋', slot: 'sky', labelKey: 'gardenShopButterfly' },
    { id: 'deco-lantern', cost: 50, icon: '🏮', slot: 'ground', labelKey: 'gardenShopLantern' },
    { id: 'deco-fountain', cost: 80, icon: '⛲', slot: 'ground', labelKey: 'gardenShopFountain' },
    { id: 'deco-mushroom', cost: 25, icon: '🍄', slot: 'ground', labelKey: 'gardenShopMushroom' },
    { id: 'deco-birdhouse', cost: 45, icon: '🪺', slot: 'sky', labelKey: 'gardenShopBirdhouse' }
];

/** @param {string} id */
function getShopItem(id) {
    return GARDEN_SHOP_ITEMS.find((i) => i.id === id) || null;
}

/** @param {import('../../core/user-store/index.js').UserStore['state']['gamification']} g */
export function getAvailableLumens(g) {
    const xp = Math.max(0, Number(g.xp) || 0);
    const spent = Math.max(0, Number(g.lumensSpent) || 0);
    return Math.max(0, xp - spent);
}

/**
 * @param {import('../../core/user-store/index.js').UserStore} userStore
 * @param {string} itemId
 * @returns {{ ok: boolean, error?: string, item?: typeof GARDEN_SHOP_ITEMS[0] }}
 */
export function buyGardenItem(userStore, itemId) {
    const item = getShopItem(itemId);
    if (!item) return { ok: false, error: 'unknown' };
    const g = userStore.state.gamification;
    const balance = getAvailableLumens(g);
    if ((g.inventory || []).includes(item.id)) return { ok: false, error: 'owned' };
    if (balance < item.cost) return { ok: false, error: 'insufficient' };

    const decor = { ...(g.gardenDecor || {}) };
    if (!decor[item.slot]) decor[item.slot] = item.id;
    userStore.updateGamification({
        lumensSpent: (Number(g.lumensSpent) || 0) + item.cost,
        inventory: [...(g.inventory || []), item.id],
        gardenDecor: decor
    });
    return { ok: true, item };
}

/**
 * @param {import('../../core/user-store/index.js').UserStore} userStore
 * @param {string} itemId
 */
export function equipGardenDecor(userStore, itemId) {
    const item = getShopItem(itemId);
    if (!item) return false;
    const g = userStore.state.gamification;
    if (!(g.inventory || []).includes(item.id)) return false;
    const decor = { ...(g.gardenDecor || {}) };
    decor[item.slot] = item.id;
    userStore.updateGamification({ gardenDecor: decor });
    return true;
}

/**
 * @param {import('../../core/user-store/index.js').UserStore} userStore
 * @param {'sky'|'ground'} slot
 */
export function unequipGardenDecor(userStore, slot) {
    const g = userStore.state.gamification;
    const decor = { ...(g.gardenDecor || {}) };
    delete decor[slot];
    userStore.updateGamification({ gardenDecor: decor });
}

/** @param {import('../../core/user-store/index.js').UserStore['state']['gamification']} g @param {'sky'|'ground'} slot */
export function getEquippedDecor(g, slot) {
    const id = g.gardenDecor?.[slot];
    return id ? getShopItem(id) : null;
}
