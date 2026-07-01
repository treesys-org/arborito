/**
 * Imperative graph panel helpers for non-React callers (viewport repaint, shell lazy init).
 */
import { getArboritoStore } from '../../../core/store-singleton.js';
import { getPanelRef } from '../../../app/panel-refs.js';
import { regroundMobileTrunkScroll } from './logic/path-scroll.js';

function graphRootEl() {
    const ref = getPanelRef('graph');
    if (ref instanceof HTMLElement) return ref;
    if (ref?.root instanceof HTMLElement) return ref.root;
    return document.querySelector('[data-arborito-panel="graph"]');
}

export function graphPanelRootEl() {
    return graphRootEl();
}

function hostRefsFromRoot(root) {
    if (!root) return null;
    return {
        scrollContent: { current: root.querySelector('#mobile-trunk-scroll-content') },
        trunkBody: { current: root.querySelector('#mobile-trunk-body') },
        trunkCol: { current: root.querySelector('#mobile-trunk-col') },
        knots: { current: root.querySelector('#mobile-knots-container') },
        trunkContainer: { current: root.querySelector('#mobile-trunk-container') },
    };
}

/** Branch metadata moved to the publish hub modal — clear legacy mobile clearance only. */
export function syncTreePresentationSlot(root = graphRootEl()) {
    if (!root || !getArboritoStore()?.value.constructionMode) return;
    if (typeof document !== 'undefined') {
        document.documentElement.style.removeProperty('--arbor-mobile-pres-clearance');
    }
    requestAnimationFrame(() => {
        const presApi = getPanelRef('tree-presentation');
        presApi?.syncMobilePresClearanceFromHost?.();
    });
}

export function handleGraphPanelResize() {
    getArboritoStore()?.bumpGraphUiRevision();
    syncTreePresentationSlot();
}

export function regroundGraphTrunkScroll() {
    const hosts = hostRefsFromRoot(graphRootEl());
    if (hosts) regroundMobileTrunkScroll(hosts);
}

/** Panel ref API registered by useGraphPanel (replaces graph engine). */
export function createGraphPanelRef(root) {
    return {
        root,
        handleResize: handleGraphPanelResize,
        syncTreePresentationSlot: () => syncTreePresentationSlot(root),
        regroundMobileTrunkScroll: regroundGraphTrunkScroll,
        startMovePickOnTree(nodeId) {
            getArboritoStore()?.startMovePickOnTree(nodeId, root);
        },
        get mobilePath() {
            return getArboritoStore()?.state.graphUi?.mobilePath || [];
        },
        invalidateMobilePrototypeKeys() {
            getArboritoStore()?.invalidateMobilePrototypeKeys?.();
        },
    };
}
