

import { store } from '../store.js';
import * as graphMobile from './graph/graph-mobile.js';
import * as graphMobileTree from './graph/graph-mobile-tree.js';
import * as graphMobileOverlay from './graph/graph-mobile-overlay.js';
import * as graphVersion from './graph/graph-version.js';

import { initDOM } from './graph/graph-dom.js';


import { fileSystem } from '../services/filesystem.js';
import { shouldShowMobileUI } from '../utils/breakpoints.js';
import { ViewportSystem } from '../utils/graph-engine.js';
import { TreeUtils } from '../utils/tree-utils.js';
import { parseArboritoFile } from '../utils/editor-engine.js';
import { persistNodeMetaProperties } from '../utils/node-meta-persist.js';
import {
    curriculumBaseName,
    getVersionPresentation,
    applyReleaseSwitch,
    applyLiveSwitch
} from '../utils/version-switch-logic.js';

/** Single curriculum / timeline row (same on mobile and desktop) */
const VERSION_TOGGLE_ID = 'arborito-version-toggle';
const VERSION_LIVE_ID = 'arborito-version-live';
const VERSION_DROPDOWN_ID = 'arborito-version-dropdown-panel';
const VERSION_DROPDOWN_BACKDROP_ID = 'arborito-version-dropdown-backdrop';
const VERSION_ARCHIVE_ITEM_CLASS = 'arborito-version-archive-item';

class ArboritoGraph extends HTMLElement {
    constructor() {
        super();
        this.viewport = null;
        this.width = 0;
        this.height = 0;
        
        // State (legacy viewport / focus; graph nodes are not rendered in mobile-only mode)
        this.nodePositions = new Map();
        
        // Construction Mode
        this.isMoveMode = false;
        this.selectedNodeId = null;
        /** In “pick on tree” mode, id of node being moved (distinct from selection while navigating). */
        this.pendingMoveNodeId = null;
        this.dragTargetId = null;
        this.isDraggingNode = false;
        this.dragStartPos = null;
        this.dragGhost = null; // Visual element for dragging
        this.mobilePath = [];
        
        // Previous state tracking for change detection
        this._prevTheme = null;
        this._prevConstructionMode = !!store.value.constructionMode;
        this._prevCompletedSize = -1;
        this._prevHarvestedCount = -1;
        this._prevDataId = null;
        /** @type {string | null} */
        this._prevGraphRootId = null;
        this._mobileRenderKey = null;
        this._prevViewMode = store.value.viewMode;
        this._prevReleasesLen = (store.value.availableReleases || []).length;
        this._prevLang = store.value.lang;
        this._prevCurriculumEditLang = store.value.curriculumEditLang ?? null;
        this._prevTreeHydrating = !!store.value.treeHydrating;
        /** @type {boolean} */
        this._versionMenuOpen = false;
        this._curriculumChromeKey = null;
        /** @type {number | null} */
        this._graphUpdateRafId = null;
        this._repairRawScheduled = false;
        /** @type {number | null} */
        this._prevNostrLiveSeeds = null;
        /** Construction mode: row whose name is inline-edited (node id or null). */
        this._inlineRenameNodeId = null;
        /** @type {AbortController | null} */
        this._constructionFabAbort = null;
        /** Prevents parallel folder/lesson creates (same name, Nostr parent not resolved). */
        this._curriculumCreateBusy = false;

        this.handleKeydown = this.handleKeydown.bind(this);
        this._onDocClickCurriculum = this._onDocClickCurriculum.bind(this);
        this._onGraphUpdate = () => {
            if (this._graphUpdateRafId != null) return;
            this._graphUpdateRafId = requestAnimationFrame(() => {
                this._graphUpdateRafId = null;
                this.updateGraph();
            });
        };
    }

    connectedCallback() {
        this.initDOM();
        this.initViewport();
        
        // Initial Render
        if (store.value.data) {
            requestAnimationFrame(() => this.updateGraph());
        }

        // Event listeners (rAF: one repaint per frame during graph-update bursts)
        store.addEventListener('graph-update', this._onGraphUpdate);
        store.addEventListener('state-change', (e) => {
            const newTheme = e.detail.theme;
            const newConstructionMode = e.detail.constructionMode;
            const newCompletedSize = e.detail.completedNodes ? e.detail.completedNodes.size : 0;
            const newHarvestedCount = (e.detail.gamification?.seeds || []).length;
            const newDataId = e.detail.activeSource?.id || null;
            const newGraphRootId = e.detail.data?.id != null ? String(e.detail.data.id) : null;
            const newViewMode = e.detail.viewMode;
            const releasesLen = (store.value.availableReleases || []).length;

            const prevDataId = this._prevDataId;
            const prevGraphRootId = this._prevGraphRootId;
            const themeChanged = newTheme !== this._prevTheme;
            const modeChanged = newConstructionMode !== this._prevConstructionMode;
            const progressChanged = newCompletedSize !== this._prevCompletedSize
                                 || newHarvestedCount !== this._prevHarvestedCount;
            const dataChanged = newDataId !== prevDataId;
            const hydratingNow = !!e.detail?.treeHydrating;
            /*
             * `mountCurriculum` sets `data:null` while hydrating even when source did not change.
             * That makes `newGraphRootId=null` briefly and was treated as “root changed”,
             * which cleared `mobilePath` → after creating folder/lesson you jumped to tree start.
             *
             * Rule: if hydrating and new root is null, do NOT treat as a real change.
             */
            const graphRootChanged =
                !(
                    hydratingNow &&
                    newGraphRootId == null &&
                    prevGraphRootId != null &&
                    !dataChanged
                ) && newGraphRootId !== prevGraphRootId;
            const viewModeChanged = newViewMode !== undefined && newViewMode !== this._prevViewMode;
            const releasesChanged = releasesLen !== this._prevReleasesLen;
            const langChanged = e.detail?.lang != null && e.detail.lang !== this._prevLang;
            const newCurriculumLang = e.detail?.curriculumEditLang ?? null;
            const curriculumLangChanged = newCurriculumLang !== this._prevCurriculumEditLang;
            const hydratingEnded = this._prevTreeHydrating && !hydratingNow;
            const newNostrLiveSeeds = e.detail?.nostrLiveSeeds;
            const nostrLiveSeedsChanged =
                newNostrLiveSeeds !== undefined && newNostrLiveSeeds !== this._prevNostrLiveSeeds;

            this._prevTheme = newTheme;
            this._prevConstructionMode = newConstructionMode;
            this._prevCompletedSize = newCompletedSize;
            this._prevHarvestedCount = newHarvestedCount;
            this._prevDataId = newDataId;
            if (newViewMode !== undefined) this._prevViewMode = newViewMode;
            this._prevReleasesLen = releasesLen;
            if (e.detail?.lang != null) this._prevLang = e.detail.lang;
            this._prevCurriculumEditLang = newCurriculumLang;
            this._prevTreeHydrating = hydratingNow;
            if (newNostrLiveSeeds !== undefined) this._prevNostrLiveSeeds = newNostrLiveSeeds;

            /*
             * Do not overwrite `_prevGraphRootId` with null while hydrating with empty `data`: when tree returns,
             * `prev` must not be cleared or `graphRootChanged` fires and empties `mobilePath` (trunk to start).
             */
            if (newGraphRootId != null) {
                this._prevGraphRootId = newGraphRootId;
            } else if (!hydratingNow) {
                this._prevGraphRootId = null;
            }

            if (dataChanged || graphRootChanged) {
                this._versionMenuOpen = false;
                this._treeSwitcherOpen = false;
                this.pendingMoveNodeId = null;
                // Only clear trunk on source/version change, not first hydrate or F5 (restore repopulates).
                if (prevDataId != null) {
                    this.mobilePath = [];
                    this._mobileRenderKey = null;
                }
                this.updateGraph();
                this.renderMobileTopBanner();
                this._syncMobileTreeUiLayer();
            } else if (hydratingEnded) {
                // Curriculum hydration finished (local or net): repaint even if source id unchanged.
                this._treeSwitcherOpen = false;
                this.updateGraph();
                this.renderMobileTopBanner();
                this._syncMobileTreeUiLayer();
            } else if (themeChanged || modeChanged) {
                if (modeChanged) {
                    this.isMoveMode = false;
                    this.pendingMoveNodeId = null;
                    /* Mobile trunk: invalidate cache to avoid stuck onlyChrome shortcut without tools. */
                    this.invalidateMobilePrototypeKeys();
                    this._mobileStructureKey = undefined;
                    if (newConstructionMode) {
                        /* On enter: selection = active node on path (expected mobile behavior). */
                        const root = store.value.data;
                        if (root) {
                            if (!Array.isArray(this.mobilePath) || this.mobilePath.length === 0) {
                                this.mobilePath = [String(root.id)];
                            }
                            const tailId = this.mobilePath[this.mobilePath.length - 1];
                            const node = store.findNode(tailId);
                            const ok =
                                node &&
                                (node.type === 'root' ||
                                    node.type === 'branch' ||
                                    node.type === 'leaf' ||
                                    node.type === 'exam');
                            this.selectedNodeId = ok ? String(tailId) : String(root.id);
                        } else {
                            this.selectedNodeId = null;
                        }
                    } else {
                        this.selectedNodeId = null;
                    }
                }
                this.updateGraph();
                this.renderMobileTopBanner();
                this._syncMobileTreeUiLayer();
            } else if (progressChanged) {
                this.updateGraph();
            } else if (curriculumLangChanged) {
                this.invalidateMobilePrototypeKeys();
                this.updateGraph();
                this.renderMobileTopBanner();
                this._syncMobileTreeUiLayer();
            } else if (viewModeChanged || releasesChanged || langChanged || nostrLiveSeedsChanged) {
                this.refreshCurriculumChrome();
            }
        });
        
        store.addEventListener('focus-node', (e) => this.focusNode(e.detail));
        store.addEventListener('reset-zoom', () => this.resetZoom());
        this._onSetMobilePath = (e) => {
            const ids = e.detail?.ids;
            if (!Array.isArray(ids) || ids.length === 0) return;
            this.mobilePath = ids.map((id) => String(id));
            this._mobileRenderKey = null;
        };
        store.addEventListener('arborito-set-mobile-path', this._onSetMobilePath);

        // Legacy entrypoints should open the unified curriculum switcher overlay.
        this._onOpenCurriculumSwitcher = (e) => {
            const p = e?.detail?.preferTab;
            if (p === 'version' || p === 'tree') this._curriculumSwitcherTab = p;
            else this._curriculumSwitcherTab = 'tree';
            if (typeof this.openUnifiedCurriculumSwitcher === 'function') {
                this.openUnifiedCurriculumSwitcher();
            } else {
                this._treeSwitcherOpen = true;
                this._versionMenuOpen = false;
                this.refreshCurriculumChrome();
            }
        };
        store.addEventListener('open-curriculum-switcher', this._onOpenCurriculumSwitcher);
        
        this._boundResize = () => this.handleResize();
        window.addEventListener('resize', this._boundResize);
        window.addEventListener('orientationchange', () => setTimeout(() => this.handleResize(), 200));
        this._onArboritoViewport = () => {
            this.handleResize();
            this.scheduleMobilePrototypeOverlay(false);
            this.syncTreePresentationSlot();
        };
        window.addEventListener('arborito-viewport', this._onArboritoViewport);
        window.addEventListener('keydown', this.handleKeydown);
        document.addEventListener('click', this._onDocClickCurriculum);
    }

    disconnectedCallback() {
        store.removeEventListener('graph-update', this._onGraphUpdate);
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
        this.hideMobileGraphLoadingOverlay();
    }


    initViewport() {
        this.viewport = new ViewportSystem(this.svg, this.viewportGroup);
        
        // Sync dock position on zoom
        this.viewport.onZoom = () => {};

        this.handleResize();
        this.resetZoom(0);
    }

    handleResize() {
        this.width = this.container.clientWidth;
        this.height = this.container.clientHeight;
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
        const esc = (s) =>
            String(s)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
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
            this._mobileRenderKey = null;
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

        switch(e.key) {
            case '+': case '=': this.zoomBy(1.3); break;
            case '-': case '_': this.zoomBy(1/1.3); break;
            case '0': case 'r': case 'R': this.resetZoom(); break;
        }
    }

    zoomBy(k) {
        const t = this.viewport.transform;
        this.viewport.zoomTo(t.x, t.y, t.k * k, 300);
    }

    resetZoom(duration = 750) {
        const k = 1.15;
        
        const ty = (this.height - 80) - (this.height * k); 
        const tx = (this.width / 2) * (1 - k); 
        this.viewport.zoomTo(tx, ty, k, duration);
    }

    // --- RENDERING PIPELINE ---

    updateGraph() {
        const data = store.value.data;
        const isConstruct = store.value.constructionMode;

        if (!data) {
            if (this.mobileTreeUI) {
                this.mobileTreeUI.classList.toggle('mobile-tree-ui--construction', isConstruct);
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
                if (hydrating) {
                    this.mobileTreeUI.classList.add('visible');
                    this.container?.classList.add('graph-container--mobile-tree-active');
                    if (this.container) {
                        if (isConstruct) {
                            this.container.classList.add('bg-blueprint');
                            this.container.classList.remove('bg-sky');
                        } else {
                            this.container.classList.remove('bg-blueprint');
                            this.container.classList.add('bg-sky');
                        }
                    }
                    const ui = store.ui;
                    this.showMobileGraphLoadingOverlay(ui.loading || 'Loading…', isConstruct);
                } else if (hasSource) {
                    // Avoid blank screen after plant/load: no data yet but source exists — keep layer and touches.
                    this.mobileTreeUI.classList.add('visible');
                    this.container?.classList.add('graph-container--mobile-tree-active');
                    if (this.container) {
                        if (isConstruct) {
                            this.container.classList.add('bg-blueprint');
                            this.container.classList.remove('bg-sky');
                        } else {
                            this.container.classList.remove('bg-blueprint');
                            this.container.classList.add('bg-sky');
                        }
                    }
                    const ui = store.ui;
                    this.showMobileGraphLoadingOverlay(ui.loading || 'Loading…', isConstruct);
                } else {
                    this.mobileTreeUI.classList.remove('visible');
                    this.container?.classList.remove('graph-container--mobile-tree-active');
                    this.hideMobileGraphLoadingOverlay();
                }
            }
            return;
        }

        if (!this.mobileTreeUI || !this.container) return;

        this.hideMobileGraphLoadingOverlay();

        const ov = this.querySelector('#overlays');
        if (ov) ov.innerHTML = '';
        this.mobileTreeUI.classList.add('visible');
        this.container.classList.add('graph-container--mobile-tree-active');
        this.mobileTreeUI.classList.toggle('mobile-tree-ui--construction', isConstruct);
        if (this.svg) this.svg.style.display = 'none';
        if (this.zoomControls) this.zoomControls.style.display = 'none';
        const vignette = this.querySelector('.vignette');
        if (vignette) vignette.style.display = 'none';

        if (isConstruct) {
            this.container.classList.add('bg-blueprint');
            this.container.classList.remove('bg-sky');
        } else {
            this.container.classList.remove('bg-blueprint');
            this.container.classList.add('bg-sky');
        }

        this.renderMobileTopBanner();
        this.renderMobilePrototypeTree(data);
        this._syncMobileTreeUiLayer();
        this.syncTreePresentationSlot();
    }

    // --- HELPERS ---

    /** Move node (same as desktop “move” mode + graph drag). */
    openMoveNodePicker() {
        const node = store.findNode(this.selectedNodeId);
        const ui = store.ui;
        if (!node) return;
        if (node.type === 'root') {
            store.alert(ui.graphMoveDisabledRoot || 'The curriculum root cannot be moved.');
            return;
        }
        if (!fileSystem.features.canWrite) return;
        if (fileSystem.isLocal) {
            if (shouldShowMobileUI()) {
                this.startMovePickOnTree(node.id);
            } else {
                this.pendingMoveNodeId = null;
                store.setModal({ type: 'move-node', node });
            }
            return;
        }
        this.pendingMoveNodeId = null;
        store.setModal({ type: 'move-node', node });
    }

    /**
     * Closes modal and pick destination folder by navigating tree (“Move here” on current folder).
     * @param {string} nodeId
     */
    startMovePickOnTree(nodeId) {
        const node = store.findNode(nodeId);
        const ui = store.ui;
        if (!node || node.type === 'root') return;
        if (!fileSystem.features.canWrite) return;
        this.pendingMoveNodeId = String(nodeId);
        this.selectedNodeId = String(nodeId);
        this.invalidateMobilePrototypeKeys();
        this.renderMobileTopBanner();
        if (store.value.data) this.renderMobilePrototypeTree(store.value.data);
    }


    panTo(x, y) {
        // Center (x,y) on screen
        const k = this.viewport.transform.k;
        const tx = (this.width / 2) - (x * k);
        const ty = (this.height / 2) - (y * k);
        this.viewport.zoomTo(tx, ty, k, 500);
    }
    
    focusNode(nodeId) {
        const pos = this.nodePositions.get(nodeId);
        if (pos) {
            const k = 1.25;
            const tx = (this.width / 2) - (pos.x * k);
            const ty = (this.height * 0.6) - (pos.y * k);
            this.viewport.zoomTo(tx, ty, k, 1200);
        }
    }


    

    /**
     * @param {'delete'|'new-file'|'new-folder'} action
     * @param {{ skipPrompt?: boolean }} [opts]
     */
    async handleDockAction(action, opts = {}) {
        const node = store.findNode(this.selectedNodeId);
        if (!node) return;
        const nodePath = node.sourcePath || node.path;

        if (action === 'delete') {
            const ui = store.ui;
            const delBody = (ui.graphDeleteNodeBody || `Delete '{name}'?`).replace(
                '{name}',
                node.name || ''
            );
            if (await store.confirm(delBody, ui.graphDeleteNodeTitle || 'Delete node', true)) {
                try {
                    const type = (node.type === 'branch' || node.type === 'root') ? 'folder' : 'file';
                    await fileSystem.deleteNode(nodePath, type);
                    this.selectedNodeId = null;
                    this.isMoveMode = false;
                    this.pendingMoveNodeId = null;
                    if (!fileSystem.isNostrTreeSource()) {
                        store.loadData(store.value.activeSource, false);
                    }
                } catch (err) {
                    store.alert(
                        (ui.graphErrorWithMessage || 'Error: {message}').replace('{message}', err.message)
                    );
                }
            }
        }
        else if (action === 'new-file' || action === 'new-folder') {
            if (this._curriculumCreateBusy) return;
            this._curriculumCreateBusy = true;
            try {
                const dirPath = TreeUtils.directoryPathForNewChild(node, (id) => store.findNode(id));
                const ui = store.ui;
                /*
                 * Deep trees (especially lazy children): parent may not yet have
                 * materialized `path/sourcePath`, so `directoryPathForNewChild` returns null.
                 * For Local and Nostr trees, `fileSystem.createNode` can resolve parent via `explicitParentId`,
                 * so do not block creation solely for missing path.
                 */
                const canResolveByIdOnly = !!(node?.id && (fileSystem.isLocal || fileSystem.isNostrTreeSource()));
                if (!dirPath && !canResolveByIdOnly) {
                    store.alert(ui.graphCreateParentError || 'Could not resolve parent folder for the new item.');
                    return;
                }
                const safeDirPath = dirPath || '';
                const isFolder = action === 'new-folder';
                const defaultName = isFolder
                    ? (ui.graphDefaultModuleName || ui.graphUntitledDefault || 'Untitled module')
                    : (ui.defaultLessonName || ui.graphUntitledDefault || 'Untitled lesson');
                const parentName = node.type === 'root' ? (ui.navHome || node.name || 'tree') : (node.name || 'this module');
                const label =
                    isFolder
                        ? (ui.graphPromptFolderNameFriendly || ui.graphPromptFolderName || 'Name the new module:')
                              .replace('{parent}', parentName)
                        : (ui.graphPromptLessonNameFriendly || ui.graphPromptLessonName || 'Name the new lesson:')
                              .replace('{parent}', parentName);
                const promptTitle = isFolder
                    ? (ui.graphNewFolderPromptTitle || ui.graphNewNodePromptTitle || 'New module')
                    : (ui.graphNewLessonPromptTitle || ui.graphNewNodePromptTitle || 'New lesson');

                let name;
                if (opts.skipPrompt) {
                    const parentLive = store.findNode(this.selectedNodeId) || node;
                    name = this.pickUniqueChildName(parentLive, defaultName);
                } else {
                    name = await store.prompt(label, defaultName, promptTitle);
                }
                if (name) {
                    const type = isFolder ? 'folder' : 'file';
                    try {
                        await fileSystem.createNode(safeDirPath, name, type, node.id);
                        if (!fileSystem.isNostrTreeSource()) {
                            store.loadData(store.value.activeSource, false);
                        }
                        const parent = store.findNode(node.id);
                        const created = (parent?.children || []).find((child) => child.name === name);
                        if (created) {
                            if (created.type === 'branch' || created.type === 'root') {
                                parent.expanded = true;
                                store.dispatchEvent(new CustomEvent('graph-update'));
                            } else {
                                await store.navigateTo(created.id);
                            }
                        }
                        store.notify(
                            (isFolder
                                ? ui.graphFolderCreatedOk || 'Module created. Add lessons inside it next.'
                                : ui.graphLessonCreatedOk || 'Lesson created. You can edit its content now.'),
                            false
                        );
                    } catch (err) {
                        store.alert(
                            (ui.graphErrorWithMessage || 'Error: {message}').replace('{message}', err.message)
                        );
                    }
                }
            } finally {
                this._curriculumCreateBusy = false;
            }
        }
    }

    /**
     * Avoids name collisions among siblings when creating from FAB without prompt.
     * @param {object} parentNode
     * @param {string} baseName
     */
    pickUniqueChildName(parentNode, baseName) {
        const taken = new Set(
            (parentNode?.children || [])
                .map((c) => (c.name || '').trim().toLowerCase())
                .filter(Boolean)
        );
        let candidate = String(baseName || '').trim() || 'Untitled';
        if (!taken.has(candidate.toLowerCase())) return candidate;
        let n = 2;
        let probe = `${candidate} (${n})`;
        while (taken.has(probe.toLowerCase())) {
            n += 1;
            probe = `${candidate} (${n})`;
        }
        return probe;
    }

    /**
     * Rename curriculum node in construction (same path as properties / meta modal).
     * @param {object} node
     * @param {string} newName
     * @returns {Promise<boolean>}
     */
    async renameNodeFromConstruction(node, newName) {
        const ui = store.ui;
        const trimmed = String(newName || '').trim();
        if (!node || node.type === 'root') return false;
        if (!trimmed) return false;
        if (trimmed === String(node.name || '').trim()) return true;

        if (fileSystem.isMemoryReadOnlySource && fileSystem.isMemoryReadOnlySource()) {
            store.notify(ui.treeReadOnlyHint || 'Read-only tree.', true);
            return false;
        }

        const renameViaMeta = async () => {
            if (node.type === 'branch') {
                await persistNodeMetaProperties(
                    { fileSystem, store },
                    {
                        node,
                        name: trimmed,
                        icon: node.icon || '📁',
                        description: node.description || '',
                        originalMeta: { order: node.order || '99' },
                        originalBody: '',
                        skipReload: true
                    }
                );
                return true;
            }
            if (node.type === 'leaf' || node.type === 'exam') {
                const parsed = parseArboritoFile(node.content || '');
                const bodyMd = parsed.body;
                const nextMeta = { ...(parsed.meta || {}) };
                nextMeta.title = trimmed;
                const icon = (nextMeta.icon || node.icon || '📄').trim();
                await persistNodeMetaProperties(
                    { fileSystem, store },
                    {
                        node,
                        name: trimmed,
                        icon,
                        description: nextMeta.description ?? node.description ?? '',
                        originalMeta: nextMeta,
                        originalBody: bodyMd,
                        skipReload: true
                    }
                );
                return true;
            }
            return false;
        };

        let oldPath = String(node.sourcePath || '').trim();
        if (oldPath.endsWith('/meta.json')) {
            oldPath = oldPath.replace('/meta.json', '');
        }

        // Local/Nostr: prefer instant meta saves (they refresh the graph). Path-based rename is optional.
        if (fileSystem.isLocal || fileSystem.isNostrTreeSource()) {
            try {
                if (!oldPath) {
                    const ok = await renameViaMeta();
                    if (!ok) {
                        store.notify(ui.graphRenameNeedPath || 'Cannot rename this item yet (path missing).', true);
                        return false;
                    }
                    return true;
                }
                const isFolder = node.type === 'branch';
                await fileSystem.renameNode(oldPath, trimmed, isFolder ? 'folder' : 'file');
                return true;
            } catch (err) {
                store.alert((ui.graphErrorWithMessage || 'Error: {message}').replace('{message}', err.message));
                return false;
            }
        }

        // Legacy HTTPS trees (if writable paths exist)
        if (!oldPath) {
            store.notify(ui.graphRenameNeedPath || 'Cannot rename this item yet (path missing).', true);
            return false;
        }
        const isFolder = node.type === 'branch';
        try {
            await fileSystem.renameNode(oldPath, trimmed, isFolder ? 'folder' : 'file');
            await store.loadData(store.value.activeSource, false);
            return true;
        } catch (err) {
            store.alert((ui.graphErrorWithMessage || 'Error: {message}').replace('{message}', err.message));
            return false;
        }
    }

    /**
     * Changes only node icon/emoji (construction curriculum, same flow as lesson / modal).
     * @param {object} node
     * @param {string} icon
     */
    async applyConstructionNodeIcon(node, icon) {
        const ui = store.ui;
        const em = String(icon || '').trim();
        if (!node || !em || !fileSystem.features.canWrite) return false;
        try {
            if (node.type === 'branch' || node.type === 'root') {
                if (em === String(node.icon || '').trim()) return true;
                await persistNodeMetaProperties(
                    { fileSystem, store },
                    {
                        node,
                        name: node.name,
                        icon: em,
                        description: node.description || '',
                        originalMeta: { order: node.order || '99' },
                        originalBody: '',
                        skipReload: true
                    }
                );
                return true;
            }
            if (node.type === 'leaf' || node.type === 'exam') {
                const parsed = parseArboritoFile(node.content || '');
                const name = (parsed.meta.title || node.name || '').trim();
                if (!name) {
                    store.notify(ui.graphPromptLessonName || 'Lesson name:', true);
                    return false;
                }
                const baseline = (parsed.meta.icon || node.icon || '📄').trim();
                if (em === baseline) return true;
                const bodyMd = parsed.body;
                await persistNodeMetaProperties(
                    { fileSystem, store },
                    {
                        node,
                        name,
                        icon: em,
                        description: parsed.meta.description ?? node.description ?? '',
                        originalMeta: parsed.meta,
                        originalBody: bodyMd,
                        skipReload: true
                    }
                );
                return true;
            }
        } catch (e) {
            store.alert(
                (ui.graphErrorWithMessage || 'Error: {message}').replace('{message}', e.message)
            );
            return false;
        }
        return false;
    }
}


Object.assign(ArboritoGraph.prototype, graphMobile);
Object.assign(ArboritoGraph.prototype, graphMobileTree);
Object.assign(ArboritoGraph.prototype, graphMobileOverlay);
Object.assign(ArboritoGraph.prototype, graphVersion);

Object.assign(ArboritoGraph.prototype, { initDOM });


customElements.define('arborito-graph', ArboritoGraph);
