/**
 * Trunk scroll policy — root grounded on floor, active branch centered.
 * Uses React host refs (no graph engine).
 */
import { getArboritoStore as store } from '../../../../core/store-singleton.js';
import { layoutOffsetTop } from './path-geometry.js';
import { getMobilePath } from '../graph-ui-accessors.js';

/** Root clover SVG bleeds below its layout box (translateY + lobes + glow). */
export const ROOT_KNOT_VISUAL_OVERFLOW_PX = 28;

function isDesktopPathUi() {
    return typeof document !== 'undefined' && document.documentElement.classList.contains('arborito-desktop');
}

function containerBottomPad(container) {
    try {
        return parseFloat(window.getComputedStyle(container).paddingBottom) || 0;
    } catch {
        return 0;
    }
}

/** @param {object} hosts resolved DOM elements */
function getMobileRootWrap(hosts) {
    return hosts.knotsContainer?.querySelector('.mobile-knot-wrapper:has(.mobile-knot--svg)');
}

function maxScrollTopKeepingRootGrounded(container, sc, rootWrap) {
    if (!container || !sc || !rootWrap) return null;
    const rootBottom = layoutOffsetTop(rootWrap, sc) + rootWrap.offsetHeight;
    return Math.max(
        0,
        rootBottom - container.clientHeight + containerBottomPad(container) + ROOT_KNOT_VISUAL_OVERFLOW_PX
    );
}

function effectiveMaxTrunkScrollTop(hosts, container, sc, rootWrap) {
    const rootCap = maxScrollTopKeepingRootGrounded(container, sc, rootWrap);
    let knotCap = null;
    if (typeof document !== 'undefined' && hosts.knotsContainer) {
        let clearance = 0;
        try {
            clearance =
                parseFloat(
                    window.getComputedStyle(document.documentElement).getPropertyValue(
                        '--arbor-mobile-pres-clearance'
                    )
                ) || 0;
        } catch {
            clearance = 0;
        }
        if (clearance > 0) {
            const topWrap = hosts.knotsContainer.lastElementChild;
            if (topWrap) {
                const knotTop = layoutOffsetTop(topWrap, sc);
                knotCap = Math.max(0, knotTop - clearance);
            }
        }
    }
    if (rootCap == null && knotCap == null) return null;
    if (rootCap == null) return knotCap;
    if (knotCap == null) return rootCap;
    return Math.min(rootCap, knotCap);
}

function rootLayoutBounds(rootWrap, sc) {
    const top = layoutOffsetTop(rootWrap, sc);
    return { top, bottom: top + rootWrap.offsetHeight };
}

function isRootVisibleAtScroll(container, sc, rootWrap, scrollTop) {
    if (!container || !sc || !rootWrap) return false;
    const { top, bottom } = rootLayoutBounds(rootWrap, sc);
    const viewTop = scrollTop;
    const viewBottom = scrollTop + container.clientHeight;
    return bottom > viewTop && top < viewBottom;
}

function computeActiveBranchScroll(hosts) {
    const container = hosts.trunkContainer;
    const sc = hosts.scrollContent;
    const branch = hosts.rightCol?.querySelector('.mobile-active-branch');
    const activeWrap = hosts.knotsContainer?.querySelector('.mobile-knot-wrapper:has(.mobile-knot.active)');
    if (!container || !sc || !branch || !activeWrap) return null;

    const labelRow = branch.querySelector('.mobile-label-row.is-active') || branch;
    const labelTop = layoutOffsetTop(labelRow, sc);
    const knotTop = layoutOffsetTop(activeWrap, sc);
    const desk = isDesktopPathUi();
    const anchor = Math.min(container.clientHeight * 0.18, desk ? 96 : 88);
    let scroll = Math.max(0, labelTop - anchor);
    const knotMid = knotTop + activeWrap.offsetHeight / 2;
    const labelMid = labelTop + labelRow.offsetHeight / 2;
    scroll = Math.max(0, scroll + (knotMid - labelMid));
    return scroll;
}

function applyBranchScrollWithGroundedRoot(hosts, branchScroll, lockRef) {
    const container = hosts.trunkContainer;
    const sc = hosts.scrollContent;
    const rootWrap = getMobileRootWrap(hosts);
    if (!container || branchScroll == null) return;

    let scroll = branchScroll;
    if (rootWrap) {
        const groundCap = effectiveMaxTrunkScrollTop(hosts, container, sc, rootWrap);
        if (groundCap != null && isRootVisibleAtScroll(container, sc, rootWrap, scroll)) {
            scroll = groundCap;
        }
    }
    lockRef.current = true;
    container.scrollTop = scroll;
    lockRef.current = false;
}

function scrollMobileTrunkToRootBottom(hosts, lockRef) {
    const container = hosts.trunkContainer;
    const sc = hosts.scrollContent;
    const rootWrap = getMobileRootWrap(hosts);
    if (!container || !sc || !rootWrap) return;
    const maxScroll = effectiveMaxTrunkScrollTop(hosts, container, sc, rootWrap);
    if (maxScroll != null) {
        lockRef.current = true;
        container.scrollTop = maxScroll;
        lockRef.current = false;
    }
}

function scrollMobilePathToActiveBranch(hosts, lockRef) {
    const branchScroll = computeActiveBranchScroll(hosts);
    if (branchScroll == null) return;
    applyBranchScrollWithGroundedRoot(hosts, branchScroll, lockRef);
}

function resolvePathNodesFromStore() {
    const dataRoot = store.value?.data;
    if (!dataRoot) return [];
    const mobilePath = getMobilePath();
    if (!mobilePath.length) return [dataRoot];
    const pathNodes = [dataRoot];
    for (let i = 1; i < mobilePath.length; i++) {
        const next = store.findNode(mobilePath[i]);
        if (!next) break;
        pathNodes.push(next);
    }
    return pathNodes;
}

/** @param {object} hostRefs React refs bag */
export function resolveScrollHosts(hostRefs) {
    const trunkBody = hostRefs?.trunkBody?.current;
    return {
        trunkContainer: hostRefs?.trunkContainer?.current ?? null,
        scrollContent: hostRefs?.scrollContent?.current ?? null,
        knotsContainer: hostRefs?.knots?.current ?? null,
        rightCol: trunkBody?.querySelector('#mobile-right-col') ?? null,
    };
}

/**
 * Hard product rule: trunk scroll never past the ground line.
 * @param {object} hosts resolved DOM from resolveScrollHosts
 * @param {{ current: boolean }} lockRef
 */
export function clampMobileTrunkScrollForVisibleRoot(hosts, lockRef = { current: false }) {
    if (lockRef.current) return;
    const container = hosts.trunkContainer;
    const sc = hosts.scrollContent;
    const rootWrap = getMobileRootWrap(hosts);
    if (!container || !sc || !rootWrap) return;

    const groundCap = effectiveMaxTrunkScrollTop(hosts, container, sc, rootWrap);
    if (groundCap == null) return;
    if (container.scrollTop <= groundCap) return;

    lockRef.current = true;
    container.scrollTop = groundCap;
    lockRef.current = false;
}

/** @param {object} hosts @param {object[]} pathNodes @param {{ current: boolean }} lockRef */
export function syncMobilePathScroll(hosts, pathNodes, lockRef = { current: false }) {
    if (!Array.isArray(pathNodes) || !pathNodes.length) return;
    if (pathNodes.length === 1 && pathNodes[0]?.type === 'root') {
        scrollMobileTrunkToRootBottom(hosts, lockRef);
    } else {
        scrollMobilePathToActiveBranch(hosts, lockRef);
    }
    clampMobileTrunkScrollForVisibleRoot(hosts, lockRef);
}

export const syncPathScroll = syncMobilePathScroll;

/** @param {object} hosts */
export function clampTrunkScroll(hosts, lockRef) {
    clampMobileTrunkScrollForVisibleRoot(hosts, lockRef);
}

/** Re-anchor trunk scroll after layout changes. */
export function regroundMobileTrunkScroll(hostRefs, lockRef = { current: false }) {
    const hosts = resolveScrollHosts(hostRefs);
    if (!hosts.trunkContainer) return;
    const pathNodes = resolvePathNodesFromStore();
    if (!pathNodes.length) return;
    requestAnimationFrame(() => {
        syncMobilePathScroll(hosts, pathNodes, lockRef);
    });
}

export const regroundTrunkScroll = regroundMobileTrunkScroll;
