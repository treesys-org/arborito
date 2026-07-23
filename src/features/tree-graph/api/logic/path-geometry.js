/**
 * Pure geometry for tree path chrome (trunk + branch connector).
 * Trunk coords are relative to #mobile-trunk-col; connector uses #mobile-trunk-scroll-content.
 */

/**
 * @param {string} d
 * @param {number} ax
 * @param {number} ay
 * @param {number} bx
 * @param {number} by
 * @param {number} bendSign
 */
export function appendOrganicTrunkSegment(d, ax, ay, bx, by, bendSign) {
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    const perpX = -dy / len;
    const perpY = dx / len;
    const strength = Math.min(20, Math.max(5, len * 0.3));
    const cx = Math.round(mx + perpX * strength * bendSign);
    const cy = Math.round(my + perpY * strength * bendSign);
    return `${d} Q ${cx} ${cy} ${Math.round(bx)} ${Math.round(by)}`;
}

/** @param {{ x: number, y: number, segIndex?: number }[]} points */
function pathFromTrunkPoints(points) {
    if (!points?.length) return '';
    if (points.length === 1) {
        return `M ${Math.round(points[0].x)} ${Math.round(points[0].y)}`;
    }
    let d = `M ${Math.round(points[0].x)} ${Math.round(points[0].y)}`;
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1];
        const b = points[i];
        const si = b.segIndex != null ? b.segIndex : i;
        const bendSign = si % 2 === 0 ? 1 : -1;
        d = appendOrganicTrunkSegment(d, a.x, a.y, b.x, b.y, bendSign);
    }
    return d;
}

/** @param {number} centerX @param {number} i */
function trunkKnotX(centerX, i) {
    if (i === 0) return centerX;
    return centerX + (i % 2 === 0 ? 6 : -6);
}

/** @param {HTMLElement} wrap @param {HTMLElement} ancestor */
function knotCenterY(wrap, ancestor) {
    const knot = wrap.querySelector('.mobile-knot') || wrap;
    const top = layoutOffsetTop(knot, ancestor);
    return top + knot.offsetHeight / 2;
}

/** Offset within an ancestor (stable while scrolling). */
export function layoutOffsetTop(el, ancestor) {
    if (!el || !ancestor) return 0;
    if (el === ancestor) return 0;
    try {
        const er = el.getBoundingClientRect();
        const ar = ancestor.getBoundingClientRect();
        return er.top - ar.top;
    } catch {
        return 0;
    }
}

/** @param {HTMLElement} el @param {HTMLElement} ancestor */
export function layoutOffsetLeft(el, ancestor) {
    if (!el || !ancestor) return 0;
    if (el === ancestor) return 0;
    try {
        const er = el.getBoundingClientRect();
        const ar = ancestor.getBoundingClientRect();
        return er.left - ar.left;
    } catch {
        return 0;
    }
}

/**
 * Organic trunk path through knot centers.
 * @param {{ knotCentersY: number[], centerX: number, activeIndex: number, topAnchorY?: number }} opts
 * @returns {{ d: string, dActive: string }}
 */
export function buildTrunkPaths({ knotCentersY, centerX, activeIndex, topAnchorY = 0 }) {
    if (!knotCentersY?.length) {
        return { d: '', dActive: '' };
    }

    const trunkPoints = knotCentersY.map((y, i) => ({
        x: trunkKnotX(centerX, i),
        y,
        segIndex: i,
    }));
    trunkPoints.push({ x: centerX, y: topAnchorY, segIndex: knotCentersY.length });

    const d = pathFromTrunkPoints(trunkPoints);

    const idx = activeIndex >= 0 ? activeIndex : knotCentersY.length - 1;
    const activeEnd = Math.min(idx, knotCentersY.length - 1);
    const activeSlice = trunkPoints.slice(0, activeEnd + 1);
    // Root-only / single knot: do not paint the full trunk active (fallback to d painted all orange).
    const dActive = activeSlice.length >= 2 ? pathFromTrunkPoints(activeSlice) : '';

    return { d, dActive };
}

/**
 * L-shaped branch connector (knot → panel).
 * @param {{ x1: number, y1: number, x2: number, panelMidY: number, rootOnly?: boolean }} opts
 * @returns {string}
 */
export function buildConnectorPath({ x1, y1, x2, panelMidY, rootOnly = false }) {
    const y2 = rootOnly && Math.abs(panelMidY - y1) < 56 ? y1 : panelMidY;
    const span = x2 - x1;
    const arm = Math.min(120, Math.max(10, Math.max(0, span) * 0.38));
    const mx = span > 6 ? Math.min(x1 + arm, x2 - 3) : x1 + arm;
    return `M ${x1} ${y1} L ${mx} ${y1} L ${mx} ${y2} L ${x2} ${y2}`;
}

function knotWrap(el) {
    return el?.closest?.('.mobile-knot-wrapper') || el;
}

export function listKnotEls(knotsContainer) {
    if (!knotsContainer) return [];
    return [...knotsContainer.children].filter(
        (el) => el instanceof HTMLElement && el.querySelector('.mobile-knot')
    );
}

function findActiveKnotEl(knotsContainer) {
    for (const wrap of listKnotEls(knotsContainer)) {
        const knot = wrap.querySelector('.mobile-knot.active');
        if (knot) return { wrap, knot };
    }
    return { wrap: null, knot: null };
}

/**
 * Measure DOM and produce SVG layout for TreePathChrome.
 * @param {{
 *   scrollContent: HTMLElement,
 *   trunkCol: HTMLElement,
 *   trunkBody: HTMLElement,
 *   knotsContainer: HTMLElement,
 *   panelEl: HTMLElement | null,
 *   activeIndex?: number,
 * }} refs
 * @returns {null | {
 *   trunkD: string,
 *   trunkActiveD: string,
 *   connectorD: string,
 *   svgWidth: number,
 *   trunkSvgWidth: number,
 *   svgHeight: number,
 *   trunkSvgHeight: number,
 *   svgLeft: number,
 *   activeIndex: number,
 * }}
 */
export function measureTreePathLayout(refs) {
    const { scrollContent: sc, trunkCol: col, trunkBody, knotsContainer, panelEl } = refs;
    if (!sc || !col || !knotsContainer) return null;
    if (!sc.clientWidth || !col.clientWidth) {
        return {
            trunkD: '',
            trunkActiveD: '',
            connectorD: '',
            svgWidth: 1,
            trunkSvgWidth: 1,
            svgHeight: Math.max(sc?.scrollHeight || 1, 1),
            trunkSvgHeight: Math.max(col?.scrollHeight || 1, 1),
            svgLeft: 0,
            activeIndex: -1,
            needsRetry: true,
        };
    }

    const wraps = listKnotEls(knotsContainer);
    if (!wraps.length) {
        return {
            trunkD: '',
            trunkActiveD: '',
            connectorD: '',
            svgWidth: Math.max(sc.clientWidth, 1),
            trunkSvgWidth: Math.max(col.clientWidth, 1),
            svgHeight: Math.max(sc.scrollHeight, 1),
            trunkSvgHeight: Math.max(col.scrollHeight, 1),
            svgLeft: 0,
            activeIndex: -1,
            needsRetry: true,
        };
    }

    const colW = col.clientWidth || 72;
    const centerX = colW / 2;
    const topAnchorY = -layoutOffsetTop(col, sc);

    const knotCentersY = wraps.map((wrap) => knotCenterY(wrap, col));

    const { wrap: activeWrap, knot: activeKnot } = findActiveKnotEl(knotsContainer);
    let activeIndex = activeKnot ? wraps.indexOf(activeWrap) : wraps.length - 1;
    if (refs.activeIndex != null && refs.activeIndex >= 0) {
        activeIndex = refs.activeIndex;
    }

    const { d: trunkD, dActive: trunkActiveD } = buildTrunkPaths({
        knotCentersY,
        centerX,
        activeIndex,
        topAnchorY,
    });

    let connectorD = '';
    if (activeKnot && panelEl && trunkBody) {
        const wrap = activeWrap || knotWrap(activeKnot);
        const knot = wrap.querySelector('.mobile-knot') || activeKnot;
        const knotTop = layoutOffsetTop(knot, sc);
        const y1 = knotTop + knot.offsetHeight / 2;
        const x1 = layoutOffsetLeft(knot, sc) + knot.offsetWidth;
        const x2 = layoutOffsetLeft(panelEl, sc);
        const panelMidY = layoutOffsetTop(panelEl, sc) + panelEl.offsetHeight / 2;
        const rootOnly = wraps.length === 1 && activeKnot.classList.contains('mobile-knot--svg');
        connectorD = buildConnectorPath({ x1, y1, x2, panelMidY, rootOnly });
    }

    const bodyW = trunkBody?.scrollWidth || trunkBody?.clientWidth || sc.clientWidth;
    const trunkSvgHeight = Math.max(col.scrollHeight, col.offsetHeight, 1);
    const svgHeight = Math.max(sc.scrollHeight, 1);
    let insetLeft = 0;
    try {
        insetLeft = parseFloat(getComputedStyle(sc).paddingLeft) || 0;
    } catch {
        insetLeft = 0;
    }
    const connectorRight = panelEl
        ? layoutOffsetLeft(panelEl, sc) + panelEl.offsetWidth + 12
        : insetLeft + colW + 12;
    const trunkSvgWidth = Math.max(colW, 1);
    const svgWidth = Math.max(bodyW, connectorRight, insetLeft + colW, 1);

    return {
        trunkD,
        trunkActiveD,
        connectorD,
        svgWidth,
        trunkSvgWidth,
        svgHeight,
        trunkSvgHeight,
        svgLeft: 0,
        activeIndex,
    };
}
