import { getArboritoStore as store } from '../../../core/store-singleton.js';
import { getPanelRef } from '../../../app/panel-refs.js';

/** Queue tour starts that fire before the custom element is connected. */
const pendingTourStarts = [];

export function normalizeTourStartDetail(detail = {}) {
    let mode = detail.mode ? String(detail.mode) : 'default';
    if (mode === 'default' && store.value.constructionMode) {
        mode = 'construction';
    }
    return {
        force: !!detail.force,
        mode,
        skipDockForOpenTrees: !!detail.skipDockForOpenTrees
    };
}

function startTourFromDetail(detail = {}) {
    const tour = getPanelRef('product-tour');
    if (!tour || typeof tour.tryStart !== 'function') {
        pendingTourStarts.push(normalizeTourStartDetail(detail));
        return;
    }
    tour.tryStart(normalizeTourStartDetail(detail));
}

export function flushPendingTourStarts(tourEl) {
    if (!tourEl || typeof tourEl.tryStart !== 'function') return;
    while (pendingTourStarts.length) {
        tourEl.tryStart(pendingTourStarts.shift());
    }
}

if (typeof window !== 'undefined' && !window.__arboritoTourStartBridge) {
    window.__arboritoTourStartBridge = true;
    window.addEventListener('arborito-start-tour', (e) => {
        startTourFromDetail(e.detail || {});
    });
}
