import { BP_MD } from './breakpoints.js';

/**
 * Zoom and pan for the classic SVG graph canvas. GraphEngine-style layout was removed:
 * the visible map is the mobile path; this class is still used from graph.js.
 */
export class ViewportSystem {
    constructor(svgElement, contentGroup) {
        this.svg = svgElement;
        this.g = contentGroup;
        this.transform = { x: 0, y: 0, k: 1 };

        this.isDragging = false;
        this.potentialDrag = false;
        this.hasMoved = false;

        this.startClient = { x: 0, y: 0 };
        this.lastPoint = { x: 0, y: 0 };
        this.onZoom = null;

        this.bounds = null;
        this.viewSize = { w: 0, h: 0 };

        this.bindEvents();
    }

    bindEvents() {
        this.svg.addEventListener('wheel', this.handleWheel.bind(this), { passive: false });
        this.svg.addEventListener('pointerdown', this.handlePointerDown.bind(this));
        this.svg.addEventListener('pointermove', this.handlePointerMove.bind(this));
        this.svg.addEventListener('pointerup', this.handlePointerUp.bind(this));
        this.svg.addEventListener('pointerleave', this.handlePointerUp.bind(this));

        this.svg.style.touchAction = 'none';
    }

    update() {
        this.g.setAttribute('transform', `translate(${this.transform.x}, ${this.transform.y}) scale(${this.transform.k})`);
        if (this.onZoom) this.onZoom(this.transform);
    }

    setBounds(worldBounds, w, h) {
        this.bounds = worldBounds;
        this.viewSize = { w, h };
        this.clamp();
        this.update();
    }

    clamp() {
        if (!this.bounds) return;

        const margin = 160;

        const { minX, maxX, minY, maxY } = this.bounds;
        const { w, h } = this.viewSize;
        const k = this.transform.k;
        const isMobile = w < BP_MD;

        const cLeft = minX - margin;
        const cRight = maxX + margin;
        const cTop = minY - margin;
        const cBottom = maxY + margin;

        const contentW = (cRight - cLeft) * k;
        const contentH = (cBottom - cTop) * k;

        if (isMobile || contentW <= w) {
            this.transform.x = (w - contentW) / 2 - (cLeft * k);
        } else {
            const maxTx = -cLeft * k;
            const minTx = w - cRight * k;
            this.transform.x = Math.max(minTx, Math.min(maxTx, this.transform.x));
        }

        const rootAnchorMargin = 80;
        const minRootY = h - rootAnchorMargin;

        if (contentH <= h) {
            this.transform.y = minRootY - (cBottom * k);
        } else {
            const maxTy = -cTop * k;
            const minTy = Math.min(h - cBottom * k, minRootY - (cBottom * k));
            this.transform.y = Math.max(minTy, Math.min(maxTy, this.transform.y));
        }
    }

    zoomTo(x, y, k, duration = 0) {
        if (duration === 0) {
            this.transform = { x, y, k };
            this.clamp();
            this.update();
            return;
        }

        const start = { ...this.transform };
        const startTime = performance.now();

        const animate = (time) => {
            const elapsed = time - startTime;
            const t = Math.min(1, elapsed / duration);
            const ease = 1 - Math.pow(1 - t, 3);

            this.transform.x = start.x + (x - start.x) * ease;
            this.transform.y = start.y + (y - start.y) * ease;
            this.transform.k = start.k + (k - start.k) * ease;

            this.clamp();
            this.update();

            if (t < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    }

    getPoint(e) {
        return { x: e.clientX, y: e.clientY };
    }

    handleWheel(e) {
        e.preventDefault();
        const delta = -e.deltaY * 0.002;
        const newScale = Math.max(0.35, Math.min(3, this.transform.k * (1 + delta)));

        const rect = this.svg.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        const wx = (mx - this.transform.x) / this.transform.k;
        const wy = (my - this.transform.y) / this.transform.k;

        this.transform.k = newScale;
        this.transform.x = mx - wx * newScale;
        this.transform.y = my - wy * newScale;

        this.clamp();
        this.update();
    }

    handlePointerDown(e) {
        this.potentialDrag = true;
        this.isDragging = false;
        this.hasMoved = false;

        this.startClient = { x: e.clientX, y: e.clientY };
        this.lastPoint = this.getPoint(e);

        this.svg.style.cursor = 'grab';
    }

    handlePointerMove(e) {
        if (!this.potentialDrag && !this.isDragging) return;

        if (!this.isDragging) {
            const currentClient = { x: e.clientX, y: e.clientY };
            const dist = Math.hypot(currentClient.x - this.startClient.x, currentClient.y - this.startClient.y);

            if (dist > 5) {
                this.isDragging = true;
                this.hasMoved = true;

                this.svg.setPointerCapture(e.pointerId);
                this.svg.style.cursor = 'grabbing';

                this.lastPoint = this.getPoint(e);
            }
        }

        if (this.isDragging) {
            const p = this.getPoint(e);
            const dx = p.x - this.lastPoint.x;
            const dy = p.y - this.lastPoint.y;
            const isMobile = this.viewSize.w < BP_MD;

            if (!isMobile) this.transform.x += dx;
            this.transform.y += dy;
            this.lastPoint = p;

            this.clamp();
            this.update();
        }
    }

    handlePointerUp(e) {
        this.potentialDrag = false;

        if (this.isDragging) {
            this.isDragging = false;
            this.svg.releasePointerCapture(e.pointerId);
            this.svg.style.cursor = 'grab';
        }
    }

    screenToWorld(screenX, screenY) {
        const rect = this.svg.getBoundingClientRect();
        const mx = screenX - rect.left;
        const my = screenY - rect.top;
        return {
            x: (mx - this.transform.x) / this.transform.k,
            y: (my - this.transform.y) / this.transform.k
        };
    }
}
