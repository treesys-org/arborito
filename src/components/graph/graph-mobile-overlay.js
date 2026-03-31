import { store } from '../../store.js';


export function scheduleMobilePrototypeOverlay(scrollToActive = false) {
        if (this.mobileOverlayTimer) clearTimeout(this.mobileOverlayTimer);
        this.mobileOverlayTimer = setTimeout(() => this.drawMobilePrototypeOverlay(scrollToActive), 50);
    }



export function drawMobilePrototypeOverlay(scrollToActive = false) {
        const knots = Array.from(this.mobileKnotsContainer.querySelectorAll('.mobile-knot'));
        if (knots.length === 0) {
            if (this.mobileBranchConnectorSvg) this.mobileBranchConnectorSvg.innerHTML = '';
            return;
        }

        const centerX = Math.max(28, (this.mobileTrunkCol?.clientWidth || 72) / 2);
        const contentHeight = this.mobileTrunkCol.scrollHeight;
        const ceiling = this.mobileTreeUI
            ? parseFloat(getComputedStyle(this.mobileTreeUI).paddingTop) || 0
            : 0;
        const svg = this.mobileTrunkBase.parentElement;
        svg.style.height = `${contentHeight + ceiling}px`;
        svg.style.top = ceiling ? `-${ceiling}px` : '0';

        const contentRect = this.mobileTrunkCol.getBoundingClientRect();
        /** @param {number} yRel y from top of trunk col (0 = trunk top) */
        const ySvg = (yRel) => yRel + ceiling;

        const knotCenters = knots.map((knot) => {
            const rect = knot.getBoundingClientRect();
            return rect.top + rect.height / 2 - contentRect.top;
        });
        // Base of trunk: fixed to the floor of the scroll content and never allowed to float upward.
        // (Still keep an invisible safety floor for future tweaks.)
        const minFromBottomPx = parseFloat(
            getComputedStyle(document.documentElement).getPropertyValue('--arborito-trunk-base-min-from-bottom')
        );
        const bottomFloor = Math.max(0, contentHeight - (Number.isFinite(minFromBottomPx) ? minFromBottomPx : 72));
        const rootY = knotCenters[0] ?? 0;
        let bottomY = Math.max(contentHeight, rootY, bottomFloor);

        let d = `M ${centerX} ${ySvg(bottomY)}`;
        knots.forEach((knot, i) => {
            const y = knotCenters[i];
            const jitter = (i % 2 === 0 ? 5 : -5);
            d += ` L ${centerX + jitter} ${ySvg(y)}`;
        });
        d += ` L ${centerX} 0`;
        this.mobileTrunkBase.setAttribute('d', d);

        const activeKnot = this.mobileKnotsContainer.querySelector('.mobile-knot.active');
        if (activeKnot) {
            const activeRect = activeKnot.getBoundingClientRect();
            const activeY = activeRect.top + activeRect.height / 2 - contentRect.top;
            let dActive = `M ${centerX} ${ySvg(bottomY)}`;
            knots.forEach((knot, i) => {
                const y = knotCenters[i];
                const jitter = (i % 2 === 0 ? 5 : -5);
                if (y >= activeY - 2) dActive += ` L ${centerX + jitter} ${ySvg(y)}`;
            });
            this.mobileTrunkActive.setAttribute('d', dActive);
        }

        const connectorSvg = this.mobileBranchConnectorSvg;
        const scrollContent = this.mobileTrunkScrollContent;
        if (connectorSvg && scrollContent && activeKnot) {
            connectorSvg.innerHTML = '';
            const panel = scrollContent.querySelector('.mobile-children-panel');
            if (panel) {
                const scRect = scrollContent.getBoundingClientRect();
                const kRect = activeKnot.getBoundingClientRect();
                const pRect = panel.getBoundingClientRect();
                const x1 = kRect.right - scRect.left;
                const y1 = kRect.top + kRect.height / 2 - scRect.top;
                const x2 = pRect.left - scRect.left;
                const y2 = pRect.top + pRect.height / 2 - scRect.top;
                const w = scrollContent.scrollWidth;
                const h = scrollContent.scrollHeight;
                connectorSvg.setAttribute('width', String(w));
                connectorSvg.setAttribute('height', String(h));
                const span = Math.max(0, x2 - x1);
                const arm = Math.min(
                    document.documentElement.classList.contains('arborito-desktop') ? 120 : 40,
                    Math.max(10, span * 0.38)
                );
                const mx = Math.min(x1 + arm, x2 - 3);
                const d = `M ${x1} ${y1} L ${mx} ${y1} L ${mx} ${y2} L ${x2} ${y2}`;
                const desk = document.documentElement.classList.contains('arborito-desktop');
                const appendPath = (stroke, sw, opacity) => {
                    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    p.setAttribute('d', d);
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

        // Intentionally no auto-scroll: preserve user's manual position in the outline panel.
    }