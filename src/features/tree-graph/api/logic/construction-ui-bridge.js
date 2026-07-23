/**
 * Construction overlay state on store.graphUi (replaces engine._constructionUI).
 */
import { getArboritoStore } from '../../../../core/store-singleton.js';

/** @param {object | null} state */
export function setConstructionUI(state) {
    getArboritoStore()?.setConstructionOverlay?.(state);
}

export function clearConstructionUI() {
    getArboritoStore()?.setConstructionOverlay?.(null);
}

/** @param {HTMLElement} el */
export function rectFromElement(el) {
    if (!el?.getBoundingClientRect) return null;
    const r = el.getBoundingClientRect();
    return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
}
