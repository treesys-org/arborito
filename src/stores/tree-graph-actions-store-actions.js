import { getArboritoStore } from '../core/store-singleton.js';
import { schedulePersistTreeUiState } from '../features/tree-graph/api/tree-ui-persist.js';
import { createDefaultGraphUi } from '../features/tree-graph/api/graph-ui-state.js';
import {
    openMoveNodePicker as openMoveNodePickerImpl,
    startMovePickOnTree as startMovePickOnTreeImpl,
    handleDockAction as handleDockActionImpl,
    pickUniqueChildName,
    renameNodeFromConstruction,
    applyConstructionNodeIcon,
} from '../features/tree-graph/api/logic/construction-actions.js';
import { runMobileNodeAction as runMobileNodeActionImpl } from '../features/tree-graph/api/logic/graph-mobile-toolbar.js';
import { _ensureLocalSnapshotsLoaded } from '../features/version-updates/api/version-timeline.js';
import { _ensureSnapshotsAdminLoaded } from '../features/version-updates/api/snapshots-admin.js';
import { getVersionPresentation } from '../features/version-updates/api/version-switch-logic.js';

function shell() {
    return getArboritoStore();
}

function graphUiOf(storeRef) {
    return storeRef.state.graphUi || createDefaultGraphUi();
}

/** @param {object} storeRef @param {HTMLElement | null} rootEl */
function createActionContext(storeRef, rootEl = null) {
    const ctx = {
        root: rootEl,
        get selectedNodeId() {
            return graphUiOf(storeRef).selectedNodeId;
        },
        set selectedNodeId(v) {
            storeRef.selectMobileNode(v);
        },
        get pendingMoveNodeId() {
            return graphUiOf(storeRef).pendingMoveNodeId;
        },
        set pendingMoveNodeId(v) {
            storeRef.setPendingMoveNodeId(v);
        },
        get isMoveMode() {
            return !!graphUiOf(storeRef).isMoveMode;
        },
        set isMoveMode(v) {
            storeRef.patchGraphUi({ isMoveMode: !!v });
        },
        get mobilePath() {
            return graphUiOf(storeRef).mobilePath || [];
        },
        set mobilePath(v) {
            storeRef.navigateMobilePath(Array.isArray(v) ? v : []);
        },
        get _inlineRenameNodeId() {
            return graphUiOf(storeRef).inlineRenameNodeId;
        },
        set _inlineRenameNodeId(v) {
            storeRef.patchGraphUi({ inlineRenameNodeId: v != null ? String(v) : null });
            storeRef.bumpGraphUiRevision();
        },
        get _versionMenuOpen() {
            return !!graphUiOf(storeRef).versionMenuOpen;
        },
        set _versionMenuOpen(v) {
            storeRef.patchGraphUi({ versionMenuOpen: !!v });
        },
        get _treeSwitcherOpen() {
            return !!graphUiOf(storeRef).treeSwitcherOpen;
        },
        set _treeSwitcherOpen(v) {
            storeRef.patchGraphUi({ treeSwitcherOpen: !!v, revision: graphUiOf(storeRef).revision + 1 });
        },
        get _curriculumSwitcherTreesOnly() {
            return !!graphUiOf(storeRef).curriculumSwitcherTreesOnly;
        },
        set _curriculumSwitcherTreesOnly(v) {
            storeRef.patchGraphUi({ curriculumSwitcherTreesOnly: !!v });
        },
        get _curriculumSwitcherVersionsOnly() {
            return !!graphUiOf(storeRef).curriculumSwitcherVersionsOnly;
        },
        set _curriculumSwitcherVersionsOnly(v) {
            storeRef.patchGraphUi({ curriculumSwitcherVersionsOnly: !!v });
        },
        get _curriculumSwitcherTab() {
            return graphUiOf(storeRef).curriculumSwitcherTab || 'tree';
        },
        set _curriculumSwitcherTab(v) {
            storeRef.patchGraphUi({ curriculumSwitcherTab: v || 'tree' });
        },
        get _curriculumCreateBusy() {
            return !!graphUiOf(storeRef).curriculumCreateBusy;
        },
        set _curriculumCreateBusy(v) {
            storeRef.patchGraphUi({ curriculumCreateBusy: !!v });
        },
        get _suppressCurriculumDocCloseUntil() {
            return graphUiOf(storeRef).suppressCurriculumDocCloseUntil || 0;
        },
        set _suppressCurriculumDocCloseUntil(v) {
            storeRef.patchGraphUi({ suppressCurriculumDocCloseUntil: Number(v) || 0 });
        },
        get _curriculumChromeBindKey() {
            return graphUiOf(storeRef).curriculumChromeBindKey;
        },
        set _curriculumChromeBindKey(v) {
            storeRef.patchGraphUi({ curriculumChromeBindKey: v ?? null });
        },
        invalidateMobilePrototypeKeys() {
            storeRef.bumpGraphUiRevision();
        },
        renderMobilePrototypeTree() {
            storeRef.bumpGraphUiRevision();
        },
        renderMobileTopBanner() {
            storeRef.bumpGraphUiRevision();
        },
        pickUniqueChildName,
        startMovePickOnTree(nodeId) {
            return startMovePickOnTreeImpl.call(ctx, nodeId);
        },
        openMoveNodePicker() {
            return openMoveNodePickerImpl.call(ctx);
        },
        handleDockAction(action, opts) {
            return handleDockActionImpl.call(ctx, action, opts);
        },
        renameNodeFromConstruction(node, name) {
            return renameNodeFromConstruction(node, name);
        },
        openUnifiedCurriculumSwitcher() {
            storeRef.openUnifiedCurriculumSwitcher(rootEl);
        },
        _curriculumSwitcherClose: null,
        _localSnapItems: undefined,
        _localSnapLoading: false,
        _versionSwitcherQuery: '',
        _treeSwitcherQuery: '',
        _treeSwitcherSearchDebounce: null,
        afterVersionSwitchCloseMenu() {
            storeRef.closeUnifiedCurriculumSwitcher();
        },
        refreshCurriculumChrome() {
            storeRef.bumpGraphUiRevision();
        },
    };
    return ctx;
}

/** @param {string} childId */
export function navigateIntoChildAction(childId) {
    const store = shell();
    if (!store) return undefined;
    const path = graphUiOf(store).mobilePath || [];
    const next = [...path.map(String), String(childId)];
    store.navigateMobilePath(next);
    store.bumpGraphUiRevision();
    schedulePersistTreeUiState(store);
}

export function navigatePanelBackAction() {
    const store = shell();
    if (!store) return undefined;
    const path = graphUiOf(store).mobilePath || [];
    if (path.length <= 1) return;
    store.navigateMobilePath(path.slice(0, -1));
    store.bumpGraphUiRevision();
}

/** @param {string|null} rootEl pass graph panel root for curriculum events */
export function getGraphActionContextAction(rootEl = null) {
    const store = shell();
    if (!store) return undefined;
    return createActionContext(store, rootEl);
}

export function openMoveNodePickerAction(rootEl = null) {
    const store = shell();
    if (!store) return undefined;
    return openMoveNodePickerImpl.call(createActionContext(store, rootEl));
}

export function startMovePickOnTreeAction(nodeId, rootEl = null) {
    const store = shell();
    if (!store) return undefined;
    return startMovePickOnTreeImpl.call(createActionContext(store, rootEl), nodeId);
}

/** @param {'delete'|'new-file'|'new-folder'|'new-exam'} action */
export function handleGraphDockActionAction(action, opts = {}, rootEl = null) {
    const store = shell();
    if (!store) return undefined;
    return handleDockActionImpl.call(createActionContext(store, rootEl), action, opts);
}

export function runGraphNodeActionAction(node, act, rootEl = null) {
    const store = shell();
    if (!store) return undefined;
    return runMobileNodeActionImpl.call(createActionContext(store, rootEl), node, act);
}

export function setGraphMoveModeAction(on) {
    const store = shell();
    if (!store) return undefined;
    store.patchGraphUi({ isMoveMode: !!on });
}

export function setInlineRenameNodeIdAction(id) {
    const store = shell();
    if (!store) return undefined;
    const g = graphUiOf(store);
    store.patchGraphUi({
        inlineRenameNodeId: id != null ? String(id) : null,
        revision: (g.revision || 0) + 1,
    });
}

/** @param {object | null} overlay */
export function setConstructionOverlayAction(overlay) {
    const store = shell();
    if (!store) return undefined;
    store.patchGraphUi({ constructionOverlay: overlay });
}

/** @param {HTMLElement | null} rootEl */
export function openUnifiedCurriculumSwitcherAction(rootEl = null) {
    const store = shell();
    if (!store) return undefined;
    const g = graphUiOf(store);
    store.patchGraphUi({
        versionMenuOpen: false,
        treeSwitcherOpen: true,
        suppressCurriculumDocCloseUntil: Date.now() + 450,
        curriculumChromeBindKey: null,
        revision: (g.revision || 0) + 1,
    });
    store.bumpGraphUiRevision();

    const ctx = createActionContext(store, rootEl);
    void _ensureSnapshotsAdminLoaded(ctx);
    const vpNow = getVersionPresentation(store.state.activeSource, store.state.availableReleases || [], store.ui);
    if (vpNow.isLocal) {
        void _ensureLocalSnapshotsLoaded(ctx);
    } else if (vpNow.isComposed) {
        void import('../features/backup-export/api/filesystem.js').then(({ fileSystem }) => {
            if (fileSystem.isLocalComposedTree() && fileSystem.activeComposedBranchId()) {
                void _ensureLocalSnapshotsLoaded(ctx);
            }
        });
    }
}

export function closeUnifiedCurriculumSwitcherAction() {
    const store = shell();
    if (!store) return undefined;
    const g = graphUiOf(store);
    store.patchGraphUi({
        treeSwitcherOpen: false,
        curriculumSwitcherTreesOnly: false,
        curriculumSwitcherVersionsOnly: false,
        curriculumSwitcherTab: 'tree',
        curriculumChromeBindKey: null,
        revision: (g.revision || 0) + 1,
    });
    store.bumpGraphUiRevision();
}

export function toggleUnifiedCurriculumSwitcherAction(rootEl = null) {
    const store = shell();
    if (!store) return undefined;
    if (store.state.treeHydrating) return;
    if (graphUiOf(store).treeSwitcherOpen) {
        store.closeUnifiedCurriculumSwitcher();
        return;
    }
    if (store.state.constructionMode) {
        store.patchGraphUi({
            curriculumSwitcherTreesOnly: false,
            curriculumSwitcherVersionsOnly: false,
        });
    }
    store.openUnifiedCurriculumSwitcher(rootEl);
}

export function openCurriculumSwitcherVersionsAction(rootEl = null) {
    const store = shell();
    if (!store) return undefined;
    store.patchGraphUi({
        curriculumSwitcherTreesOnly: false,
        curriculumSwitcherVersionsOnly: true,
        curriculumSwitcherTab: 'version',
        treeSwitcherOpen: true,
    });
    store.openUnifiedCurriculumSwitcher(rootEl);
}

export function setTreePaintPendingAction(pending) {
    const store = shell();
    if (!store) return undefined;
    store.patchGraphUi({ treePaintPending: !!pending });
}

export function applyGraphConstructionNodeIconAction(node, icon) {
    return applyConstructionNodeIcon(node, icon);
}

export function renameGraphNodeFromConstructionAction(node, name) {
    return renameNodeFromConstruction(node, name);
}

/** Store.prototype — explicit actions (no bindStoreContext). */
export const storeGraphActionsMethods = {
    navigateIntoChild: navigateIntoChildAction,
    navigatePanelBack: navigatePanelBackAction,
    getGraphActionContext: getGraphActionContextAction,
    openMoveNodePicker: openMoveNodePickerAction,
    startMovePickOnTree: startMovePickOnTreeAction,
    handleGraphDockAction: handleGraphDockActionAction,
    runGraphNodeAction: runGraphNodeActionAction,
    setGraphMoveMode: setGraphMoveModeAction,
    setInlineRenameNodeId: setInlineRenameNodeIdAction,
    setConstructionOverlay: setConstructionOverlayAction,
    openUnifiedCurriculumSwitcher: openUnifiedCurriculumSwitcherAction,
    closeUnifiedCurriculumSwitcher: closeUnifiedCurriculumSwitcherAction,
    toggleUnifiedCurriculumSwitcher: toggleUnifiedCurriculumSwitcherAction,
    openCurriculumSwitcherVersions: openCurriculumSwitcherVersionsAction,
    setTreePaintPending: setTreePaintPendingAction,
    applyGraphConstructionNodeIcon: applyGraphConstructionNodeIconAction,
    renameGraphNodeFromConstruction: renameGraphNodeFromConstructionAction,
};
