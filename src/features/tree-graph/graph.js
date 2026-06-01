/* ──────────────────────────────────────────────────────────────────────────
 * Tree graph (the trunk) — orientation map
 * ──────────────────────────────────────────────────────────────────────────
 * The "graph" is a single, adaptive tree view (one renderer; no separate
 * desktop graph anymore — the historical `graph-mobile-*` filenames are kept
 * for compatibility and predate that consolidation). The trunk is rendered
 * by mixin-style modules that are bolted onto this custom element via
 * `Object.assign(ArboritoGraph.prototype, …)` at the bottom of THIS file
 * (`graph.js`). To find a piece:
 *
 *   • TRUNK RENDERING (the actual tree on screen):
 *       graph/graph-mobile-tree-render.js     ← main render: knots + panels + rows
 *       graph/panel-head.js                   ← shared panel header builder/binder
 *       graph/graph-mobile-overlay.js         ← SVG branch lines + drag overlay
 *
 *   • CONSTRUCTION-MODE ONLY UI (edit, move, drag, inline rename):
 *       graph/graph-mobile-tree-bindings.js   ← drag/tap/keyboard wiring
 *       graph/graph-mobile-tree-panel-tools.js← side-panel buttons & dock
 *       graph/graph-mobile-toolbar.js         ← top toolbar (mode switch etc.)
 *       graph/construction-actions.js         ← CRUD: create/rename/move/delete
 *
 *   • CHROME AROUND THE TRUNK (top banner, language pill, version chip):
 *       graph/graph-mobile-tree-presentation.js ← banner + presentation card
 *       sources/modals/curriculum-switcher.js   ← bottom-sheet picker (out of graph/)
 *
 *   • VERSIONING / SNAPSHOTS (lives in version-updates/, mixed in here):
 *       version-updates/version-timeline.js     ← timeline + chip menu
 *       version-updates/snapshots-admin.js      ← admin-only snapshots panel
 *       version-updates/version-graph-helpers.js← shared version helpers + IDs
 *
 *   • DOM scaffold + CSS injection: graph/graph-dom.js (the `<style>` lives
 *     inline there to keep the canvas self-contained).
 *
 * THIS FILE owns the public element class (`<arborito-graph>`), the
 * state-change pipeline, and the high-level orchestration of `updateGraph`.
 * It is intentionally thin — almost every render method is implemented in a
 * sibling module above and merged in via `initDOM(this)`.
 * ────────────────────────────────────────────────────────────────────────── */

import { store } from '../../core/store.js';
import * as graphMobileShared from './graph/graph-mobile-shared.js';
import * as graphMobileCurriculumSwitcher from '../sources/modals/curriculum-switcher.js';
import * as graphMobileVersionTimeline from '../version-updates/version-timeline.js';
import * as graphMobileSnapshotsAdmin from '../version-updates/snapshots-admin.js';
import * as graphMobileTreePresentation from './graph/graph-mobile-tree-presentation.js';
import * as graphMobileToolbar from './graph/graph-mobile-toolbar.js';
import * as graphMobileTreeRender from './graph/graph-mobile-tree-render.js';
import * as graphMobileTreePanelTools from './graph/graph-mobile-tree-panel-tools.js';
import * as graphMobileTreeBindings from './graph/graph-mobile-tree-bindings.js';
import * as graphMobileOverlay from './graph/graph-mobile-overlay.js';
import * as graphConstructionActions from './graph/construction-actions.js';
import * as graphVersion from '../version-updates/version-graph-helpers.js';

import { initDOM } from './graph/graph-dom.js';


import { fileSystem } from '../backup-export/filesystem.js';
import { syncGardenBackground } from '../garden-progress/garden-background.js';
import { escHtml as esc } from '../../shared/lib/html-escape.js';

/* ──────────────────────────────────────────────────────────────────────
 * State signature (graph cares about these slices of the store).
 *
 * Building a single "|"-joined string and comparing it against the previous
 * one replaces the 12-flag `_prev*` constellation that used to live on the
 * component. The order is fixed so we can split + index by position when we
 * need to know which slice flipped (`_diffStateSig`).
 *
 * The rule: every value here MUST be cheaply stringifiable AND idempotent
 * under no-op rerenders (e.g. `data?.id` not `data` itself). Anything else
 * goes through `_diffStateSig` semantically.
 * ────────────────────────────────────────────────────────────────────── */
const SIG_KEYS = /** @type {const} */ ([
    'theme',
    'constructionMode',
    'completedSize',
    'harvestedCount',
    'dataId',
    'graphRootId',
    'viewMode',
    'releasesLen',
    'lang',
    'editLang',
    'treeHydrating',
    'nostrLiveSeeds',
]);

function buildStateSig(s) {
    return [
        s.theme || '',
        s.constructionMode ? '1' : '0',
        s.completedNodes ? s.completedNodes.size : 0,
        (s.gamification?.seeds || []).length,
        s.activeSource?.id || '',
        s.data?.id != null ? String(s.data.id) : '',
        s.viewMode || '',
        (s.availableReleases || []).length,
        s.lang || '',
        s.curriculumEditLang ?? '',
        s.treeHydrating ? '1' : '0',
        s.nostrLiveSeeds == null ? '' : String(s.nostrLiveSeeds),
    ].join('|');
}

function diffStateSig(prev, next) {
    const a = prev.split('|');
    const b = next.split('|');
    const out = {};
    for (let i = 0; i < SIG_KEYS.length; i++) {
        out[SIG_KEYS[i]] = a[i] !== b[i];
    }
    out.prev = Object.fromEntries(SIG_KEYS.map((k, i) => [k, a[i]]));
    out.next = Object.fromEntries(SIG_KEYS.map((k, i) => [k, b[i]]));
    return out;
}

class ArboritoGraph extends HTMLElement {
    constructor() {
        super();

        /* Construction-mode UI state (selection / pending move / inline rename).
         * Distinct from `store.value.selectedNode` which is the lesson currently
         * open in the reader: this `selectedNodeId` is the node highlighted on
         * the tree itself for editing. */
        this.isMoveMode = false;
        this.selectedNodeId = null;
        this.pendingMoveNodeId = null;
        this._inlineRenameNodeId = null;
        this.mobilePath = [];

        /* Idempotency cache for the fan-out toggles in `updateGraph` so we
         * don't touch the DOM when nothing actually changed. Kept here (vs
         * relying purely on the rAF coalescer) because `_setOverlay` rebuilds
         * its inner SVG, which is genuinely expensive. */
        this._uiState = {
            visible: null,
            construction: null,
            background: null,
            overlay: null,
        };

        /* Single source of truth for "should I rerun the side-effects?":
         * if this signature didn't change since last `state-change`, the whole
         * listener is a no-op. The signature shape is documented above. */
        this._lastStateSig = '';

        /** @type {boolean} */
        this._versionMenuOpen = false;
        this._treeSwitcherOpen = false;
        /** @type {number | null} */
        this._graphUpdateRafId = null;
        this._repairRawScheduled = false;
        /** @type {AbortController | null} */
        this._constructionFabAbort = null;
        /** Prevents parallel folder/lesson creates (same name, Nostr parent not resolved). */
        this._curriculumCreateBusy = false;

        this.handleKeydown = this.handleKeydown.bind(this);
        this._onDocClickCurriculum = this._onDocClickCurriculum.bind(this);
        this._onGraphUpdate = () => this._scheduleUpdateGraph();
        this._onStateChange = this._onStateChange.bind(this);
    }

    connectedCallback() {
        this.initDOM();
        syncGardenBackground(store);

        /* Anchor for the onboarding tour (`graph`/`graph-root` step). The mobile knot also tags
         * itself with `data-arbor-tour="graph-root"`; this attribute makes the desktop graph
         * discoverable so the shell tour can highlight the canvas after a tree loads. */
        if (!this.hasAttribute('data-arbor-tour')) {
            this.setAttribute('data-arbor-tour', 'graph');
        }

        if (store.value.data) {
            requestAnimationFrame(() => this.updateGraph());
        }

        store.addEventListener('graph-update', this._onGraphUpdate);
        store.addEventListener('state-change', this._onStateChange);
        /* Seed the signature with the current state so the first real
         * `state-change` after mount is treated as the natural "first paint"
         * (any actual delta vs. now will trigger an update). */
        this._lastStateSig = buildStateSig(store.value);
        
        this._onSetMobilePath = (e) => {
            const ids = e.detail?.ids;
            if (!Array.isArray(ids) || ids.length === 0) return;
            this.mobilePath = ids.map((id) => String(id));
            this.invalidateMobilePrototypeKeys();
        };
        store.addEventListener('arborito-set-mobile-path', this._onSetMobilePath);

        this._onOpenCurriculumSwitcher = (e) => {
            const p = e?.detail?.preferTab;
            if (p === 'version' || p === 'tree') this._curriculumSwitcherTab = p;
            else this._curriculumSwitcherTab = 'tree';
            this.openUnifiedCurriculumSwitcher();
        };
        store.addEventListener('open-curriculum-switcher', this._onOpenCurriculumSwitcher);
        
        this._boundResize = () => {
            if (this._resizeTimer) clearTimeout(this._resizeTimer);
            this._resizeTimer = setTimeout(() => this.handleResize(), 120);
        };
        window.addEventListener('resize', this._boundResize);
        window.addEventListener('orientationchange', () => setTimeout(() => this.handleResize(), 200));
        this._onArboritoViewport = () => {
            if (this._resizeTimer) clearTimeout(this._resizeTimer);
            this._resizeTimer = setTimeout(() => {
                this.handleResize();
                this.scheduleMobilePrototypeOverlay();
                this.syncTreePresentationSlot();
            }, 120);
        };
        window.addEventListener('arborito-viewport', this._onArboritoViewport);
        window.addEventListener('keydown', this.handleKeydown);
        document.addEventListener('click', this._onDocClickCurriculum);
    }

    disconnectedCallback() {
        store.removeEventListener('graph-update', this._onGraphUpdate);
        store.removeEventListener('state-change', this._onStateChange);
        if (this._graphUpdateRafId != null) {
            cancelAnimationFrame(this._graphUpdateRafId);
            this._graphUpdateRafId = null;
        }
        this._clearVersionDropdownPanelStyles();
        document.removeEventListener('click', this._onDocClickCurriculum);
        if (this._onSetMobilePath) store.removeEventListener('arborito-set-mobile-path', this._onSetMobilePath);
        if (this._onOpenCurriculumSwitcher) store.removeEventListener('open-curriculum-switcher', this._onOpenCurriculumSwitcher);
        window.removeEventListener('resize', this._boundResize);
        if (this._onArboritoViewport) window.removeEventListener('arborito-viewport', this._onArboritoViewport);
        window.removeEventListener('keydown', this.handleKeydown);
        if (this.mobileTrunkContainer && this.redrawMobilePrototypeOverlay) {
            this.mobileTrunkContainer.removeEventListener('scroll', this.redrawMobilePrototypeOverlay);
        }
        if (this.mobileOverlayTimer) clearTimeout(this.mobileOverlayTimer);
        if (this._resizeTimer) clearTimeout(this._resizeTimer);
        this.hideMobileGraphLoadingOverlay();
    }

    /* ------------------------------------------------------------------
     * State-change pipeline
     * ------------------------------------------------------------------
     * One handler does the whole job:
     *   1. compute a string signature of the slices we actually care about
     *   2. if it didn't change since last time, return early (zero work)
     *   3. otherwise diff old↔new signatures, run the small set of
     *      transitions that touch *this component's* state, and schedule
     *      one rAF-coalesced repaint.
     *
     * `updateGraph` itself is idempotent (the inner setters short-circuit
     * on no-op writes), so we don't need a per-key "what should I call"
     * fan-out — just trigger a repaint and the right thing happens.
     */
    _onStateChange(e) {
        const next = buildStateSig(e.detail || {});
        if (next === this._lastStateSig) return;
        const prev = this._lastStateSig;
        this._lastStateSig = next;
        const diff = diffStateSig(prev, next);

        /* `mountCurriculum` briefly sets `data:null` while hydrating even when
         * the source did not change. That makes `graphRootId` flip to '' and
         * back, which used to wipe `mobilePath`. Treat the transient null
         * during hydration as "no real change". */
        const transientRootClear =
            diff.graphRootId &&
            !diff.dataId &&
            diff.next.treeHydrating === '1' &&
            diff.next.graphRootId === '';
        const realRootChanged = diff.graphRootId && !transientRootClear;

        if (diff.dataId || realRootChanged) {
            this._versionMenuOpen = false;
            this._treeSwitcherOpen = false;
            this.pendingMoveNodeId = null;
            /* Only clear the path on a real source switch. First hydrate /
             * F5 leaves `prev.dataId === ''`, and the path restore from
             * IndexedDB will re-populate it. */
            if (diff.dataId && diff.prev.dataId !== '') {
                this.mobilePath = [];
                this.invalidateMobilePrototypeKeys();
            }
        }

        if (diff.constructionMode) {
            this.isMoveMode = false;
            this.pendingMoveNodeId = null;
            this.invalidateMobilePrototypeKeys();
            if (diff.next.constructionMode === '1') {
                /* Entering construction: pick the active path tail as the
                 * default selection so the side panel has something to act
                 * on. Falls back to root when the path is empty. */
                const root = store.value.data;
                if (root) {
                    if (!Array.isArray(this.mobilePath) || this.mobilePath.length === 0) {
                        this.mobilePath = [String(root.id)];
                    }
                    const tailId = this.mobilePath[this.mobilePath.length - 1];
                    const tail = store.findNode(tailId);
                    this.selectedNodeId = tail && tail.type ? String(tailId) : String(root.id);
                } else {
                    this.selectedNodeId = null;
                }
            } else {
                this.selectedNodeId = null;
            }
        }

        const hydratingEnded =
            diff.treeHydrating &&
            diff.prev.treeHydrating === '1' &&
            diff.next.treeHydrating === '0';
        if (hydratingEnded) {
            this._treeSwitcherOpen = false;
        }

        if (diff.editLang) {
            this.invalidateMobilePrototypeKeys();
        }

        const needsRepaint =
            diff.dataId ||
            realRootChanged ||
            hydratingEnded ||
            diff.theme ||
            diff.constructionMode ||
            diff.completedSize ||
            diff.harvestedCount ||
            diff.editLang;
        if (needsRepaint) {
            this._scheduleUpdateGraph();
            return;
        }
        /* Non-structural deltas (chrome only): cheap path that just refreshes
         * the navbar / version chip / online-readers count. */
        if (diff.viewMode || diff.releasesLen || diff.lang || diff.nostrLiveSeeds) {
            this.refreshCurriculumChrome();
        }
    }

    /** rAF-coalesced repaint: many `update()` calls in a single tick collapse
     *  to one `updateGraph` pass on the next frame. `updateGraph` itself
     *  fans out to `renderMobileTopBanner + _syncMobileTreeUiLayer` when there
     *  is data to render. */
    _scheduleUpdateGraph() {
        if (this._graphUpdateRafId != null) return;
        this._graphUpdateRafId = requestAnimationFrame(() => {
            this._graphUpdateRafId = null;
            this.updateGraph();
        });
    }


    handleResize() {
        if (store.value.data) this.updateGraph();
        if (this._versionMenuOpen) {
            requestAnimationFrame(() => this.positionVersionDropdownPanel());
        }
        this.syncTreePresentationSlot();
    }

    /** Hides loading overlay without touching trunk (slot + tree body). */
    hideMobileGraphLoadingOverlay() {
        const ov = this.mobileGraphLoadingOverlay;
        if (!ov) return;
        ov.hidden = true;
        ov.innerHTML = '';
        ov.className = 'arborito-mobile-graph-loading-overlay';
    }

    showMobileGraphLoadingOverlay(message, constructionTone) {
        const ov = this.mobileGraphLoadingOverlay;
        if (!ov) return;
        const ui = store.ui;
        const msg = String(message ?? ui.loading ?? 'Loading…');
        const textCls = constructionTone
            ? 'text-slate-200 dark:text-slate-300'
            : 'text-slate-600 dark:text-slate-400';
        const toneMod = constructionTone ? ' arborito-mobile-graph-loading-overlay--construct' : '';
        ov.className = `arborito-mobile-graph-loading-overlay flex flex-col items-center justify-center text-center text-sm font-semibold gap-3 ${textCls}${toneMod}`;
        ov.innerHTML = `<div class="arborito-loading-tree-stage" aria-hidden="true"><svg class="arborito-loading-tree-svg" viewBox="0 0 72 88" width="80" height="98" role="presentation" focusable="false"><g class="arborito-loading-tree-sprout"><path d="M36 82 V30" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" opacity="0.92"/><path d="M36 50 L12 34" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" opacity="0.78"/><path d="M36 50 L60 34" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" opacity="0.78"/><path d="M36 38 L22 16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" opacity="0.6"/><path d="M36 38 L50 16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" opacity="0.6"/><circle cx="36" cy="12" r="12" fill="currentColor" opacity="0.22"/></g></svg></div><span class="arborito-loading-tree-msg px-2 leading-snug">${esc(msg)}</span>`;
        ov.hidden = false;
    }

    /**
     * Mobile construction (no desktop forest): course card lives in trunk scroll
     * so it does not overlap HOME panel.
     */
    syncTreePresentationSlot() {
        const root = document.documentElement;
        const anchor = this.querySelector('.arborito-tree-pres-anchor');
        const slot = this.querySelector('#arborito-tree-pres-flow-slot');
        const pres = this.querySelector('arborito-tree-presentation');
        if (!anchor || !slot || !pres) return;

        const useFlow =
            root.classList.contains('arborito-construction-mobile') && !root.classList.contains('arborito-desktop');

        if (useFlow) {
            slot.hidden = false;
            anchor.classList.add('arborito-tree-pres-anchor--flow-empty');
            anchor.setAttribute('aria-hidden', 'true');
            if (pres.parentElement !== slot) {
                slot.appendChild(pres);
            }
        } else {
            slot.hidden = true;
            anchor.classList.remove('arborito-tree-pres-anchor--flow-empty');
            anchor.removeAttribute('aria-hidden');
            if (pres.parentElement !== anchor) {
                anchor.appendChild(pres);
            }
        }
        requestAnimationFrame(() => {
            if (typeof pres.syncMobilePresClearanceFromHost === 'function') {
                pres.syncMobilePresClearanceFromHost();
            }
        });
    }

    handleKeydown(e) {
        const t = e.target;
        if (t instanceof Element) {
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return;
            if (t.isContentEditable || t.closest('[contenteditable="true"]')) return;
        }

        if (e.key === 'Escape' && this._versionMenuOpen) {
            e.preventDefault();
            this.afterVersionSwitchCloseMenu();
            return;
        }

        if (e.key === 'Escape' && this._treeSwitcherOpen) {
            e.preventDefault();
            this._treeSwitcherOpen = false;
            this.refreshCurriculumChrome();
            return;
        }
        
        if (store.value.constructionMode && this.selectedNodeId && fileSystem.features.canWrite) {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                this.handleDockAction('delete');
                return;
            }
            if (e.key === 'm' || e.key === 'M') {
                const mn = store.findNode(this.selectedNodeId);
                if (mn?.type === 'root') return;
                this.openMoveNodePicker();
                return;
            }
        }
    }

    /**
     * Idempotent class/style writers: state-change bursts call updateGraph many
     * times per frame, so we cache the last value and skip touching the DOM
     * when nothing actually changed. This keeps Style/Layout off the critical
     * path on slow devices and prevents layout thrash during hydration.
     */
    _setUiVisible(visible) {
        if (this._uiState.visible === visible) return;
        this._uiState.visible = visible;
        this.mobileTreeUI?.classList.toggle('visible', visible);
        this.container?.classList.toggle('graph-container--mobile-tree-active', visible);
    }

    _setUiConstruction(on) {
        if (this._uiState.construction === on) return;
        this._uiState.construction = on;
        this.mobileTreeUI?.classList.toggle('mobile-tree-ui--construction', on);
    }

    _setBackground(kind /* 'sky' | 'blueprint' | null */) {
        if (this._uiState.background === kind) return;
        this._uiState.background = kind;
        if (!this.container) return;
        const cl = this.container.classList;
        cl.toggle('bg-blueprint', kind === 'blueprint');
        cl.toggle('bg-sky', kind === 'sky');
    }

    _setOverlay(kind /* 'loading' | null */, isConstruct) {
        const key = kind ? `${kind}:${isConstruct ? 1 : 0}` : null;
        if (this._uiState.overlay === key) return;
        this._uiState.overlay = key;
        if (kind === 'loading') {
            const ui = store.ui;
            this.showMobileGraphLoadingOverlay(ui.loading || 'Loading…', isConstruct);
        } else {
            this.hideMobileGraphLoadingOverlay();
        }
    }

    updateGraph() {
        const data = store.value.data;
        const isConstruct = store.value.constructionMode;

        if (!data) {
            if (!this.mobileTreeUI) return;
            this._setUiConstruction(isConstruct);
            if (
                !store.value.treeHydrating &&
                store.state.rawGraphData?.languages &&
                store.state.activeSource &&
                typeof store.repairTreeViewFromRaw === 'function'
            ) {
                if (!this._repairRawScheduled) {
                    this._repairRawScheduled = true;
                    queueMicrotask(() => {
                        this._repairRawScheduled = false;
                        store.repairTreeViewFromRaw();
                    });
                }
            }
            const hydrating = store.value.treeHydrating;
            const hasSource = !!store.value.activeSource;
            const sourcesBlocked =
                typeof store.isSourcesDismissBlocked === 'function' &&
                store.isSourcesDismissBlocked();
            if (hydrating && sourcesBlocked) {
                this._setUiVisible(false);
                this._setOverlay(null);
            } else if (hydrating || hasSource) {
                /* `hasSource && !hydrating`: avoid blank screen after plant/load —
                 * no data yet but source exists, keep the layer and overlay. */
                this._setUiVisible(true);
                this._setBackground(isConstruct ? 'blueprint' : 'sky');
                this._setOverlay('loading', isConstruct);
            } else {
                this._setUiVisible(false);
                this._setOverlay(null);
            }
            return;
        }

        if (!this.mobileTreeUI || !this.container) return;

        this._setOverlay(null);
        this._setUiVisible(true);
        this._setUiConstruction(isConstruct);
        this._setBackground(isConstruct ? 'blueprint' : 'sky');

        this.renderMobileTopBanner();
        this.renderMobilePrototypeTree(data);
        this._syncMobileTreeUiLayer();
        this.syncTreePresentationSlot();
    }


}


Object.assign(ArboritoGraph.prototype, graphMobileShared);
Object.assign(ArboritoGraph.prototype, graphMobileCurriculumSwitcher);
Object.assign(ArboritoGraph.prototype, graphMobileVersionTimeline);
Object.assign(ArboritoGraph.prototype, graphMobileSnapshotsAdmin);
Object.assign(ArboritoGraph.prototype, graphMobileTreePresentation);
Object.assign(ArboritoGraph.prototype, graphMobileToolbar);
Object.assign(ArboritoGraph.prototype, graphMobileTreeRender);
Object.assign(ArboritoGraph.prototype, graphMobileTreePanelTools);
Object.assign(ArboritoGraph.prototype, graphMobileTreeBindings);
Object.assign(ArboritoGraph.prototype, graphMobileOverlay);
Object.assign(ArboritoGraph.prototype, graphConstructionActions);
Object.assign(ArboritoGraph.prototype, graphVersion);

Object.assign(ArboritoGraph.prototype, { initDOM });


customElements.define('arborito-graph', ArboritoGraph);
