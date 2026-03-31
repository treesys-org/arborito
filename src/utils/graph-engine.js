

import { BP_MD } from './breakpoints.js';

/**
 * Arborito graph engine
 * A lightweight, dependency-free layout engine for visualization.
 * Replaces D3.js with pure SVG and Math logic.
 */

export class GraphEngine {
    constructor() {
        this.ns = "http://www.w3.org/2000/svg";
    }

    /**
     * Creates an SVG element with attributes
     */
    createSVG(tag, attrs = {}) {
        const el = document.createElementNS(this.ns, tag);
        for (const [key, val] of Object.entries(attrs)) {
            if (val !== null && val !== undefined) {
                el.setAttribute(key, val);
            }
        }
        return el;
    }

    /**
     * Calculates the Tree Layout (Bottom-Up)
     * @param {Object} data - Hierarchical data
     * @param {Number} width - Canvas width
     * @param {Number} height - Canvas height
     * @param {Object} config - Layout settings
     */
    computeLayout(data, width, height, config = {}) {
        const { nodeGap = 160, levelHeight = 200, bottomOffset = 150 } = config;
        const isMobile = width < BP_MD;
        
        const nodes = [];
        const links = [];
        
        // 1. Assign Depths & Flatten for processing
        // We only traverse "expanded" nodes for the visualization
        let leafIndex = 0;
        
        const traverse = (node, depth, parent = null) => {
            const nodeObj = {
                data: node,
                id: node.id,
                depth: depth,
                parent: parent,
                children: [],
                x: 0,
                y: (height - bottomOffset) - (depth * levelHeight)
            };

            nodes.push(nodeObj);
            if (parent) {
                parent.children.push(nodeObj);
                links.push({ source: parent, target: nodeObj });
            }

            if (node.expanded && node.children && node.children.length > 0) {
                node.children.forEach(child => traverse(child, depth + 1, nodeObj));
            } else {
                // It's a leaf in the VISUAL tree (even if it has hidden children)
                // Assign provisional X based on leaf index
                nodeObj._leafIdx = leafIndex++;
            }
            
            return nodeObj;
        };

        const root = traverse(data, 0);

        // 2. Calculate X Coordinates
        if (isMobile) {
            // Mobile-first layout: distribute nodes by depth within screen width.
            // This avoids any dependency on horizontal panning to navigate the tree.
            const byDepth = new Map();
            nodes.forEach(n => {
                if (!byDepth.has(n.depth)) byDepth.set(n.depth, []);
                byDepth.get(n.depth).push(n);
            });

            const sidePadding = Math.max(40, Math.floor(width * 0.09));
            const usableWidth = Math.max(1, width - (sidePadding * 2));

            const depthKeys = Array.from(byDepth.keys()).sort((a, b) => a - b);
            depthKeys.forEach(depth => {
                const group = byDepth.get(depth);
                group.sort((a, b) => {
                    const pa = a.parent ? a.parent.id : '';
                    const pb = b.parent ? b.parent.id : '';
                    if (pa === pb) return String(a.id).localeCompare(String(b.id));
                    return String(pa).localeCompare(String(pb));
                });

                const count = group.length;
                if (count === 1) {
                    group[0].x = width / 2;
                    return;
                }

                const step = usableWidth / (count - 1);
                group.forEach((n, i) => {
                    n.x = sidePadding + (i * step);
                });
            });
        } else {
            // Desktop layout: classic tree centering by leaves.
            const layoutX = (node) => {
                if (node.children.length === 0) {
                    node.x = node._leafIdx * nodeGap;
                } else {
                    node.children.forEach(layoutX);
                    const first = node.children[0];
                    const last = node.children[node.children.length - 1];
                    node.x = (first.x + last.x) / 2;
                }
            };
            layoutX(root);

            let minX = Infinity;
            let maxX = -Infinity;
            nodes.forEach(n => {
                if (n.x < minX) minX = n.x;
                if (n.x > maxX) maxX = n.x;
            });
            const treeWidth = maxX - minX;
            const shiftX = (width / 2) - (minX + treeWidth / 2);
            nodes.forEach(n => { n.x += shiftX; });
        }

        // 3. Compute bounds
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        nodes.forEach(n => {
            if (n.x < minX) minX = n.x;
            if (n.x > maxX) maxX = n.x;
            if (n.y < minY) minY = n.y;
            if (n.y > maxY) maxY = n.y;
        });

        return { nodes, links, bounds: { minX, maxX, minY, maxY } };
    }

    /**
     * Generates a Cubic Bezier path string
     */
    diagonal(source, target, isStraight = false) {
        if (isStraight) {
            // Blueprint Style (L-shape or Straight)
            return `M ${source.x} ${source.y} L ${target.x} ${target.y}`;
        }
        
        // Organic Curve
        const midY = (source.y + target.y) / 2;
        return `M ${source.x} ${source.y} C ${source.x} ${midY}, ${target.x} ${midY}, ${target.x} ${target.y}`;
    }
}

/**
 * ZOOM & PAN SYSTEM (Replaces d3.zoom)
 * Handles matrix transformations on a container element with constraints.
 */
export class ViewportSystem {
    constructor(svgElement, contentGroup) {
        this.svg = svgElement;
        this.g = contentGroup;
        this.transform = { x: 0, y: 0, k: 1 };
        
        this.isDragging = false;
        this.potentialDrag = false; // Tracks if mouse is down but hasn't moved enough to drag
        this.hasMoved = false; // Track intentional movement vs click
        
        this.startClient = { x: 0, y: 0 };
        this.lastPoint = { x: 0, y: 0 };
        this.onZoom = null; // Callback
        
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
        
        // Prevent native touch actions
        this.svg.style.touchAction = 'none';
    }

    update() {
        this.g.setAttribute('transform', `translate(${this.transform.x}, ${this.transform.y}) scale(${this.transform.k})`);
        if (this.onZoom) this.onZoom(this.transform);
    }
    
    /**
     * Update constraints based on tree layout and screen size
     */
    setBounds(worldBounds, w, h) {
        this.bounds = worldBounds;
        this.viewSize = { w, h };
        this.clamp();
        this.update();
    }

    /**
     * Constraints the transform (x, y) STRICTLY.
     */
    clamp() {
        if (!this.bounds) return;
        
        // Margin: 60px (approx Node Radius) + 100px padding
        const margin = 160; 
        
        const { minX, maxX, minY, maxY } = this.bounds;
        const { w, h } = this.viewSize;
        const k = this.transform.k;
        const isMobile = w < BP_MD;
        
        // Effective content bounds in world space
        const cLeft = minX - margin;
        const cRight = maxX + margin;
        const cTop = minY - margin;
        const cBottom = maxY + margin;
        
        // Dimensions of the scaled content
        const contentW = (cRight - cLeft) * k;
        const contentH = (cBottom - cTop) * k;
        
        // --- X AXIS CLAMP ---
        // Mobile rule: lock horizontal movement entirely.
        if (isMobile || contentW <= w) {
            this.transform.x = (w - contentW) / 2 - (cLeft * k);
        } else {
            const maxTx = -cLeft * k;
            const minTx = w - cRight * k;
            this.transform.x = Math.max(minTx, Math.min(maxTx, this.transform.x));
        }
        
        // --- Y AXIS CLAMP ---
        if (contentH <= h) {
            this.transform.y = (h - contentH) / 2 - (cTop * k);
        } else {
            const maxTy = -cTop * k;
            const minTy = h - cBottom * k;
            this.transform.y = Math.max(minTy, Math.min(maxTy, this.transform.y));
        }
    }

    // Programmatic Zoom
    zoomTo(x, y, k, duration = 0) {
        if (duration === 0) {
            this.transform = { x, y, k };
            this.clamp(); // Enforce bounds
            this.update();
            return;
        }

        const start = { ...this.transform };
        const startTime = performance.now();

        const animate = (time) => {
            const elapsed = time - startTime;
            const t = Math.min(1, elapsed / duration);
            // Ease Out Cubic
            const ease = 1 - Math.pow(1 - t, 3);

            this.transform.x = start.x + (x - start.x) * ease;
            this.transform.y = start.y + (y - start.y) * ease;
            this.transform.k = start.k + (k - start.k) * ease;
            
            // We clamp during animation to prevent overshooting bounds
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
        // Limit Zoom Out (0.35) and Zoom In (3)
        const newScale = Math.max(0.35, Math.min(3, this.transform.k * (1 + delta)));
        
        // Zoom towards mouse pointer
        const rect = this.svg.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        // Calculate world point before zoom
        const wx = (mx - this.transform.x) / this.transform.k;
        const wy = (my - this.transform.y) / this.transform.k;

        this.transform.k = newScale;
        this.transform.x = mx - wx * newScale;
        this.transform.y = my - wy * newScale;

        this.clamp();
        this.update();
    }

    handlePointerDown(e) {
        // Prepare for dragging, but do NOT capture yet to allow clicks to pass through
        this.potentialDrag = true;
        this.isDragging = false;
        this.hasMoved = false;
        
        this.startClient = { x: e.clientX, y: e.clientY };
        this.lastPoint = this.getPoint(e);
        
        // Cursor feedback
        this.svg.style.cursor = 'grab';
    }

    handlePointerMove(e) {
        if (!this.potentialDrag && !this.isDragging) return;
        
        // Logic to detect drag initiation threshold (5px)
        if (!this.isDragging) {
            const currentClient = { x: e.clientX, y: e.clientY };
            const dist = Math.hypot(currentClient.x - this.startClient.x, currentClient.y - this.startClient.y);
            
            if (dist > 5) {
                this.isDragging = true;
                this.hasMoved = true;
                
                // Now we capture the pointer to track movement even outside SVG bounds
                this.svg.setPointerCapture(e.pointerId);
                this.svg.style.cursor = 'grabbing';
                
                // Reset last point to current to prevent jump
                this.lastPoint = this.getPoint(e);
            }
        }

        // Execute Pan
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
        
        // If not dragging, this was a click. 
        // Because we didn't capture pointer immediately, the click event will propagate to children (Nodes).
    }
    
    // Helper to project screen coordinates to world coordinates
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
