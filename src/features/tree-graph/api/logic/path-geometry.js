/**
 * Pure geometry for tree path chrome (trunk + branch connector).
 * All coordinates are relative to #mobile-trunk-scroll-content.
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
    const cx = mx + perpX * strength * bendSign;
    const cy = my + perpY * strength * bendSign;
    return `${d} Q ${cx} ${cy} ${bx} ${by}`;
}

/** Offset within an ancestor (scroll-content coords; stable while scrolling). */
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
 * @param {{ knotCentersY: number[], centerX: number, activeIndex: number }} opts
 * @returns {{ d: string, dActive: string }}
 */
export function buildTrunkPaths({ knotCentersY, centerX, activeIndex }) {
    if (!knotCentersY?.length) {
        return { d: '', dActive: '' };
    }

    const bottomY = Math.max(...knotCentersY);
    const trunkPoints = [{ x: centerX, y: bottomY, segIndex: 0 }];
    knotCentersY.forEach((y, i) => {
        const jitter = i % 2 === 0 ? 6 : -6;
        trunkPoints.push({ x: centerX + jitter, y, segIndex: i + 1 });
    });
    trunkPoints.push({ x: centerX, y: 0, segIndex: knotCentersY.length + 1 });

    let d = `M ${trunkPoints[0].x} ${trunkPoints[0].y}`;
    for (let i = 1; i < trunkPoints.length; i++) {
        const p0 = trunkPoints[i - 1];
        const p1 = trunkPoints[i];
        const bendSign = i % 2 === 0 ? 1 : -1;
        d = appendOrganicTrunkSegment(d, p0.x, p0.y, p1.x, p1.y, bendSign);
    }

    const idx = activeIndex >= 0 ? activeIndex : knotCentersY.length - 1;
    const activeY = knotCentersY[idx] ?? bottomY;
    const activeSlice = [{ x: trunkPoints[0].x, y: trunkPoints[0].y, segIndex: 0 }];
    for (let i = 0; i < knotCentersY.length; i++) {
        const y = knotCentersY[i];
        if (y >= activeY - 2) activeSlice.push({ ...trunkPoints[i + 1] });
    }

    let dActive = d;
    if (activeSlice.length >= 2) {
        dActive = `M ${activeSlice[0].x} ${activeSlice[0].y}`;
        for (let j = 1; j < activeSlice.length; j++) {
            const a = activeSlice[j - 1];
            const b = activeSlice[j];
            const si = b.segIndex != null ? b.segIndex : j;
            const bendSign = si % 2 === 0 ? 1 : -1;
            dActive = appendOrganicTrunkSegment(dActive, a.x, a.y, b.x, b.y, bendSign);
        }
    }

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
 *   svgHeight: number,
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
            svgHeight: Math.max(sc?.scrollHeight || 1, 1),
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
            svgHeight: Math.max(sc.scrollHeight, 1),
            svgLeft: 0,
            activeIndex: -1,
            needsRetry: true,
        };
    }

    const colW = col.clientWidth || 72;
    let insetLeft = 0;
    try {
        insetLeft = parseFloat(getComputedStyle(sc).paddingLeft) || 0;
    } catch {
        insetLeft = 0;
    }
    const centerX = insetLeft + Math.max(28, colW / 2);

    const knotCentersY = wraps.map((wrap) => {
        const top = layoutOffsetTop(wrap, sc);
        return top + wrap.offsetHeight / 2;
    });
    const knotBottoms = wraps.map((wrap) => layoutOffsetTop(wrap, sc) + wrap.offsetHeight);
    const bottomY = Math.max(...knotCentersY);
    const lowestBottom = Math.max(...knotBottoms);

    const { wrap: activeWrap, knot: activeKnot } = findActiveKnotEl(knotsContainer);
    let activeIndex = activeKnot ? wraps.indexOf(activeWrap) : wraps.length - 1;
    if (refs.activeIndex != null && refs.activeIndex >= 0) {
        activeIndex = refs.activeIndex;
    }

    const { d: trunkD, dActive: trunkActiveD } = buildTrunkPaths({
        knotCentersY,
        centerX,
        activeIndex,
    });

    let connectorD = '';
    if (activeKnot && panelEl && trunkBody) {
        const wrap = activeWrap || knotWrap(activeKnot);
        const knotTop = layoutOffsetTop(wrap, sc);
        const y1 = knotTop + wrap.offsetHeight / 2;
        const x1 = layoutOffsetLeft(wrap, sc) + wrap.offsetWidth;
        const x2 = layoutOffsetLeft(panelEl, sc);
        const panelMidY = layoutOffsetTop(panelEl, sc) + panelEl.offsetHeight / 2;
        const rootOnly = wraps.length === 1 && activeKnot.classList.contains('mobile-knot--svg');
        connectorD = buildConnectorPath({ x1, y1, x2, panelMidY, rootOnly });
    }

    const bodyW = trunkBody?.scrollWidth || trunkBody?.clientWidth || sc.clientWidth;
    const layerH = Math.max(sc.scrollHeight, lowestBottom + 16, bottomY + 16, 1);
    const connectorRight = panelEl
        ? layoutOffsetLeft(panelEl, sc) + panelEl.offsetWidth + 12
        : insetLeft + colW + 12;
    const svgWidth = Math.max(bodyW, connectorRight, insetLeft + colW, 1);

    return {
        trunkD,
        trunkActiveD,
        connectorD,
        svgWidth,
        svgHeight: layerH,
        svgLeft: 0,
        activeIndex,
    };
}
