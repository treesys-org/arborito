

import { store } from '../store.js';
import * as graphMobile from './graph/graph-mobile.js';
import * as graphMobileTree from './graph/graph-mobile-tree.js';
import * as graphMobileOverlay from './graph/graph-mobile-overlay.js';
import * as graphVersion from './graph/graph-version.js';

import { initDOM } from './graph/graph-dom.js';


import { fileSystem } from '../services/filesystem.js';
import { ViewportSystem } from '../utils/graph-engine.js';
import {
    curriculumBaseName,
    getVersionPresentation,
    applyReleaseSwitch,
    applyLiveSwitch
} from '../utils/version-switch-logic.js';

/** Única fila curriculum / timeline (misma en móvil y escritorio) */
const VERSION_TOGGLE_ID = 'arborito-version-toggle';
const VERSION_LIVE_ID = 'arborito-version-live';
const VERSION_DROPDOWN_ID = 'arborito-version-dropdown-panel';
const VERSION_DROPDOWN_BACKDROP_ID = 'arborito-version-dropdown-backdrop';
const VERSION_ARCHIVE_ITEM_CLASS = 'arborito-version-archive-item';
/** Por encima del panel de lección (z-125) y del dock móvil; por debajo de toasts críticos si se añaden */
const VERSION_DROPDOWN_Z = '130';

function escHtml(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function escAttr(s) {
    return escHtml(s).replace(/'/g, '&#39;');
}

/** Carpeta contenedora para createNode (quita meta.json / padre de una lección .md). */
function directoryPathForNewChild(node) {
    if (!node) return null;
    const pathStr = (n) => String(n.sourcePath || n.path || '').trim();
    const folderDir = (n) => {
        let p = pathStr(n);
        if (!p) return null;
        if (p.endsWith('/meta.json')) return p.slice(0, -'/meta.json'.length);
        if (p.endsWith('.md')) {
            const i = p.lastIndexOf('/');
            return i >= 0 ? p.slice(0, i) : null;
        }
        return p.replace(/\/+$/, '');
    };
    if (node.type === 'leaf' || node.type === 'exam') {
        const parent = node.parentId ? store.findNode(node.parentId) : null;
        return parent ? folderDir(parent) : null;
    }
    return folderDir(node);
}

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
        this.dragTargetId = null;
        this.isDraggingNode = false;
        this.dragStartPos = null;
        this.dragGhost = null; // Visual element for dragging
        this.mobilePath = [];
        
        // Previous state tracking for change detection
        this._prevTheme = null;
        this._prevConstructionMode = null;
        this._prevCompletedSize = -1;
        this._prevHarvestedCount = -1;
        this._prevDataId = null;
        this._mobileRenderKey = null;
        this._prevViewMode = store.value.viewMode;
        this._prevReleasesLen = (store.value.availableReleases || []).length;
        this._prevLang = store.value.lang;
        /** @type {boolean} */
        this._versionMenuOpen = false;
        this._curriculumChromeKey = null;
        /** @type {number | null} */
        this._graphUpdateRafId = null;

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

        // Event Listeners (rAF: un solo repintado por frame ante ráfagas de graph-update)
        store.addEventListener('graph-update', this._onGraphUpdate);
        store.addEventListener('state-change', (e) => {
            const newTheme = e.detail.theme;
            const newConstructionMode = e.detail.constructionMode;
            const newCompletedSize = e.detail.completedNodes ? e.detail.completedNodes.size : 0;
            const newHarvestedCount = (e.detail.gamification?.seeds || []).length;
            const newDataId = e.detail.activeSource?.id || null;
            const newViewMode = e.detail.viewMode;
            const releasesLen = (store.value.availableReleases || []).length;
            
            const themeChanged = newTheme !== this._prevTheme;
            const modeChanged = newConstructionMode !== this._prevConstructionMode;
            const progressChanged = newCompletedSize !== this._prevCompletedSize
                                 || newHarvestedCount !== this._prevHarvestedCount;
            const dataChanged = newDataId !== this._prevDataId;
            const viewModeChanged = newViewMode !== undefined && newViewMode !== this._prevViewMode;
            const releasesChanged = releasesLen !== this._prevReleasesLen;
            const langChanged = e.detail?.lang != null && e.detail.lang !== this._prevLang;
            
            this._prevTheme = newTheme;
            this._prevConstructionMode = newConstructionMode;
            this._prevCompletedSize = newCompletedSize;
            this._prevHarvestedCount = newHarvestedCount;
            this._prevDataId = newDataId;
            if (newViewMode !== undefined) this._prevViewMode = newViewMode;
            this._prevReleasesLen = releasesLen;
            if (e.detail?.lang != null) this._prevLang = e.detail.lang;

            if (dataChanged) {
                this._versionMenuOpen = false;
                // New dataset: always reset path — root id can match across versions while children differ
                this.mobilePath = [];
                this._mobileRenderKey = null;
                this.updateGraph();
                this.renderMobileTopBanner();
                this._syncMobileTreeUiLayer();
            } else if (themeChanged || modeChanged) {
                if (modeChanged) {
                    this.selectedNodeId = null;
                    this.isMoveMode = false;
                }
                this.updateGraph();
                this.renderMobileTopBanner();
                this._syncMobileTreeUiLayer();
            } else if (progressChanged) {
                this.updateGraph();
            } else if (viewModeChanged || releasesChanged || langChanged) {
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
        
        this._boundResize = () => this.handleResize();
        window.addEventListener('resize', this._boundResize);
        window.addEventListener('orientationchange', () => setTimeout(() => this.handleResize(), 200));
        this._onArboritoViewport = () => {
            this.handleResize();
            this.scheduleMobilePrototypeOverlay(false);
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
        window.removeEventListener('resize', this._boundResize);
        if (this._onArboritoViewport) window.removeEventListener('arborito-viewport', this._onArboritoViewport);
        window.removeEventListener('keydown', this.handleKeydown);
        if (this.mobileTrunkContainer && this.redrawMobilePrototypeOverlay) {
            this.mobileTrunkContainer.removeEventListener('scroll', this.redrawMobilePrototypeOverlay);
        }
        if (this.mobileOverlayTimer) clearTimeout(this.mobileOverlayTimer);
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
    }

    handleKeydown(e) {
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

        if (e.key === 'Escape' && this._versionMenuOpen) {
            e.preventDefault();
            this.afterVersionSwitchCloseMenu();
            return;
        }
        
        if (store.value.constructionMode && this.selectedNodeId && fileSystem.features.canWrite) {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                this.handleDockAction('delete');
                return;
            }
            if (e.key === 'm' || e.key === 'M') {
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
        if (!data) return;

        const isConstruct = store.value.constructionMode;

        const ov = this.querySelector('#overlays');
        if (ov) ov.innerHTML = '';
        this.mobileTreeUI.classList.add('visible');
        this.mobileTreeUI.classList.toggle('mobile-tree-ui--construction', isConstruct);
        this.svg.style.display = 'none';
        if (this.zoomControls) this.zoomControls.style.display = 'none';
        this.querySelector('.vignette').style.display = 'none';

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
    }

    // --- HELPERS ---

    /** Mover nodo (equivalente al modo “move” + arrastre del grafo de escritorio). */
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
            store.alert(ui.moveLocalUnsupported || 'Moving nodes is not supported for local trees in this version.');
            return;
        }
        store.setModal({ type: 'move-node', node });
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


    

    async handleDockAction(action) {
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
                    store.loadData(store.value.activeSource, false);
                } catch (err) {
                    store.alert(
                        (ui.graphErrorWithMessage || 'Error: {message}').replace('{message}', err.message)
                    );
                }
            }
        }
        else if (action === 'new-file' || action === 'new-folder') {
            const dirPath = directoryPathForNewChild(node);
            const ui = store.ui;
            if (!dirPath) {
                store.alert(ui.graphCreateParentError || 'Could not resolve parent folder for the new item.');
                return;
            }
            const label =
                action === 'new-folder'
                    ? ui.graphPromptFolderName || 'Folder name:'
                    : ui.graphPromptLessonName || 'Lesson name:';
            const name = await store.prompt(
                label,
                ui.graphUntitledDefault || 'Untitled',
                ui.graphNewNodePromptTitle || 'New node'
            );
            if (name) {
                const type = action === 'new-folder' ? 'folder' : 'file';
                try {
                    await fileSystem.createNode(dirPath, name, type);
                    store.loadData(store.value.activeSource, false);
                } catch (err) {
                    store.alert(
                        (ui.graphErrorWithMessage || 'Error: {message}').replace('{message}', err.message)
                    );
                }
            }
        }
    }
}


Object.assign(ArboritoGraph.prototype, graphMobile);
Object.assign(ArboritoGraph.prototype, graphMobileTree);
Object.assign(ArboritoGraph.prototype, graphMobileOverlay);
Object.assign(ArboritoGraph.prototype, graphVersion);

Object.assign(ArboritoGraph.prototype, { initDOM });


customElements.define('arborito-graph', ArboritoGraph);
