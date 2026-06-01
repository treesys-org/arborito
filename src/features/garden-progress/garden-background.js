/**
 * Equipped garden decor rendered on the graph scene (sky + ground), behind nodes.
 */

import { getEquippedDecor } from './lumen-shop.js';

/** @type {Record<string, { count: number, layer: 'sky'|'ground', anim: string }>} */
const DECO_LAYOUT = {
    'deco-fireflies': { count: 7, layer: 'sky', anim: 'twinkle' },
    'deco-butterfly': { count: 4, layer: 'sky', anim: 'flutter' },
    'deco-birdhouse': { count: 1, layer: 'sky', anim: 'still' },
    'deco-lantern': { count: 2, layer: 'ground', anim: 'glow' },
    'deco-fountain': { count: 1, layer: 'ground', anim: 'sparkle' },
    'deco-mushroom': { count: 3, layer: 'ground', anim: 'still' }
};

/** Preset positions (% of layer box) per particle index */
const SKY_SPOTS = [
    [8, 12], [22, 8], [38, 18], [55, 10], [72, 16], [88, 12], [45, 6],
    [15, 22], [62, 24], [82, 20], [30, 14]
];
const GROUND_SPOTS = [
    [12, 72], [28, 78], [50, 82], [68, 76], [85, 80], [40, 88], [58, 74]
];

function getGardenBgHost() {
    return document.getElementById('graph-container') || document.getElementById('app');
}

/**
 * @param {import('../../core/store.js').default} store
 */
export function syncGardenBackground(store) {
    if (typeof document === 'undefined') return;

    const hide =
        !store?.userStore?.state?.gamification ||
        store.state?.constructionMode ||
        !store.state?.data;

    let el = document.getElementById('arborito-garden-bg');
    if (hide) {
        if (el) el.remove();
        document.documentElement.classList.remove('arborito-garden-decor');
        return;
    }

    const g = store.userStore.state.gamification;
    const skyItem = getEquippedDecor(g, 'sky');
    const groundItem = getEquippedDecor(g, 'ground');
    if (!skyItem && !groundItem) {
        if (el) el.remove();
        document.documentElement.classList.remove('arborito-garden-decor');
        return;
    }

    document.documentElement.classList.add('arborito-garden-decor');

    const host = getGardenBgHost();
    if (!host) return;

    if (!el) {
        el = document.createElement('div');
        el.id = 'arborito-garden-bg';
        el.className = 'arborito-garden-bg';
        el.setAttribute('aria-hidden', 'true');
        host.insertBefore(el, host.firstChild);
    } else if (el.parentElement !== host) {
        host.insertBefore(el, host.firstChild);
    }

    el.innerHTML = `
        <div class="arborito-garden-bg__sky">${skyItem ? buildLayerHtml(skyItem, 'sky') : ''}</div>
        <div class="arborito-garden-bg__ground">${groundItem ? buildLayerHtml(groundItem, 'ground') : ''}</div>
    `;
}

/**
 * @param {{ id: string, icon: string }} item
 * @param {'sky'|'ground'} layer
 */
function buildLayerHtml(item, layer) {
    const layout = DECO_LAYOUT[item.id] || { count: 1, layer, anim: 'still' };
    const spots = layer === 'sky' ? SKY_SPOTS : GROUND_SPOTS;
    const parts = [];
    for (let i = 0; i < layout.count; i++) {
        const [x, y] = spots[i % spots.length];
        parts.push(`
            <span
                class="arborito-garden-bg__particle arborito-garden-bg__particle--${layout.anim} arborito-garden-bg__particle--${item.id}"
                style="--gx:${x};--gy:${y};--gd:${(i * 0.7).toFixed(2)}s"
                aria-hidden="true"
            >${item.icon}</span>
        `);
    }
    return parts.join('');
}
