import { getArboritoStore } from '../core/store-singleton.js';
import { createDefaultGraphUi } from '../features/tree-graph/api/graph-ui-state.js';
import { schedulePersistTreeUiState } from '../features/tree-graph/api/tree-ui-persist.js';
import { DataProcessor } from '../features/tree-graph/api/data-processor.js';
import { getMobilePath } from '../features/tree-graph/api/graph-ui-accessors.js';
import { canConstructionNavigateBack } from '../features/editor/api/construction-enter-flow.js';
import { shouldShowMobileUI } from '../shared/ui/breakpoints.js';
import { fileSystem } from '../features/backup-export/api/filesystem.js';
import { clearConstructionUI, rectFromElement, setConstructionUI } from '../features/tree-graph/api/logic/construction-ui-bridge.js';
import { getStoreFields } from '../shared/lib/store-facade.js';

/**
 * Aplica un patch de grafo/árbol al singleton (sincroniza slices vía `store.update`).
 * @param {Record<string, unknown>} partial
 */
export function commitTreeGraphState(partial) {
    const store = getArboritoStore();
    if (!store || !partial) return;
    store.update(partial);
}

function graphUiOf(store) {
    return store.state.graphUi || createDefaultGraphUi();
}

export function patchGraphUiAction(patch) {
    const store = getArboritoStore();
    if (!store || !patch) return;
    const prev = graphUiOf(store);
    let changed = false;
    for (const [key, value] of Object.entries(patch)) {
        if (prev[key] !== value) {
            changed = true;
            break;
        }
    }
    if (!changed) return;
    commitTreeGraphState({ graphUi: { ...prev, ...patch } });
}

export function bumpGraphUiRevisionAction() {
    const store = getArboritoStore();
    if (!store) return;
    const g = graphUiOf(store);
    patchGraphUiAction({ revision: (g.revision || 0) + 1, lastTrunkSig: '', lastChildrenSig: '' });
}

export function resetGraphUiForNewTreeAction() {
    const store = getArboritoStore();
    if (!store) return;
    const g = graphUiOf(store);
    commitTreeGraphState({
        graphUi: {
            ...createDefaultGraphUi(),
            revision: (g.revision || 0) + 1,
        },
    });
}

/** @param {string[]} ids */
export function navigateMobilePathAction(ids) {
    const store = getArboritoStore();
    if (!store) return;
    const next = Array.isArray(ids) ? ids.map(String) : [];
    const g = graphUiOf(store);
    patchGraphUiAction({ mobilePath: next, revision: (g.revision || 0) + 1 });
    if (typeof store.syncTreeContextFromMobilePath === 'function') {
        store.syncTreeContextFromMobilePath();
    }
    schedulePersistTreeUiState(store);
}

/** @param {string|null} id */
export function selectMobileNodeAction(id) {
    const store = getArboritoStore();
    if (!store) return;
    const g = graphUiOf(store);
    patchGraphUiAction({
        selectedNodeId: id != null ? String(id) : null,
        revision: (g.revision || 0) + 1,
    });
}

/** @param {string|null} id */
export function setPendingMoveNodeIdAction(id) {
    const store = getArboritoStore();
    if (!store) return;
    const g = graphUiOf(store);
    patchGraphUiAction({
        pendingMoveNodeId: id != null ? String(id) : null,
        revision: (g.revision || 0) + 1,
    });
}

/** Si hay `rawGraphData` pero `data` quedó null, reprocesa una vez. */
export function repairTreeViewFromRawAction() {
    const store = getArboritoStore();
    if (!store) return false;
    if (store.state.data) return false;
    if (store.state.treeHydrating) return false;
    if (store.state.loading) return false;
    if (store.state.error) return false;
    const raw = store.state.rawGraphData;
    const src = store.state.activeSource;
    if (!(raw && raw.languages) || !src) return false;
    try {
        DataProcessor.process(store, raw, src, { suppressReadmeAutoOpen: true });
        return true;
    } catch (e) {
        console.warn('[Arborito] repairTreeViewFromRaw', e);
        commitTreeGraphState({ loading: false });
        return false;
    }
}

/** Delegados finos al singleton (lógica en GraphLogic / mixins). */
export function findNodeAction(id) {
    const store = getArboritoStore();
    if (!store) return undefined;
    return store.graphLogic.findNode(id);
}

export function navigateToAction(nodeId, nodeData = null) {
    const store = getArboritoStore();
    if (!store) return undefined;
    return store.graphLogic.navigateTo(nodeId, nodeData);
}

export function toggleNodeAction(nodeId) {
    const store = getArboritoStore();
    if (!store) return undefined;
    return store.graphLogic.toggleNode(nodeId);
}

export function loadDataAction(source, forceRefresh = true) {
    return getArboritoStore()?.loadData?.(source, forceRefresh);
}

export function toggleConstructionModeAction() {
    return getArboritoStore()?.toggleConstructionMode?.();
}

function storeRef() {
    return getArboritoStore();
}

export function openExploreCurriculumSwitcherAction(e, rootEl = null) {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    const store = storeRef();
    if (!store) return;
    patchGraphUiAction({
        curriculumSwitcherTreesOnly: false,
        curriculumSwitcherVersionsOnly: false,
        curriculumSwitcherTab: 'tree',
    });
    store.toggleUnifiedCurriculumSwitcher?.(rootEl);
}

export function openBranchVersionSwitcherAction(e, rootEl = null) {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    const store = storeRef();
    if (!store) return;
    store.syncTreeContextFromMobilePath?.();
    store.patchGraphUi({
        curriculumSwitcherTreesOnly: false,
        curriculumSwitcherVersionsOnly: false,
        curriculumSwitcherTab: 'version',
    });
    store.openUnifiedCurriculumSwitcher?.(rootEl);
}

export function navigatePanelBackAction(e) {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    const path = getMobilePath();
    if (path.length <= 1) return;
    if (!canConstructionNavigateBack({ mobilePath: path })) return;
    storeRef()?.navigatePanelBack?.();
}

export function toggleCurriculumSwitcherFromChipAction(rootEl = null) {
    const store = getArboritoStore();
    if (!store) return;
    const fields = getStoreFields(store);
    if (fields.treeHydrating) return;
    if (fields.constructionMode) {
        patchGraphUiAction({
            curriculumSwitcherTreesOnly: false,
            curriculumSwitcherVersionsOnly: false,
        });
    }
    store.toggleUnifiedCurriculumSwitcher?.(rootEl);
}

export function notifyCurriculumSwitcherUpdateAction() {
    bumpGraphUiRevisionAction();
}

export function openConstructionEmojiPickerAction(anchorEl, node) {
    clearConstructionUI();
    if (!anchorEl || !node) return;
    setConstructionUI({ type: 'emoji', nodeId: node.id, rect: rectFromElement(anchorEl) });
}

function isValidMoveParentFolder(store, movingId, folderId) {
    const moving = store.findNode?.(movingId);
    if (!moving || moving.type === 'root' || moving._composedWrapper) return false;
    if (String(movingId) === String(folderId)) return false;
    const invalid = new Set();
    const markDesc = (n) => {
        invalid.add(String(n.id));
        (n.children || []).forEach(markDesc);
    };
    markDesc(moving);
    if (invalid.has(String(folderId))) return false;
    const folder = store.findNode?.(folderId);
    return !!(folder && (folder.type === 'root' || folder.type === 'branch'));
}

export function shouldShowMoveHereInPanelAction(currentFolder) {
    const store = getArboritoStore();
    if (!store) return false;
    const pendingId = store.state.graphUi?.pendingMoveNodeId;
    const pidStr = pendingId != null ? String(pendingId) : null;
    if (!pidStr || !store.state.constructionMode || !fileSystem.features.canMove) return false;
    const moving = store.findNode?.(pidStr);
    if (!moving || moving.type === 'root' || moving._composedWrapper) return false;
    if (!currentFolder || (currentFolder.type !== 'root' && currentFolder.type !== 'branch')) return false;
    if (!isValidMoveParentFolder(store, pidStr, currentFolder.id)) return false;
    return true;
}

export function runMoveHereInPanelAction(folderNode, e) {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    const store = getArboritoStore();
    if (!store) return;
    const srcId = store.state.graphUi?.pendingMoveNodeId;
    const pidStr = srcId != null ? String(srcId) : null;
    const moving = pidStr ? store.findNode?.(pidStr) : null;
    if (!moving || !shouldShowMoveHereInPanelAction(folderNode)) return;
    void store.moveNode?.(moving, String(folderNode.id)).then((ok) => {
        if (!ok) return;
        setPendingMoveNodeIdAction(null);
        store.patchGraphUi?.({ isMoveMode: false });
        bumpGraphUiRevisionAction();
        schedulePersistTreeUiState(store);
    });
}

export function startConstructionRenameAction(node, name) {
    if (!node) return;
    const store = storeRef();
    if (!store) return;
    selectMobileNodeAction(node.id);
    store.setGraphMoveMode?.(false);
    if (shouldShowMobileUI()) {
        clearConstructionUI();
        setConstructionUI({ type: 'rename', nodeId: node.id, initialName: name || '' });
        return;
    }
    store.setInlineRenameNodeId?.(node.id);
    bumpGraphUiRevisionAction();
    schedulePersistTreeUiState(store);
}

export function startPanelTitleRenameAction(node) {
    const store = getArboritoStore();
    if (!store?.state.constructionMode || !fileSystem.features.canWrite || !node) return;
    store.setInlineRenameNodeId?.(node.id);
    selectMobileNodeAction(node.id);
    store.setGraphMoveMode?.(false);
    bumpGraphUiRevisionAction();
    schedulePersistTreeUiState(store);
}

export function wireInlineRenameInputAction(node, inp) {
    const store = getArboritoStore();
    if (!store || !inp) return () => {};
    let done = false;
    let docPtr = null;
    const disarmDoc = () => {
        if (docPtr) {
            document.removeEventListener('pointerdown', docPtr, true);
            docPtr = null;
        }
    };
    const finish = async (commit) => {
        if (done) return;
        if (!commit) {
            done = true;
            disarmDoc();
            store.setInlineRenameNodeId?.(null);
            bumpGraphUiRevisionAction();
            schedulePersistTreeUiState(store);
            return;
        }
        const trimmed = String(inp.value || '').trim();
        if (!trimmed) {
            const ui = store.ui || {};
            store.notify?.(ui.graphRenameEmpty || 'Enter a name to rename.', true);
            requestAnimationFrame(() => {
                try {
                    inp.focus();
                } catch {
                    /* ignore */
                }
            });
            return;
        }
        done = true;
        disarmDoc();
        const ok = await store.renameGraphNodeFromConstruction?.(node, trimmed);
        if (!ok) {
            done = false;
            const ui = store.ui || {};
            store.notify?.(ui.graphRenameEmpty || 'Enter a name to rename.', true);
            document.addEventListener('pointerdown', docPtr, true);
            requestAnimationFrame(() => {
                try {
                    inp.focus();
                } catch {
                    /* ignore */
                }
            });
            return;
        }
        store.setInlineRenameNodeId?.(null);
        bumpGraphUiRevisionAction();
        schedulePersistTreeUiState(store);
    };
    docPtr = (ev) => {
        const el = ev.target;
        if (!(el instanceof Node)) return;
        if (el === inp || inp.contains(el)) return;
        /* Keep rename open when tapping emoji / construction chrome for this node. */
        if (
            el.closest?.(
                '.mobile-child-icon-btn, .mobile-panel-head-emoji, .arborito-lesson-emoji-btn, .mobile-construction-emoji-pop, .js-lesson-header-emoji-choice'
            )
        ) {
            return;
        }
        finish(true).catch(() => {});
    };
    document.addEventListener('pointerdown', docPtr, true);
    requestAnimationFrame(() => {
        inp.focus();
        if (typeof inp.select === 'function') inp.select();
    });
    const onKey = (ev) => {
        if (ev.key === 'Enter') {
            ev.preventDefault();
            finish(true).catch(() => {});
        } else if (ev.key === 'Escape') {
            ev.preventDefault();
            finish(false).catch(() => {});
        }
    };
    inp.addEventListener('keydown', onKey);
    inp.addEventListener('blur', () => finish(true).catch(() => {}));
    return () => {
        disarmDoc();
        inp.removeEventListener('keydown', onKey);
    };
}

/** Store.prototype, mobile graph UI (thin bind). */
export const storeGraphUiMethods = {
    patchGraphUi: patchGraphUiAction,
    bumpGraphUiRevision: bumpGraphUiRevisionAction,
    resetGraphUiForNewTree: resetGraphUiForNewTreeAction,
    navigateMobilePath: navigateMobilePathAction,
    selectMobileNode: selectMobileNodeAction,
    setPendingMoveNodeId: setPendingMoveNodeIdAction,
};
