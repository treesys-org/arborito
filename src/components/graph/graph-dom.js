export function initDOM() {

        this.innerHTML = `
        <style>
            /* Visual Specs from VISUAL_SPEC.md */
            .graph-container { width: 100%; height: 100%; overflow: hidden; position: relative; touch-action: none; cursor: grab; }
            /* Allow vertical scroll + taps in mobile tree (touch-action:none on parent blocks clicks on some devices) */
            .graph-container:has(.mobile-tree-ui.visible) { touch-action: pan-y; }
            .graph-container:active { cursor: grabbing; }
            
            /* Hi-Bit 2D vector (capas en :root) — mismo escenario que el camino móvil en style.css */
            .bg-sky {
                background-color: #a8e8ff;
                background-image: var(--arborito-pixel-landscape-day);
                background-size: var(--arborito-hibit-bg-size);
                background-position: var(--arborito-hibit-bg-position);
                background-repeat: no-repeat;
                image-rendering: auto;
            }
            .dark .bg-sky {
                background-color: #312e81;
                background-image: var(--arborito-pixel-landscape-night);
                background-size: var(--arborito-hibit-bg-size);
                background-position: var(--arborito-hibit-bg-position);
                background-repeat: no-repeat;
                image-rendering: auto;
            }
            .bg-blueprint {
                background-color: var(--slate-800);
                /* Rejilla de construcción: líneas visibles (también en .mobile-tree-ui--construction vía CSS global) */
                background-image:
                    linear-gradient(rgb(255 255 255 / 0.09) 1px, transparent 1px),
                    linear-gradient(90deg, rgb(255 255 255 / 0.09) 1px, transparent 1px),
                    linear-gradient(rgb(255 255 255 / 0.045) 1px, transparent 1px),
                    linear-gradient(90deg, rgb(255 255 255 / 0.045) 1px, transparent 1px);
                background-size: 24px 24px, 24px 24px, 6px 6px, 6px 6px;
                background-position: 0 0, 0 0, 0 0, 0 0;
            }

            /* Node Transitions - Organic Growth Curve */
            /* Removed will-change to prevent sub-pixel jitter/shaking on some displays */
            .node-group { 
                transition: transform 0.6s cubic-bezier(0.25, 0.8, 0.25, 1), opacity 0.6s ease-out; 
                cursor: pointer; 
            }
            .link-path { 
                transition: d 0.6s cubic-bezier(0.25, 0.8, 0.25, 1), stroke 0.3s; 
                fill: none; 
                will-change: d;
            }
            
            /* Hover Effects */
            .node-group:hover .node-body { filter: brightness(1.1); }
            .node-group:active .node-body { transform: scale(0.95); }
            
            /* Text Select Safety */
            text { user-select: none; pointer-events: none; font-family: ui-sans-serif, system-ui, sans-serif; }
            
            .vignette { display: none; }

            /* Mobile — Camino (sky & atmosphere — detailed layers in style.css) */
            .mobile-tree-ui { position: absolute; top: 0; left: 0; right: 0; bottom: var(--arborito-mob-dock-clearance, 4.25rem); z-index: 30; display: none; color: var(--color-mobile-text, var(--slate-200)); font-family: var(--arborito-font-display, var(--font-family-base, ui-sans-serif, system-ui, sans-serif)); touch-action: pan-y; }
            .mobile-version-fixed-slot { position: fixed; right: max(0.65rem, env(safe-area-inset-right)); bottom: calc(var(--arborito-mob-dock-clearance, 4.25rem) + 0.35rem); z-index: 112; width: min(14rem, calc(100vw - 1.25rem)); pointer-events: none; }
            .mobile-version-fixed-slot .arborito-mobile-version-root { pointer-events: auto; }
            .mobile-version-fixed-slot .arborito-timeline-chip--btn { width: auto !important; max-width: 100%; }
            .mobile-tree-ui.mobile-tree-ui--construction { bottom: 0; }
            /* Snapshot dropdown must stack above the tab dock (z~110); entire subtree is capped by this layer */
            .mobile-tree-ui.arborito-version-dropdown-open { z-index: 125; }
            .mobile-tree-ui.visible { display: flex; flex-direction: column; }
            .mobile-trunk-fade { position: absolute; top: 0; left: 0; bottom: 0; width: 5rem; background: linear-gradient(to right, rgba(2,6,23,0.6) 0%, transparent 100%); pointer-events: none; z-index: 1; }
            .mobile-trunk-container { flex: 1; width: 100%; min-height: 0; overflow-y: auto; overscroll-behavior-y: contain; scrollbar-width: none; -ms-overflow-style: none; scroll-padding-top: 12px; scroll-padding-bottom: 0.5rem; }
            .mobile-trunk-container::-webkit-scrollbar { display: none; }
            /* Safe inset lives on .mobile-tree-ui; inner scroll avoids notch + dock via padding there + bottom here */
            .mobile-trunk-scroll-content { min-height: 100%; display: flex; position: relative; padding-top: 0; box-sizing: border-box; }
            .mobile-branch-connector-svg { position: absolute; left: 0; top: 0; pointer-events: none; z-index: 6; overflow: visible; }

            .mobile-trunk-col { width: 4.5rem; flex-shrink: 0; position: relative; display: flex; flex-direction: column-reverse; align-items: center; padding: var(--space-lg) 0 calc(env(safe-area-inset-bottom, 0px) + 0.5rem); z-index: 5; overflow: visible; }
            .mobile-trunk-svg { position: absolute; top: 0; left: 0; width: 100%; pointer-events: none; z-index: 0; overflow: visible; }
            .mobile-trunk-path { fill: none; stroke: var(--color-mobile-trunk, var(--slate-700)); stroke-width: 12px; stroke-linecap: round; transition: d 0.38s cubic-bezier(0.33, 1, 0.32, 1); }
            .mobile-trunk-path-active { fill: none; stroke: var(--color-mobile-trunk-active, #9a3412); stroke-width: 7px; stroke-linecap: round; filter: drop-shadow(0 0 4px rgba(120, 53, 15, 0.18)); transition: d 0.38s cubic-bezier(0.33, 1, 0.32, 1); }
            .mobile-knots-container { display: flex; flex-direction: column-reverse; align-items: center; width: 100%; z-index: 2; gap: var(--space-xl); }

            /* Sin keyframes zoomIn/fadeIn: al re-renderizar el DOM se reiniciaba opacity 0→1 y parpadeaba el tronco */
            .mobile-knot-wrapper { position: relative; display: flex; align-items: center; justify-content: center; width: 100%; height: var(--arborito-mobile-path-row-h, 4.25rem); margin-bottom: 0; }
            .mobile-knot { width: 3rem; height: 3rem; background: var(--color-mobile-bg, var(--slate-950)); border: 3px solid var(--color-mobile-border, var(--slate-700)); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.25rem; cursor: pointer; touch-action: manipulation; -webkit-tap-highlight-color: transparent; transition: transform 0.22s cubic-bezier(0.34, 1.2, 0.64, 1), border-color 0.2s ease, box-shadow 0.22s ease, background-color 0.2s ease; box-shadow: var(--shadow-lg); z-index: 2; flex-shrink: 0; }
            .mobile-knot.active { border-color: var(--color-accent, var(--green-500)); border-width: 4px; background: var(--green-900); transform: scale(1.08); box-shadow: 0 0 0 6px rgba(34,197,94,0.12), 0 0 24px rgba(34,197,94,0.2), var(--shadow-lg); }
            /* Inactive trunk knots: solid brown fill (no transparency) */
            .mobile-tree-ui .mobile-knot:not(.active):not(.state-completed):not(.state-harvested):not(.state-empty) {
                background: rgb(58 38 26) !important;
                border-color: rgb(112 78 54) !important;
                backdrop-filter: none !important;
                -webkit-backdrop-filter: none !important;
                opacity: 1 !important;
            }
            .mobile-knot-tone-root { border-color: var(--color-node-root); background: rgba(141,110,99,0.2); }
            .mobile-knot-tone-branch { border-color: var(--color-node-branch); background: rgba(245,158,11,0.15); }
            .mobile-knot-tone-leaf { border-color: var(--color-node-leaf); background: rgba(168,85,247,0.15); }
            .mobile-knot-tone-exam { border-color: var(--color-node-exam); background: rgba(239,68,68,0.15); }

            .mobile-right-col { flex: 1; display: flex; flex-direction: column-reverse; padding: var(--space-lg) var(--space-md) calc(env(safe-area-inset-bottom, 0px) + 0.5rem) 0; min-width: 0; gap: var(--space-xl); }
            .mobile-label-row { min-height: 0; height: var(--arborito-mobile-path-row-h, 4.25rem); margin-bottom: 0; display: flex; align-items: center; cursor: pointer; touch-action: manipulation; -webkit-tap-highlight-color: transparent; transition: color 0.18s ease; }
            .mobile-label-row--with-version { min-height: 3rem; align-items: center; justify-content: flex-start; gap: 0.35rem; flex-wrap: wrap; }
            .mobile-label-row--with-version .mobile-label-text { flex: 1 1 auto; min-width: 0; }
            .mobile-label-row .mobile-label-text { flex: 1 1 auto; min-width: 0; }
            .mobile-label-text { font-size: 0.75rem; font-weight: 700; color: var(--color-mobile-text-muted, var(--slate-400)); padding-left: var(--space-sm); transition: all 0.3s; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; line-height: 1.35; word-break: break-word; }
            .mobile-label-row.is-active .mobile-label-text { color: var(--color-mobile-text, var(--slate-200)); font-size: 0.8125rem; }
            .mobile-label-meta { font-size: 0.5625rem; color: var(--color-text-secondary, var(--slate-500)); letter-spacing: 0.04em; margin-left: var(--space-sm); flex-shrink: 0; max-width: 100%; }
            .mobile-label-row--suppress-title .mobile-label-text { visibility: hidden; }

            .mobile-active-branch { display: flex; flex-direction: column; align-items: stretch; margin-bottom: var(--space-xl); position: relative; }
            .mobile-active-branch .mobile-label-row { margin-bottom: 0.5rem; }
            .mobile-children-panel { position: relative; margin-bottom: var(--space-lg); margin-left: var(--space-xs); background: rgb(41 53 72); border: 2px solid rgb(100 116 139); border-radius: 1.125rem; padding: var(--space-md) var(--space-md); transition: border-color 0.2s ease, box-shadow 0.2s ease; }
            .mobile-panel-header { font-size: 0.5625rem; font-weight: 800; letter-spacing: 0.08em; color: var(--color-text-secondary, var(--slate-500)); margin-bottom: var(--space-sm); padding-left: 2px; display: flex; align-items: center; gap: 0.4rem; width: 100%; }
            .mobile-panel-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-transform: uppercase; }
            .mobile-panel-actions { display: inline-flex; align-items: center; gap: 0.35rem; flex-shrink: 0; }
            .mobile-panel-back { width: 1.6rem; height: 1.6rem; border-radius: 0.75rem; border: 1px solid rgb(100 116 139 / 0.65); background: rgb(15 23 42 / 0.35); color: var(--slate-100); display: inline-flex; align-items: center; justify-content: center; font-weight: 900; line-height: 1; cursor: pointer; pointer-events: auto; transition: transform 0.12s ease, background 0.12s ease, border-color 0.12s ease; }
            .mobile-panel-back:hover { background: rgb(15 23 42 / 0.48); border-color: rgb(148 163 184 / 0.75); }
            .mobile-panel-back:active { transform: scale(0.97); }
            .mobile-panel-cta, .mobile-path-cta { border: 1px solid rgb(100 116 139 / 0.45); background: rgb(15 23 42 / 0.25); color: rgb(226 232 240); font-weight: 900; font-size: 0.625rem; letter-spacing: 0.06em; padding: 0.35rem 0.55rem; border-radius: 0.75rem; cursor: pointer; pointer-events: auto; text-transform: uppercase; white-space: nowrap; transition: transform 0.12s ease, background 0.12s ease, border-color 0.12s ease; }
            .mobile-panel-cta:hover, .mobile-path-cta:hover { background: rgb(15 23 42 / 0.35); border-color: rgb(148 163 184 / 0.55); }
            .mobile-panel-cta:active, .mobile-path-cta:active { transform: scale(0.98); }
            .mobile-panel-cta--read, .mobile-path-cta--read { border-color: rgb(59 130 246 / 0.5); background: rgb(59 130 246 / 0.14); color: rgb(219 234 254); }
            .mobile-panel-cta--arcade, .mobile-path-cta--arcade { border-color: rgb(249 115 22 / 0.55); background: rgb(249 115 22 / 0.14); color: rgb(254 215 170); }
            .mobile-path-actions { margin-left: auto; display: inline-flex; align-items: center; gap: 0.35rem; flex-shrink: 0; }
            .mobile-child-row { display: flex; align-items: flex-start; min-height: 3rem; padding: var(--space-sm) var(--space-xs); cursor: pointer; border-radius: var(--radius-md); transition: background 0.2s; position: relative; margin-bottom: var(--space-xs); touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
            .mobile-child-row .mobile-child-knot { margin-top: 0.125rem; }
            .mobile-child-row:active { background: rgba(34,197,94,0.08); }
            .mobile-child-knot { width: 2.5rem; height: 2.5rem; border-radius: 1rem 0.25rem; border: 2.5px solid var(--color-mobile-border, var(--slate-700)); background: var(--color-mobile-bg, var(--slate-950)); display: flex; align-items: center; justify-content: center; font-size: 1rem; flex-shrink: 0; margin-right: var(--space-sm); box-shadow: var(--shadow-md); transition: all 0.25s; }
            .mobile-child-row:active .mobile-child-knot { border-color: var(--color-accent, var(--green-500)); box-shadow: 0 0 12px rgba(34,197,94,0.2); }
            .mobile-child-knot.tone-root { border-color: var(--color-node-root); background: rgba(141,110,99,0.15); border-radius: 50%; }
            .mobile-child-knot.tone-branch { border-color: var(--color-node-branch); background: rgba(245,158,11,0.12); border-radius: 50%; }
            .mobile-child-knot.tone-leaf { border-color: var(--color-node-leaf); background: rgba(168,85,247,0.12); }
            .mobile-child-knot.tone-exam { border-color: var(--color-node-exam); background: rgba(239,68,68,0.12); border-radius: 4px; transform: rotate(45deg); }
            .mobile-child-icon { line-height: 1; }
            .mobile-child-knot.tone-exam .mobile-child-icon { display: block; transform: rotate(-45deg); }
            .mobile-child-info { flex: 1; min-width: 0; }
            .mobile-child-name { font-size: 0.8125rem; font-weight: 700; color: var(--slate-300); display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; line-height: 1.35; word-break: break-word; }
            .mobile-child-meta { font-size: 0.5625rem; color: var(--color-mobile-text-muted, var(--slate-400)); letter-spacing: 0.04em; }
            .mobile-child-arrow { color: var(--color-text-secondary, var(--slate-500)); font-size: 1rem; flex-shrink: 0; margin-left: var(--space-xs); }

            /* Node visual states */
            .mobile-knot.state-completed { border-color: var(--color-node-completed) !important; background: rgba(34,197,94,0.2) !important; }
            .mobile-knot.state-empty { border-color: var(--color-node-empty) !important; background: rgba(203,213,225,0.1) !important; opacity: 0.55; }
            .mobile-knot.state-harvested { border-color: var(--color-node-harvested) !important; background: rgba(217,119,6,0.2) !important; box-shadow: 0 0 16px rgba(217,119,6,0.4), var(--shadow-lg) !important; }
            .mobile-child-knot.state-completed { border-color: var(--color-node-completed); background: rgba(34,197,94,0.15); }
            .mobile-child-knot.state-completed .mobile-child-icon { filter: brightness(1.2); }
            .mobile-child-knot.state-empty { border-color: var(--color-node-empty); background: rgba(203,213,225,0.08); opacity: 0.5; }
            .mobile-child-knot.state-harvested { border-color: var(--color-node-harvested); background: rgba(217,119,6,0.18); box-shadow: 0 0 12px rgba(217,119,6,0.35); }
            .mobile-child-row.is-completed .mobile-child-name { color: var(--color-node-completed); }
            .mobile-child-row.is-completed .mobile-child-meta { color: var(--green-600); }
            .mobile-child-row.is-empty .mobile-child-name { color: var(--slate-400); }
            .mobile-child-row.is-empty .mobile-child-meta { color: var(--slate-500); }

            .mobile-empty-branch { text-align: center; padding: var(--space-lg) var(--space-sm); opacity: 0.3; }
            .mobile-empty-branch-icon { font-size: 2rem; margin-bottom: var(--space-xs); }
            .mobile-empty-branch-text { font-size: 0.75rem; font-weight: 900; text-transform: uppercase; letter-spacing: 3px; }
        </style>
        
        <div id="graph-container" class="graph-container bg-sky transition-colors duration-500">
            <div class="vignette"></div>
            
            <!-- SVG Layer -->
            <svg id="svg-canvas" width="100%" height="100%" style="display:block;">
                <defs>
                    <filter id="drop-shadow"><feGaussianBlur in="SourceAlpha" stdDeviation="3"/><feOffset dx="0" dy="3"/><feComponentTransfer><feFuncA type="linear" slope="0.3"/></feComponentTransfer><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                    <filter id="leaf-glow"><feGaussianBlur stdDeviation="5" result="coloredBlur"/><feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                </defs>
                <g id="viewport">
                    <g id="ground-layer"></g>
                    <g id="links-layer"></g>
                    <g id="nodes-layer"></g>
                    <line id="drag-line" x1="0" y1="0" x2="0" y2="0" stroke="#f59e0b" stroke-width="3" stroke-dasharray="5,5" style="display:none; pointer-events:none;"></line>
                </g>
            </svg>

            <!-- UI Overlays -->
            <div id="overlays" class="absolute inset-0 pointer-events-none"></div>

            <div id="mobile-tree-ui" class="mobile-tree-ui arborito-mobile-path">
                <div id="mobile-overlays" class="absolute top-0 left-0 right-0 z-40 flex justify-center pointer-events-none" style="padding-top:max(0.35rem, env(safe-area-inset-top));"></div>
                <div class="mobile-trunk-fade"></div>
                <div id="arborito-mobile-version-fixed" class="mobile-version-fixed-slot" aria-live="polite"></div>
                <div id="mobile-trunk-container" class="mobile-trunk-container">
                    <div id="mobile-trunk-scroll-content" class="mobile-trunk-scroll-content">
                        <svg id="mobile-branch-connector-svg" class="mobile-branch-connector-svg" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"></svg>
                        <div class="mobile-trunk-col" id="mobile-trunk-col">
                            <svg id="mobile-trunk-svg" class="mobile-trunk-svg">
                                <path id="mobile-trunk-base" class="mobile-trunk-path"></path>
                                <path id="mobile-trunk-active" class="mobile-trunk-path-active"></path>
                            </svg>
                            <div id="mobile-knots-container" class="mobile-knots-container"></div>
                        </div>
                        <div class="mobile-right-col" id="mobile-right-col"></div>
                    </div>
                </div>
            </div>
            
        </div>
        `;

        this.container = this.querySelector('#graph-container');
        this.svg = this.querySelector('#svg-canvas');
        this.viewportGroup = this.querySelector('#viewport');
        this.dragLine = this.querySelector('#drag-line');
        this.mobileTreeUI = this.querySelector('#mobile-tree-ui');
        this.mobileTrunkContainer = this.querySelector('#mobile-trunk-container');
        this.mobileTrunkScrollContent = this.querySelector('#mobile-trunk-scroll-content');
        this.mobileTrunkCol = this.querySelector('#mobile-trunk-col');
        this.mobileKnotsContainer = this.querySelector('#mobile-knots-container');
        this.mobileTrunkBase = this.querySelector('#mobile-trunk-base');
        this.mobileTrunkActive = this.querySelector('#mobile-trunk-active');
        this.mobileRightCol = this.querySelector('#mobile-right-col');
        this.mobileBranchConnectorSvg = this.querySelector('#mobile-branch-connector-svg');
        this.mobileVersionFixedSlot = this.querySelector('#arborito-mobile-version-fixed');
        this.mobileOverlayTimer = null;

        this.redrawMobilePrototypeOverlay = () => this.drawMobilePrototypeOverlay(false);
        this.mobileTrunkContainer.addEventListener('scroll', this.redrawMobilePrototypeOverlay, { passive: true });

    }