export function initDOM() {

        this.innerHTML = `
        <style>
            /* Visual Specs from VISUAL_SPEC.md */
            .graph-container { width: 100%; height: 100%; overflow: hidden; position: relative; touch-action: auto; cursor: default; }
            /* Scroll + taps on mobile trunk: explicit class (more reliable than :has on mobile WebKit). */
            .graph-container.graph-container--mobile-tree-active { touch-action: pan-y; cursor: default; }

            #svg-canvas { touch-action: none; cursor: grab; }
            #svg-canvas:active { cursor: grabbing; }
            
            /* Hi-Bit 2D vector (layers on :root) — same scenario as mobile path in style.css */
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
                /* Construction grid: visible lines (also .mobile-tree-ui--construction via global CSS) */
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
            text { user-select: none; pointer-events: none; font-family: system-ui, sans-serif; }
            
            .vignette { display: none; }

            /* Mobile — Camino (sky & atmosphere — detailed layers in style.css) */
            .mobile-tree-ui { position: absolute; top: 0; left: 0; right: 0; bottom: calc(var(--arborito-mobile-tree-ui-bottom, var(--arborito-mob-dock-clearance, 4.25rem)) + 1mm); z-index: 30; display: none; color: var(--color-mobile-text, var(--slate-200)); font-family: var(--font-family-base, system-ui, sans-serif); touch-action: pan-y; }
            /* Version: control on panel chip (root), not floating chip */
            .mobile-version-fixed-slot { display: none !important; visibility: hidden !important; pointer-events: none !important; }
            /* Snapshot dropdown must stack above the tab dock (z~110); entire subtree is capped by this layer */
            .mobile-tree-ui.arborito-version-dropdown-open { z-index: 125; }
            /* Wide viewport + desktop forest: tree stays under header/search (z 111). Real mobile stays at 125. */
            @media (min-width: 768px) {
                html.arborito-desktop .mobile-tree-ui.arborito-version-dropdown-open { z-index: 110; }
            }
            .mobile-tree-ui.visible { display: flex; flex-direction: column; }
            .mobile-trunk-fade { position: absolute; top: 0; left: 0; bottom: 0; width: 5rem; background: linear-gradient(to right, rgba(2,6,23,0.6) 0%, transparent 100%); pointer-events: none; z-index: 1; }
            .mobile-trunk-container { position: relative; flex: 1; width: 100%; min-height: 0; overflow-y: auto; overscroll-behavior-y: contain; scrollbar-width: none; -ms-overflow-style: none; scroll-padding-top: 12px; scroll-padding-bottom: 0.5rem; }
            .mobile-trunk-container::-webkit-scrollbar { display: none; }
            .arborito-mobile-graph-loading-overlay { position: absolute; inset: 0; z-index: 24; display: flex; align-items: center; justify-content: center; padding: 1rem; box-sizing: border-box; pointer-events: auto; background: rgb(15 23 42 / 0.38); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
            .arborito-mobile-graph-loading-overlay[hidden] { display: none !important; }
            .arborito-loading-tree-stage { display: flex; align-items: flex-end; justify-content: center; min-height: 6.25rem; }
            .arborito-loading-tree-svg { overflow: visible; color: rgb(34 197 94); filter: drop-shadow(0 2px 8px rgba(34, 197, 94, 0.25)); }
            html:not(.dark) .arborito-loading-tree-svg { color: rgb(21 128 61); filter: drop-shadow(0 1px 6px rgba(22, 163, 74, 0.2)); }
            .arborito-mobile-graph-loading-overlay--construct .arborito-loading-tree-svg { color: rgb(167 243 208); filter: drop-shadow(0 2px 10px rgba(167, 243, 208, 0.22)); }
            .arborito-loading-tree-sprout { transform-origin: 36px 82px; animation: arborito-loading-tree-sprout 1.3s ease-in-out infinite; }
            @keyframes arborito-loading-tree-sprout {
                0%, 100% { transform: scale(0.86, 0.8); opacity: 0.78; }
                50% { transform: scale(1.06, 1.1); opacity: 1; }
            }
            /* Safe inset lives on .mobile-tree-ui; inner scroll avoids notch + dock via padding there + bottom here */
            .mobile-trunk-scroll-content { min-height: 100%; display: flex; flex-direction: column; position: relative; padding-top: 0; box-sizing: border-box; }
            /* Trunk at full scroll layer (About slot + body): line can rise under the card. */
            .mobile-trunk-scroll-content > .mobile-trunk-svg {
                position: absolute;
                left: 0;
                top: 0;
                width: 4.5rem;
                z-index: 0;
                pointer-events: none;
                overflow: visible;
            }
            .arborito-tree-pres-flow-slot { width: 100%; flex-shrink: 0; box-sizing: border-box; padding: 0.35rem 0.5rem 0; }
            .arborito-tree-pres-flow-slot[hidden] { display: none !important; }
            /* Hijo directo de #mobile-tree-ui: por encima del fade izquierdo (z-1) y del scroll del tronco. */
            .mobile-tree-ui > .arborito-tree-pres-flow-slot:not([hidden]) { position: relative; z-index: 4; }
            .mobile-trunk-body { display: flex; flex-direction: row; flex: 1 1 auto; min-height: 0; min-width: 0; width: 100%; position: relative; align-items: stretch; }
            .mobile-branch-connector-svg { position: absolute; left: 0; top: 0; pointer-events: none; z-index: 6; overflow: visible; }

            .mobile-trunk-col { width: 4.5rem; flex-shrink: 0; position: relative; display: flex; flex-direction: column-reverse; align-items: center; padding: var(--space-lg) 0 calc(env(safe-area-inset-bottom, 0px) + 0.5rem); z-index: 5; overflow: visible; }
            .mobile-trunk-path { fill: none; stroke: var(--color-mobile-trunk, var(--slate-700)); stroke-width: 12px; stroke-linecap: round; transition: d 0.38s cubic-bezier(0.33, 1, 0.32, 1); }
            .mobile-trunk-path-active { fill: none; stroke: var(--color-mobile-trunk-active, #9a3412); stroke-width: 7px; stroke-linecap: round; filter: drop-shadow(0 0 4px rgba(120, 53, 15, 0.18)); transition: d 0.38s cubic-bezier(0.33, 1, 0.32, 1); }
            .mobile-knots-container { display: flex; flex-direction: column-reverse; align-items: center; width: 100%; z-index: 2; gap: var(--space-xl); }

            /* Sin keyframes zoomIn/fadeIn: al re-renderizar el DOM se reiniciaba opacity 0→1 y parpadeaba el tronco */
            .mobile-knot-wrapper { position: relative; display: flex; align-items: center; justify-content: center; width: 100%; height: var(--arborito-mobile-path-row-h, 4.25rem); margin-bottom: 0; }
            .mobile-knot { width: 3rem; height: 3rem; background: var(--color-mobile-bg, var(--slate-950)); border: 3px solid var(--color-mobile-border, var(--slate-700)); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.25rem; cursor: pointer; touch-action: manipulation; -webkit-tap-highlight-color: transparent; transition: transform 0.22s cubic-bezier(0.34, 1.2, 0.64, 1), border-color 0.2s ease, box-shadow 0.22s ease, background-color 0.2s ease; box-shadow: var(--shadow-lg); z-index: 2; flex-shrink: 0; }
            .mobile-knot.active { border-color: var(--color-accent, var(--green-500)); border-width: 4px; background: var(--green-900); transform: scale(1.08); box-shadow: 0 0 0 6px rgba(34,197,94,0.12), 0 0 24px rgba(34,197,94,0.2), var(--shadow-lg); }
            @keyframes mobile-knot-growth-bloom {
                0% { box-shadow: 0 0 0 5px rgba(34,197,94,0.18), 0 0 18px rgba(34,197,94,0.28), var(--shadow-lg); }
                45% { box-shadow: 0 0 0 18px rgba(34,197,94,0.12), 0 0 44px rgba(34,197,94,0.48), var(--shadow-lg); }
                100% { box-shadow: 0 0 0 6px rgba(34,197,94,0.12), 0 0 24px rgba(34,197,94,0.2), var(--shadow-lg); }
            }
            .mobile-knot.mobile-knot--growth-burst.active {
                animation: mobile-knot-growth-bloom 1.05s cubic-bezier(0.34, 1.15, 0.64, 1) forwards;
            }
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
            .mobile-children-panel { position: relative; margin-bottom: calc(var(--space-lg) + 1mm); margin-left: var(--space-xs); background: rgba(30, 41, 59, 0.85); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border: 1px solid rgba(148, 163, 184, 0.2); border-radius: 1.25rem; padding: var(--space-md); transition: border-color 0.2s ease, box-shadow 0.2s ease; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2); }
            .mobile-panel-header { font-size: 0.65rem; font-weight: 800; letter-spacing: 0.08em; color: var(--slate-300); margin-bottom: var(--space-sm); padding-left: 4px; display: flex; align-items: center; gap: 0.5rem; width: 100%; }
            .mobile-panel-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-transform: uppercase; }
            .mobile-panel-actions { display: inline-flex; align-items: center; gap: 0.35rem; flex-shrink: 0; }
            .mobile-panel-back { width: 1.8rem; height: 1.8rem; border-radius: 0.9rem; border: 1px solid rgba(148, 163, 184, 0.3); background: rgba(15, 23, 42, 0.5); color: var(--slate-100); display: inline-flex; align-items: center; justify-content: center; font-weight: 900; line-height: 1; cursor: pointer; pointer-events: auto; transition: all 0.15s ease; }
            .mobile-panel-back:hover { background: rgba(15, 23, 42, 0.8); border-color: rgba(148, 163, 184, 0.6); transform: translateX(-2px); }
            .mobile-panel-back:active { transform: scale(0.92); }
            .mobile-panel-cta, .mobile-path-cta { border: 1px solid rgba(148, 163, 184, 0.3); background: rgba(15, 23, 42, 0.4); color: rgb(226 232 240); font-weight: 800; font-size: 0.65rem; letter-spacing: 0.06em; padding: 0.4rem 0.65rem; border-radius: 0.85rem; cursor: pointer; pointer-events: auto; text-transform: uppercase; white-space: nowrap; transition: all 0.15s ease; }
            .mobile-panel-cta:hover, .mobile-path-cta:hover { background: rgba(15, 23, 42, 0.6); border-color: rgba(148, 163, 184, 0.6); transform: translateY(-1px); }
            .mobile-panel-cta:active, .mobile-path-cta:active { transform: scale(0.95); }
            .mobile-panel-cta--read, .mobile-path-cta--read { border-color: rgb(59 130 246 / 0.5); background: rgb(59 130 246 / 0.14); color: rgb(219 234 254); }
            .mobile-panel-cta--forum, .mobile-path-cta--forum { border-color: rgb(56 189 248 / 0.55); background: rgb(56 189 248 / 0.12); color: rgb(224 242 254); }
            html:not(.dark) .mobile-panel-cta--forum, html:not(.dark) .mobile-path-cta--forum { border-color: rgb(14 116 144 / 0.42); background: rgb(14 116 144 / 0.10); color: rgb(12 74 110); }
            .mobile-panel-cta--arcade, .mobile-path-cta--arcade { border-color: rgb(249 115 22 / 0.55); background: rgb(249 115 22 / 0.14); color: rgb(254 215 170); }
            .mobile-path-actions { margin-left: auto; display: inline-flex; align-items: center; gap: 0.35rem; flex-shrink: 0; }
            .mobile-child-row { display: flex; align-items: center; min-height: 3.5rem; padding: 0.5rem; cursor: pointer; border-radius: 1rem; transition: all 0.2s ease; position: relative; margin-bottom: 0.4rem; touch-action: manipulation; -webkit-tap-highlight-color: transparent; background: rgba(15, 23, 42, 0.25); border: 1px solid rgba(255, 255, 255, 0.03); }
            .mobile-child-row .mobile-child-knot { margin-top: 0; }
            .mobile-child-row:hover { background: rgba(15, 23, 42, 0.45); border-color: rgba(255, 255, 255, 0.08); }
            .mobile-child-row:active { background: rgba(34, 197, 94, 0.1); transform: scale(0.98); }
            .mobile-child-knot { width: 2.75rem; height: 2.75rem; border-radius: 0.85rem; border: 2px solid var(--color-mobile-border, var(--slate-700)); background: rgba(15, 23, 42, 0.6); display: flex; align-items: center; justify-content: center; font-size: 1.15rem; flex-shrink: 0; margin-right: var(--space-sm); box-shadow: 0 4px 12px rgba(0,0,0,0.15); transition: all 0.25s cubic-bezier(0.34, 1.2, 0.64, 1); }
            .mobile-child-row:active .mobile-child-knot { border-color: var(--color-accent, var(--green-500)); box-shadow: 0 0 16px rgba(34,197,94,0.25); transform: scale(1.05); }
            .mobile-child-knot.tone-root { border-color: var(--color-node-root); background: rgba(141,110,99,0.15); border-radius: 50%; }
            .mobile-child-knot.tone-branch { border-color: var(--color-node-branch); background: rgba(245,158,11,0.12); border-radius: 50%; }
            .mobile-child-knot.tone-leaf { border-color: var(--color-node-leaf); background: rgba(168,85,247,0.12); }
            .mobile-child-knot.tone-exam { border-color: var(--color-node-exam); background: rgba(239,68,68,0.12); border-radius: 4px; transform: rotate(45deg); }
            .mobile-child-icon { line-height: 1; }
            .mobile-child-knot.tone-exam .mobile-child-icon { display: block; transform: rotate(-45deg); }
            .mobile-child-info { flex: 1; min-width: 0; }
            .mobile-tree-ui.mobile-tree-ui--construction .mobile-child-info { display: flex; align-items: center; min-height: 2.25rem; }
            .mobile-child-name { font-size: 0.8125rem; font-weight: 700; color: var(--slate-300); display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; line-height: 1.35; word-break: break-word; }
            .mobile-child-meta { font-size: 0.5625rem; color: var(--color-mobile-text-muted, var(--slate-400)); letter-spacing: 0.04em; }
            .mobile-child-arrow { color: var(--color-text-secondary, var(--slate-500)); font-size: 1rem; flex-shrink: 0; margin-left: var(--space-xs); }
            .mobile-child-folder-trail {
                display: inline-flex;
                align-items: center;
                gap: 0.35rem;
                flex-shrink: 0;
                margin-left: 0.2rem;
            }
            .mobile-child-folder-meta {
                font-size: 0.5625rem;
                font-weight: 700;
                letter-spacing: 0.03em;
                color: var(--color-mobile-text-muted, var(--slate-500));
                white-space: nowrap;
                max-width: 5.5rem;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .mobile-tree-ui.mobile-tree-ui--construction .mobile-inline-tool--view-folder {
                width: auto;
                min-width: unset;
                height: auto;
                min-height: 2.15rem;
                padding: 0.2rem 0.42rem;
                font-size: 0.58rem;
                font-weight: 800;
                letter-spacing: 0.04em;
                text-transform: uppercase;
                line-height: 1.15;
            }
            .mobile-tree-ui.mobile-tree-ui--construction .mobile-inline-tool--view-folder .mobile-inline-tool__label {
                display: block;
                max-width: 6.25rem;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .mobile-child-folder-trail .mobile-child-arrow {
                margin-left: 0;
            }

            .mobile-tree-ui.mobile-tree-ui--construction .mobile-child-row { min-height: 2.75rem; }
            .mobile-tree-ui.mobile-tree-ui--construction .mobile-child-name-slot { cursor: text; border-radius: 0.35rem; padding: 0.1rem 0.25rem; margin: -0.1rem -0.25rem; }
            .mobile-tree-ui.mobile-tree-ui--construction .mobile-child-name-input {
                font-size: 0.8125rem; font-weight: 700; color: var(--slate-100);
                background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(148, 163, 184, 0.45); border-radius: 0.5rem; padding: 0.35rem 0.5rem; box-sizing: border-box;
            }
            .mobile-tree-ui.mobile-tree-ui--construction .mobile-child-name-input--inset {
                width: auto; max-width: min(72%, 14rem); flex: 0 1 auto; min-width: 5rem;
                border-style: dashed;
            }
            .mobile-tree-ui.mobile-tree-ui--construction .mobile-panel-title-slot { cursor: text; border-radius: 0.35rem; padding: 0.05rem 0.2rem; margin: -0.05rem -0.2rem; }
            .mobile-tree-ui.mobile-tree-ui--construction .mobile-panel-title-input {
                flex: 1; min-width: 0; font-size: 0.65rem; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase;
                color: var(--slate-100); background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(148, 163, 184, 0.45); border-radius: 0.45rem; padding: 0.25rem 0.4rem;
            }
            .mobile-tree-ui.mobile-tree-ui--construction .mobile-panel-title-input--inset {
                flex: 0 1 auto; max-width: min(85%, 12rem); min-width: 4rem; border-style: dashed;
            }
            .mobile-construction-fab-host { position: absolute; right: 0.65rem; bottom: 0.55rem; z-index: 4; pointer-events: none; }
            .mobile-construction-fab-root { position: relative; display: flex; flex-direction: column; align-items: flex-end; gap: 0.35rem; pointer-events: auto; }
            .mobile-construction-fab {
                width: 2.75rem; height: 2.75rem; border-radius: 50%; border: 2px solid rgba(251, 191, 36, 0.55);
                background: linear-gradient(145deg, rgba(245, 158, 11, 0.95), rgba(217, 119, 6, 0.98)); color: rgb(24 24 27); font-size: 1.5rem; font-weight: 300; line-height: 1;
                display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 6px 20px rgba(0,0,0,0.35);
                touch-action: manipulation; -webkit-tap-highlight-color: transparent;
            }
            .mobile-construction-fab:active { transform: scale(0.94); }
            .mobile-construction-fab-menu {
                display: flex; flex-direction: column; gap: 0.25rem; min-width: 10.5rem; padding: 0.35rem;
                background: rgba(15, 23, 42, 0.96); border: 1px solid rgba(148, 163, 184, 0.35); border-radius: 0.75rem;
                box-shadow: 0 8px 28px rgba(0,0,0,0.4);
            }
            .mobile-construction-fab-menu[hidden] {
                display: none !important;
                visibility: hidden;
                pointer-events: none;
            }
            .mobile-construction-fab-menu__btn {
                display: flex; align-items: center; gap: 0.5rem; width: 100%; text-align: left;
                font-size: 0.78rem; font-weight: 800; padding: 0.5rem 0.6rem; border-radius: 0.55rem; border: none; cursor: pointer;
                background: rgba(30, 41, 59, 0.92); color: var(--slate-100); touch-action: manipulation;
                letter-spacing: 0.02em;
            }
            .mobile-construction-fab-menu__btn-ic {
                flex-shrink: 0; width: 1.85rem; height: 1.85rem; display: inline-flex; align-items: center; justify-content: center;
                font-size: 1.15rem; line-height: 1; border-radius: 0.45rem;
                background: rgba(15, 23, 42, 0.65); border: 1px solid rgba(148, 163, 184, 0.28);
            }
            .mobile-construction-fab-menu__btn-txt { flex: 1; min-width: 0; line-height: 1.25; }
            .mobile-construction-fab-menu__btn:hover { background: rgba(51, 65, 85, 0.96); }
            .mobile-construction-fab-menu__btn:hover .mobile-construction-fab-menu__btn-ic {
                border-color: rgba(251, 191, 36, 0.45); background: rgba(245, 158, 11, 0.12);
            }
            .mobile-children-panel.mobile-children-panel--fab-pad { padding-bottom: 3.75rem; }
            .mobile-tree-ui.mobile-tree-ui--construction .mobile-inline-tool--hover-reveal {
                opacity: 0; pointer-events: none; transition: opacity 0.15s ease;
            }
            .mobile-tree-ui.mobile-tree-ui--construction .mobile-child-row--selected .mobile-inline-tool--hover-reveal,
            .mobile-tree-ui.mobile-tree-ui--construction .mobile-child-row:hover .mobile-inline-tool--hover-reveal {
                opacity: 1; pointer-events: auto;
            }
            @media (hover: none) {
                .mobile-tree-ui.mobile-tree-ui--construction .mobile-child-row:hover .mobile-inline-tool--hover-reveal {
                    opacity: 0; pointer-events: none;
                }
                .mobile-tree-ui.mobile-tree-ui--construction .mobile-child-row--selected .mobile-inline-tool--hover-reveal {
                    opacity: 1; pointer-events: auto;
                }
            }

            .mobile-construction-emoji-pop {
                position: fixed; z-index: 140; max-width: min(19rem, calc(100vw - 1.25rem));
                padding: 0.4rem; border-radius: 0.75rem;
                background: rgba(15, 23, 42, 0.98); border: 1px solid rgba(148, 163, 184, 0.4);
                box-shadow: 0 10px 36px rgba(0,0,0,0.45);
            }
            .mobile-construction-emoji-pop__grid {
                display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 0.2rem;
            }
            .mobile-construction-emoji-pop__btn {
                font-size: 1.15rem; line-height: 1; padding: 0.35rem; border: none; border-radius: 0.4rem; cursor: pointer;
                background: rgba(30, 41, 59, 0.85); color: inherit; touch-action: manipulation;
            }
            .mobile-construction-emoji-pop__btn:hover { background: rgba(51, 65, 85, 0.95); }
            .mobile-panel-head-emoji {
                flex-shrink: 0; width: 2rem; height: 2rem; margin-right: 0.25rem; border-radius: 0.45rem;
                border: 1px solid rgba(148, 163, 184, 0.35); background: rgba(15, 23, 42, 0.55);
                display: inline-flex; align-items: center; justify-content: center; cursor: pointer; padding: 0;
                touch-action: manipulation; -webkit-tap-highlight-color: transparent;
            }
            .mobile-panel-head-emoji__ic { font-size: 1.05rem; line-height: 1; }
            .mobile-child-icon-btn {
                display: flex; align-items: center; justify-content: center; width: 100%; height: 100%;
                margin: 0; padding: 0; border: none; background: transparent; cursor: pointer; border-radius: inherit;
                touch-action: manipulation; -webkit-tap-highlight-color: transparent;
            }
            .mobile-child-knot.tone-exam .mobile-child-icon-btn .mobile-child-icon { display: block; transform: rotate(-45deg); }

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
            <div class="arborito-tree-pres-anchor absolute top-2 left-2 right-2 z-[25] flex justify-center px-1 sm:px-2" style="padding-top:max(0.35rem, env(safe-area-inset-top)); pointer-events:auto;">
                <arborito-tree-presentation class="w-full max-w-xl"></arborito-tree-presentation>
            </div>
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
                <!-- Outside trunk scroll: if inside #mobile-trunk-container, root can sit “under” the card when scrolling. -->
                <div id="arborito-tree-pres-flow-slot" class="arborito-tree-pres-flow-slot" hidden></div>
                <div id="mobile-trunk-container" class="mobile-trunk-container">
                    <div id="arborito-mobile-graph-loading-overlay" class="arborito-mobile-graph-loading-overlay" hidden aria-live="polite"></div>
                    <div id="mobile-trunk-scroll-content" class="mobile-trunk-scroll-content">
                        <svg id="mobile-trunk-svg" class="mobile-trunk-svg" aria-hidden="true">
                            <path id="mobile-trunk-base" class="mobile-trunk-path"></path>
                            <path id="mobile-trunk-active" class="mobile-trunk-path-active"></path>
                        </svg>
                        <div class="mobile-trunk-body" id="mobile-trunk-body">
                            <svg id="mobile-branch-connector-svg" class="mobile-branch-connector-svg" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"></svg>
                            <div class="mobile-trunk-col" id="mobile-trunk-col">
                                <div id="mobile-knots-container" class="mobile-knots-container"></div>
                            </div>
                            <div class="mobile-right-col" id="mobile-right-col"></div>
                        </div>
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
        this.mobileGraphLoadingOverlay = this.querySelector('#arborito-mobile-graph-loading-overlay');
        this.mobileTrunkScrollContent = this.querySelector('#mobile-trunk-scroll-content');
        this.mobileTrunkBody = this.querySelector('#mobile-trunk-body');
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