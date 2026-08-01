/**
 * Trunk scroll policy, root grounded on floor, active branch centered.
 * Uses React host refs (no graph engine).
 */
import { layoutOffsetTop } from './path-geometry.js';
import {
    isTrunkUserGesturing,
    beginProgrammaticTrunkScroll,
    endProgrammaticTrunkScroll,
} from './trunk-scroll-gesture.js';

/** Root clover SVG bleeds below its layout box (translateY + lobes + glow). */
const ROOT_KNOT_VISUAL_OVERFLOW_PX = 28;

/** Lesson reader covers the map — do not rewrite trunk scroll underneath it. */
function isLessonOverlayOpen() {
    if (typeof document === 'undefined') return false;
    return document.documentElement.classList.contains('arborito-lesson-open');
}

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

function writeTrunkScrollTop(container, scrollTop, lockRef) {
    beginProgrammaticTrunkScroll();
    try {
        lockRef.current = true;
        container.scrollTop = scrollTop;
        lockRef.current = false;
    } finally {
        endProgrammaticTrunkScroll();
    }
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
            scroll = Math.min(branchScroll, groundCap);
        }
    }
    writeTrunkScrollTop(container, scroll, lockRef);
}

function scrollMobileTrunkToRootBottom(hosts, lockRef) {
    const container = hosts.trunkContainer;
    const sc = hosts.scrollContent;
    const rootWrap = getMobileRootWrap(hosts);
    if (!container || !sc || !rootWrap) return;
    const maxScroll = effectiveMaxTrunkScrollTop(hosts, container, sc, rootWrap);
    if (maxScroll != null) {
        writeTrunkScrollTop(container, maxScroll, lockRef);
    }
}

/**
 * Resolve trunk scroll hosts from the live DOM (no React refs).
 * Used by the product tour so graph-root can re-ground on long branches.
 */
export function resolveScrollHostsFromDom() {
    if (typeof document === 'undefined') {
        return {
            trunkContainer: null,
            scrollContent: null,
            knotsContainer: null,
            rightCol: null,
        };
    }
    const trunkContainer =
        document.getElementById('mobile-trunk-container') ||
        document.querySelector('.mobile-trunk-container');
    const scrollContent =
        document.getElementById('mobile-trunk-scroll-content') ||
        trunkContainer?.querySelector?.('#mobile-trunk-scroll-content') ||
        null;
    const knotsContainer =
        document.getElementById('mobile-knots-container') ||
        document.querySelector('#mobile-trunk-col .mobile-knots-container') ||
        document.querySelector('.mobile-knots-container') ||
        null;
    const rightCol =
        document.getElementById('mobile-right-col') ||
        document.querySelector('#mobile-right-col') ||
        null;
    return { trunkContainer, scrollContent, knotsContainer, rightCol };
}

/**
 * Ground the root clover on the trunk floor (same policy as path sync).
 * @returns {boolean} true when a root wrap was found and scroll was applied
 */
export function groundGraphRootForTour() {
    const hosts = resolveScrollHostsFromDom();
    const rootWrap = getMobileRootWrap(hosts);
    if (!hosts.trunkContainer || !hosts.scrollContent || !rootWrap) return false;
    scrollMobileTrunkToRootBottom(hosts, { current: false });
    clampMobileTrunkScrollForVisibleRoot(hosts, { current: false });
    return true;
}

function scrollMobilePathToActiveBranch(hosts, lockRef) {
    const branchScroll = computeActiveBranchScroll(hosts);
    if (branchScroll == null) return;
    applyBranchScrollWithGroundedRoot(hosts, branchScroll, lockRef);
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
 * @param {{ force?: boolean }} [opts] force=true enforces even mid finger-pan
 *   (layout sync still skips while gesturing so pan does not fight recenter)
 */
export function clampMobileTrunkScrollForVisibleRoot(hosts, lockRef = { current: false }, opts = {}) {
    const force = opts?.force === true;
    if (lockRef.current || (!force && isTrunkUserGesturing()) || isLessonOverlayOpen()) return;
    const container = hosts.trunkContainer;
    const sc = hosts.scrollContent;
    const rootWrap = getMobileRootWrap(hosts);
    if (!container || !sc || !rootWrap) return;

    const groundCap = effectiveMaxTrunkScrollTop(hosts, container, sc, rootWrap);
    if (groundCap == null) return;
    if (container.scrollTop <= groundCap) return;

    lockRef.current = true;
    beginProgrammaticTrunkScroll();
    try {
        container.scrollTop = groundCap;
    } finally {
        endProgrammaticTrunkScroll();
        lockRef.current = false;
    }
}

/**
 * Live / post-gesture floor: resolve hosts from DOM and clamp past the ground
 * line even while a finger pan is active (padding/overscroll must not lift root).
 */
export function enforceMobileTrunkGroundFloor(lockRef = { current: false }) {
    clampMobileTrunkScrollForVisibleRoot(resolveScrollHostsFromDom(), lockRef, { force: true });
}

/**
 * After path remount / programmatic scrollTop, nudge WebKit to rebuild the
 * overflow scroll layer without toggling overflow (that toggle itself used to
 * leave pan-y dead after folder enter/back).
 */
function wakeTrunkOverflowScroller(container) {
    if (!container || typeof container.scrollTop !== 'number') return;
    const y = container.scrollTop;
    beginProgrammaticTrunkScroll();
    try {
        /* Tiny no-op nudge: forces compositor refresh without destroying pan-y. */
        container.scrollTop = y + (y > 0 ? -1 : 1);
        container.scrollTop = y;
    } finally {
        endProgrammaticTrunkScroll();
    }
}

/** @param {object} hosts @param {object[]} pathNodes @param {{ current: boolean }} lockRef */
export function syncMobilePathScroll(hosts, pathNodes, lockRef = { current: false }) {
    if (!Array.isArray(pathNodes) || !pathNodes.length) return;
    if (isTrunkUserGesturing()) return;
    if (pathNodes.length === 1 && pathNodes[0]?.type === 'root') {
        scrollMobileTrunkToRootBottom(hosts, lockRef);
    } else {
        scrollMobilePathToActiveBranch(hosts, lockRef);
    }
    clampMobileTrunkScrollForVisibleRoot(hosts, lockRef);
    wakeTrunkOverflowScroller(hosts.trunkContainer);
    /* Second nudge after the next paint — branch load / path restore races. */
    if (hosts.trunkContainer && typeof requestAnimationFrame === 'function') {
        const el = hosts.trunkContainer;
        requestAnimationFrame(() => wakeTrunkOverflowScroller(el));
    }
}

/**
 * After layout/viewport changes: only enforce the ground clamp.
 * Full recenter belongs to path changes (`useMobileTrunkScroll` + syncScroll).
 * Recentering here made open/close lesson feel like a rogue trunk jump.
 */
export function regroundMobileTrunkScroll(hostRefs, lockRef = { current: false }) {
    const hosts = resolveScrollHosts(hostRefs);
    if (!hosts.trunkContainer || isLessonOverlayOpen()) return;
    requestAnimationFrame(() => {
        clampMobileTrunkScrollForVisibleRoot(hosts, lockRef);
    });
}
