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

export function scheduleMobilePrototypeOverlay(scrollToActive = false) {
    if (this.mobileOverlayTimer) clearTimeout(this.mobileOverlayTimer);
    this.mobileOverlayTimer = setTimeout(() => this.drawMobilePrototypeOverlay(scrollToActive), 50);
}

export function drawMobilePrototypeOverlay(_scrollToActive = false) {
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

    const desk = document.documentElement.classList.contains('arborito-desktop');
    const scRect = sc.getBoundingClientRect();
    const knotYInScroll = (knot) => {
        const r = knot.getBoundingClientRect();
        return r.top + r.height / 2 - scRect.top;
    };
    const knotCenters = knots.map(knotYInScroll);
    const bottomY = Math.max(...knotCenters);
    const lowestBottom = Math.max(
        ...knots.map((k) => {
            const r = k.getBoundingClientRect();
            return r.bottom - scRect.top;
        })
    );

    const h = Math.max(sc.scrollHeight, lowestBottom + 16, bottomY + 16, 1);
    svg.style.width = `${colW}px`;
    svg.style.height = `${h}px`;
    svg.style.top = '0';
    /* Same inset as trunk body (scroll padding); do not use 0 — breaks alignment with knot column on desktop. */
    let insetLeft = 0;
    try {
        insetLeft = parseFloat(window.getComputedStyle(sc).paddingLeft) || 0;
    } catch {
        /* ignore */
    }
    svg.style.left = `${insetLeft}px`;

    /** Trunk polyline: bottom base, each knot (with zigzag), close up to axis. `segIndex` aligns curves with active segment. */
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
        {
            const bendSign = i % 2 === 0 ? 1 : -1;
            d = appendOrganicTrunkSegment(d, p0.x, p0.y, p1.x, p1.y, bendSign);
        }
    }
    this.mobileTrunkBase.setAttribute('d', d);

    const activeKnot = this.mobileKnotsContainer.querySelector('.mobile-knot.active');
    if (activeKnot) {
        const activeY = knotYInScroll(activeKnot);
        /* Mismo criterio que antes: solo el tramo desde la base hasta el nudo activo (sin subir al cierre superior). */
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
                {
                    const si = b.segIndex != null ? b.segIndex : j;
                    const bendSign = si % 2 === 0 ? 1 : -1;
                    dActive = appendOrganicTrunkSegment(dActive, a.x, a.y, b.x, b.y, bendSign);
                }
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
            const y2 = pRect.top + pRect.height / 2 - bodyR.top;
            const w = Math.max(trunkBody.scrollWidth, x1 + 12, x2 + 12, 1);
            const h2 = Math.max(trunkBody.scrollHeight, y1 + 12, y2 + 12, 1);
            connectorSvg.setAttribute('width', String(w));
            connectorSvg.setAttribute('height', String(h2));
            const span = x2 - x1;
            const arm = Math.min(desk ? 120 : 40, Math.max(10, Math.max(0, span) * 0.38));
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
            appendPath('rgb(40 28 20)', desk ? 11 : 8, desk ? 0.14 : 0.18);
            appendPath('rgb(120 90 68)', desk ? 6.5 : 4.5, desk ? 0.5 : 0.55);
            appendPath(desk ? 'rgb(230 210 175)' : 'rgb(205 180 150)', desk ? 3.25 : 2.25, null);
        }
    } else if (connectorSvg) {
        connectorSvg.innerHTML = '';
    }
}
