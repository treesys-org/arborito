import { getArboritoStore as store } from '../../../core/store-singleton.js';
import { getPanelRef } from '../../../app/panel-refs.js';
import { TOUR_DONE_KEY_CONSTRUCTION } from './logic/product-tour-steps.js';

/** Queue tour starts that fire before the custom element is connected. */
const pendingTourStarts = [];

/** Construction tour requested while a dialog/overlay still blocks tryStart. */
let pendingConstructionTourDetail = null;
let constructionTourFlushTimer = null;
let constructionTourStoreBound = false;

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
    scheduleConstructionTourFlush();
}

function uiBlocksConstructionTour() {
    const s = store.state;
    const v = store.value;
    return !!(v.modal || v.previewNode || s.modalOverlay || s.treeGrowingOverlay || s.treeHydrating);
}

function constructionTourAlreadyDone() {
    try {
        return !!localStorage.getItem(TOUR_DONE_KEY_CONSTRUCTION);
    } catch {
        return true;
    }
}

function flushConstructionTourPending() {
    if (!pendingConstructionTourDetail) return;
    if (constructionTourAlreadyDone()) {
        pendingConstructionTourDetail = null;
        return;
    }
    if (!store.value.constructionMode) return;
    if (uiBlocksConstructionTour()) return;
    const tour = getPanelRef('product-tour');
    if (tour?._active) {
        pendingConstructionTourDetail = null;
        return;
    }
    const detail = pendingConstructionTourDetail;
    startTourFromDetail(detail);
    /* Keep pending until the tour is actually active — tryStart may still wait for anchors. */
    if (tour?._active || getPanelRef('product-tour')?._active) {
        pendingConstructionTourDetail = null;
    }
}

function scheduleConstructionTourFlush() {
    if (!pendingConstructionTourDetail) return;
    if (constructionTourFlushTimer) clearTimeout(constructionTourFlushTimer);
    constructionTourFlushTimer = setTimeout(() => {
        constructionTourFlushTimer = null;
        flushConstructionTourPending();
        /* Anchors / dock may paint a frame later after constructionMode flips. */
        if (pendingConstructionTourDetail && store.value.constructionMode && !uiBlocksConstructionTour()) {
            constructionTourFlushTimer = setTimeout(() => {
                constructionTourFlushTimer = null;
                flushConstructionTourPending();
            }, 160);
        }
    }, 80);
}

function ensureConstructionTourStoreWatch() {
    if (constructionTourStoreBound || typeof store?.addEventListener !== 'function') return;
    constructionTourStoreBound = true;
    store.addEventListener('state-change', () => {
        if (!pendingConstructionTourDetail) return;
        scheduleConstructionTourFlush();
    });
}

/**
 * Start the one-time construction tour after entering construction (plant, fork, helmet).
 * Keeps a pending request until modals/overlays clear so plant→sync dialogs do not swallow it.
 */
export function requestConstructionTourOnce({ source = 'construction-enter' } = {}) {
    if (constructionTourAlreadyDone()) return;
    ensureConstructionTourStoreWatch();
    pendingConstructionTourDetail = { force: false, mode: 'construction', source };
    const fire = () => {
        window.dispatchEvent(
            new CustomEvent('arborito-start-tour', {
                detail: { source, mode: 'construction' },
            })
        );
        scheduleConstructionTourFlush();
    };
    /* Double rAF: construction dock / helmet anchors need a paint after constructionMode. */
    if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => requestAnimationFrame(fire));
    } else {
        fire();
    }
}

/** @param {{ mode?: string }} detail */
export function noteConstructionTourStartBlocked(detail = {}) {
    if (String(detail.mode || '') !== 'construction') return;
    if (constructionTourAlreadyDone()) return;
    ensureConstructionTourStoreWatch();
    pendingConstructionTourDetail = normalizeTourStartDetail({ ...detail, mode: 'construction' });
}

export function clearPendingConstructionTour() {
    pendingConstructionTourDetail = null;
    if (constructionTourFlushTimer) {
        clearTimeout(constructionTourFlushTimer);
        constructionTourFlushTimer = null;
    }
}

if (typeof window !== 'undefined' && !window.__arboritoTourStartBridge) {
    window.__arboritoTourStartBridge = true;
    window.addEventListener('arborito-start-tour', (e) => {
        startTourFromDetail(e.detail || {});
    });
}
