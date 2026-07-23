/**
 * Equipped garden decor rendered on the graph scene (sky + ground), behind nodes.
 */

import { getEquippedDecor } from './lumen-shop.js';

/** @type {Record<string, { count: number, layer: 'sky'|'ground', anim: string }>} */
export const DECO_LAYOUT = {
    'deco-fireflies': { count: 7, layer: 'sky', anim: 'twinkle' },
    'deco-butterfly': { count: 4, layer: 'sky', anim: 'flutter' },
    'deco-birdhouse': { count: 1, layer: 'sky', anim: 'still' },
    'deco-lantern': { count: 2, layer: 'ground', anim: 'glow' },
    'deco-fountain': { count: 1, layer: 'ground', anim: 'sparkle' },
    'deco-mushroom': { count: 3, layer: 'ground', anim: 'still' },
};

/** Preset positions (% of layer box) per particle index */
export const SKY_SPOTS = [
    [8, 12], [22, 8], [38, 18], [55, 10], [72, 16], [88, 12], [45, 6],
    [15, 22], [62, 24], [82, 20], [30, 14],
];
export const GROUND_SPOTS = [
    [12, 72], [28, 78], [50, 82], [68, 76], [85, 80], [40, 88], [58, 74],
];

/**
 * @param {import('../../../core/store.js' ).default} store
 * @returns {{ visible: boolean, skyItem: { id: string, icon: string } | null, groundItem: { id: string, icon: string } | null }}
 */
export function getGardenBackgroundState(store) {
    const hide =
        !store?.userStore?.state?.gamification ||
        store.state?.constructionMode ||
        !store.state?.data;

    if (hide) {
        return { visible: false, skyItem: null, groundItem: null };
    }

    const g = store.userStore.state.gamification;
    const skyItem = getEquippedDecor(g, 'sky');
    const groundItem = getEquippedDecor(g, 'ground');
    if (!skyItem && !groundItem) {
        return { visible: false, skyItem: null, groundItem: null };
    }

    return { visible: true, skyItem, groundItem };
}

/**
 * Toggle document-level decor class (CSS hooks). Rendering is handled by GardenBackground.jsx.
 * @param {import('../../../core/store.js' ).default} store
 */
export function syncGardenBackground(store) {
    if (typeof document === 'undefined') return;
    const { visible } = getGardenBackgroundState(store);
    document.documentElement.classList.toggle('arborito-garden-decor', visible);
}

/**
 * @param {{ id: string, icon: string }} item
 * @param {'sky'|'ground'} layer
 */
export function buildGardenLayerParticles(item, layer) {
    const layout = DECO_LAYOUT[item.id] || { count: 1, layer, anim: 'still' };
    const spots = layer === 'sky' ? SKY_SPOTS : GROUND_SPOTS;
    const particles = [];
    for (let i = 0; i < layout.count; i++) {
        const [x, y] = spots[i % spots.length];
        particles.push({
            key: `${item.id}-${i}`,
            anim: layout.anim,
            itemId: item.id,
            x,
            y,
            delay: `${(i * 0.7).toFixed(2)}s`,
            icon: item.icon,
        });
    }
    return particles;
}
