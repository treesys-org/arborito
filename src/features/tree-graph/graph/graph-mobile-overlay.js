/**
 * @param {string} d
 * @param {number} ax
 * @param {number} ay
 * @param {number} bx
 * @param {number} by
 * @param {number} bendSign
 */
function appendOrganicTrunkSegment(d, ax, ay, bx, by, bendSign) {
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

function isDesktopPathUi() {
    return typeof document !== 'undefined' && document.documentElement.classList.contains('arborito-desktop');
}

/** OffsetTop within a scroll-content ancestor (stable; independent of current scrollTop). */
function layoutOffsetTop(el, ancestor) {
    if (!el || !ancestor) return 0;
    let y = 0;
    for (let node = el; node && node !== ancestor; node = node.offsetParent) {
        y += node.offsetTop;
    }
    return y;
}

function containerBottomPad(container) {
    try {
        return parseFloat(window.getComputedStyle(container).paddingBottom) || 0;
    } catch {
        return 0;
    }
}

/** Max scrollTop where the root knot's bottom meets the container floor (layout coords). */
function maxScrollTopKeepingRootGrounded(container, sc, rootWrap) {
    if (!container || !sc || !rootWrap) return null;
    const rootBottom = layoutOffsetTop(rootWrap, sc) + rootWrap.offsetHeight;
    return Math.max(0, rootBottom - container.clientHeight + containerBottomPad(container));
}

function getMobileRootWrap(graph) {
    return graph.mobileKnotsContainer?.querySelector('.mobile-knot-wrapper:has(.mobile-knot--svg)');
}

function rootLayoutBounds(rootWrap, sc) {
    const top = layoutOffsetTop(rootWrap, sc);
    return { top, bottom: top + rootWrap.offsetHeight };
}

/** Whether the root knot intersects the scrollport at a given scrollTop. */
function isRootVisibleAtScroll(container, sc, rootWrap, scrollTop) {
    if (!container || !sc || !rootWrap) return false;
    const { top, bottom } = rootLayoutBounds(rootWrap, sc);
    const viewTop = scrollTop;
    const viewBottom = scrollTop + container.clientHeight;
    return bottom > viewTop && top < viewBottom;
}

/** Scroll target that centers the active branch row + knot (layout coords). */
function computeActiveBranchScroll(graph) {
    const container = graph.mobileTrunkContainer;
    const sc = graph.mobileTrunkScrollContent;
    const branch = graph.mobileRightCol?.querySelector('.mobile-active-branch');
    const activeWrap = graph.mobileKnotsContainer?.querySelector('.mobile-knot-wrapper:has(.mobile-knot.active)');
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

/**
 * Center on active branch unless the root would be visible — then anchor root to ground.
 * Applies on both mobile and desktop because the tree path UI is unified across breakpoints
 * and the root-grounded rule is a hard product invariant ("logo always on the floor, never
 * floats up off the sky"). Bypassing on desktop reintroduces the "flying root" regression.
 * @param {import('../graph.js').default} graph
 * @param {number} branchScroll
 */
function applyBranchScrollWithGroundedRoot(graph, branchScroll) {
    const container = graph.mobileTrunkContainer;
    const sc = graph.mobileTrunkScrollContent;
    const rootWrap = getMobileRootWrap(graph);
    if (!container || branchScroll == null) return;

    let scroll = branchScroll;
    if (rootWrap) {
        const groundCap = maxScrollTopKeepingRootGrounded(container, sc, rootWrap);
        if (groundCap != null && isRootVisibleAtScroll(container, sc, rootWrap, scroll)) {
            scroll = groundCap;
        }
    }
    graph._mobileScrollClampLock = true;
    container.scrollTop = scroll;
    graph._mobileScrollClampLock = false;
}

/**
 * Hard product rule, applied universally (mobile + desktop): the trunk scroll is never allowed
 * past the ground line. `groundCap` is the scrollTop where the root knot's bottom rests on the
 * container floor; anything beyond that pushes the root off-screen and gives the broken "flying
 * away into the sky" feel. The check is unconditional — it must also fire when the root has
 * already drifted *below* the viewport (e.g. after collapsing a deep path back to the root and
 * the previous deep scroll position survived the layout shrink) so the graph never appears as
 * an empty white area waiting for a manual scroll to recover.
 *
 * Only short-circuits:
 *   - `_mobileScrollClampLock`: skip while we're mid-write so we don't fight ourselves.
 *   - root knot not in the DOM yet: nothing to anchor to.
 *
 * @param {import('../graph.js').default} graph
 */
export function clampMobileTrunkScrollForVisibleRoot(graph) {
    if (graph._mobileScrollClampLock) return;
    const container = graph.mobileTrunkContainer;
    const sc = graph.mobileTrunkScrollContent;
    const rootWrap = getMobileRootWrap(graph);
    if (!container || !sc || !rootWrap) return;

    const groundCap = maxScrollTopKeepingRootGrounded(container, sc, rootWrap);
    if (groundCap == null) return;
    if (container.scrollTop <= groundCap) return;

    graph._mobileScrollClampLock = true;
    container.scrollTop = groundCap;
    graph._mobileScrollClampLock = false;
}

/**
 * Scroll so the root clover sits on the ground line — computed from layout, not stale scrollTop.
 * @param {import('../graph.js').default} graph
 */
function scrollMobileTrunkToRootBottom(graph) {
    const container = graph.mobileTrunkContainer;
    const sc = graph.mobileTrunkScrollContent;
    const rootWrap = getMobileRootWrap(graph);
    if (!container || !sc || !rootWrap) return;
    const maxScroll = maxScrollTopKeepingRootGrounded(container, sc, rootWrap);
    if (maxScroll != null) {
        graph._mobileScrollClampLock = true;
        container.scrollTop = maxScroll;
        graph._mobileScrollClampLock = false;
    }
}

/** Align active knot row + bullet marker; respects the visible-root ground anchor on every breakpoint. */
function scrollMobilePathToActiveBranch(graph) {
    const branchScroll = computeActiveBranchScroll(graph);
    if (branchScroll == null) return;
    applyBranchScrollWithGroundedRoot(graph, branchScroll);
}

/**
 * Derive scroll from path structure — call after every path change (mobile + desktop).
 * @param {import('../graph.js').default} graph
 * @param {object[]} pathNodes
 */
export function syncMobilePathScroll(graph, pathNodes) {
    if (!Array.isArray(pathNodes) || !pathNodes.length) return;
    if (pathNodes.length === 1 && pathNodes[0]?.type === 'root') {
        scrollMobileTrunkToRootBottom(graph);
    } else {
        scrollMobilePathToActiveBranch(graph);
    }
}

export function scheduleMobilePrototypeOverlay() {
    if (this.mobileOverlayTimer) clearTimeout(this.mobileOverlayTimer);
    this.mobileOverlayTimer = setTimeout(() => this.drawMobilePrototypeOverlay(), 50);
}

export function drawMobilePrototypeOverlay() {
    const knots = Array.from(this.mobileKnotsContainer.querySelectorAll('.mobile-knot'));
    if (knots.length === 0) {
        if (this.mobileBranchConnectorSvg) this.mobileBranchConnectorSvg.innerHTML = '';
        return;
    }

    const sc = this.mobileTrunkScrollContent;
    const col = this.mobileTrunkCol;
    if (!sc || !col) return;

    const svg = this.mobileTrunkBase.parentElement;
    const colW = col.clientWidth || 72;
    const centerX = Math.max(28, colW / 2);
    const desk = isDesktopPathUi();

    const knotCenterY = (knot) => {
        const wrap = knot.closest('.mobile-knot-wrapper') || knot;
        const r = wrap.getBoundingClientRect();
        const sr = sc.getBoundingClientRect();
        return r.top + r.height / 2 - sr.top;
    };
    const knotBottomY = (knot) => {
        const wrap = knot.closest('.mobile-knot-wrapper') || knot;
        const r = wrap.getBoundingClientRect();
        const sr = sc.getBoundingClientRect();
        return r.bottom - sr.top;
    };

    const knotCenters = knots.map((knot) => knotCenterY(knot));
    const bottomY = Math.max(...knotCenters);
    const lowestBottom = Math.max(...knots.map((knot) => knotBottomY(knot)));

    const layerH = Math.max(sc.scrollHeight, lowestBottom + 16, bottomY + 16, 1);

    svg.style.width = `${colW}px`;
    svg.style.height = `${layerH}px`;
    svg.style.top = '0';
    let insetLeft = 0;
    try {
        insetLeft = parseFloat(window.getComputedStyle(sc).paddingLeft) || 0;
    } catch {
        /* ignore */
    }
    svg.style.left = `${insetLeft}px`;

    /** Same trunk geometry as desktop: organic path from root up through knots to y=0. */
    const trunkPoints = [{ x: centerX, y: bottomY, segIndex: 0 }];
    knots.forEach((knot, i) => {
        const y = knotCenters[i];
        const jitter = i % 2 === 0 ? 6 : -6;
        trunkPoints.push({ x: centerX + jitter, y, segIndex: i + 1 });
    });
    trunkPoints.push({ x: centerX, y: 0, segIndex: knots.length + 1 });

    let d = `M ${trunkPoints[0].x} ${trunkPoints[0].y}`;
    for (let i = 1; i < trunkPoints.length; i++) {
        const p0 = trunkPoints[i - 1];
        const p1 = trunkPoints[i];
        const bendSign = i % 2 === 0 ? 1 : -1;
        d = appendOrganicTrunkSegment(d, p0.x, p0.y, p1.x, p1.y, bendSign);
    }
    this.mobileTrunkBase.setAttribute('d', d);

    const activeKnot = this.mobileKnotsContainer.querySelector('.mobile-knot.active');
    if (activeKnot) {
        const activeIndex = knots.indexOf(activeKnot);
        const activeY = activeIndex >= 0 ? knotCenters[activeIndex] : bottomY;
        const activeSlice = [{ x: trunkPoints[0].x, y: trunkPoints[0].y, segIndex: 0 }];
        for (let i = 0; i < knots.length; i++) {
            const y = knotCenters[i];
            if (y >= activeY - 2) activeSlice.push({ ...trunkPoints[i + 1] });
        }
        if (activeSlice.length < 2) {
            this.mobileTrunkActive.setAttribute('d', d);
        } else {
            let dActive = `M ${activeSlice[0].x} ${activeSlice[0].y}`;
            for (let j = 1; j < activeSlice.length; j++) {
                const a = activeSlice[j - 1];
                const b = activeSlice[j];
                const si = b.segIndex != null ? b.segIndex : j;
                const bendSign = si % 2 === 0 ? 1 : -1;
                dActive = appendOrganicTrunkSegment(dActive, a.x, a.y, b.x, b.y, bendSign);
            }
            this.mobileTrunkActive.setAttribute('d', dActive);
        }
    }

    const connectorSvg = this.mobileBranchConnectorSvg;
    const scrollContent = this.mobileTrunkScrollContent;
    const trunkBody = this.mobileTrunkBody;
    if (connectorSvg && scrollContent && trunkBody && activeKnot) {
        connectorSvg.innerHTML = '';
        const panel = scrollContent.querySelector('.mobile-children-panel');
        if (panel) {
            const bodyR = trunkBody.getBoundingClientRect();
            const kRect = activeKnot.getBoundingClientRect();
            const pRect = panel.getBoundingClientRect();
            const x1 = kRect.right - bodyR.left;
            const y1 = kRect.top + kRect.height / 2 - bodyR.top;
            const x2 = pRect.left - bodyR.left;
            const panelMidY = pRect.top + pRect.height / 2 - bodyR.top;
            const rootOnly =
                knots.length === 1 && activeKnot.classList.contains('mobile-knot--svg');
            const y2 =
                rootOnly && Math.abs(panelMidY - y1) < 56 ? y1 : panelMidY;
            const w = Math.max(trunkBody.scrollWidth, bodyR.width, x1 + 12, x2 + 12, 1);
            const h2 = Math.max(
                trunkBody.scrollHeight,
                sc.scrollHeight,
                y1 + 12,
                y2 + 12,
                panelMidY + pRect.height / 2 + 12,
                1
            );
            connectorSvg.setAttribute('width', String(w));
            connectorSvg.setAttribute('height', String(h2));
            const span = x2 - x1;
            const arm = Math.min(120, Math.max(10, Math.max(0, span) * 0.38));
            const mx = span > 6 ? Math.min(x1 + arm, x2 - 3) : x1 + arm;
            const dConn = `M ${x1} ${y1} L ${mx} ${y1} L ${mx} ${y2} L ${x2} ${y2}`;
            const appendPath = (stroke, sw, opacity) => {
                const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                p.setAttribute('d', dConn);
                p.setAttribute('fill', 'none');
                p.setAttribute('stroke', stroke);
                p.setAttribute('stroke-width', String(sw));
                p.setAttribute('stroke-linecap', 'round');
                p.setAttribute('stroke-linejoin', 'round');
                if (opacity != null) p.setAttribute('opacity', String(opacity));
                connectorSvg.appendChild(p);
            };
            appendPath('rgb(40 28 20)', desk ? 11 : 10, desk ? 0.14 : 0.16);
            appendPath('rgb(120 90 68)', desk ? 6.5 : 6, desk ? 0.5 : 0.52);
            appendPath('rgb(230 210 175)', desk ? 3.25 : 3.5, null);
        }
    } else if (connectorSvg) {
        connectorSvg.innerHTML = '';
    }
}
