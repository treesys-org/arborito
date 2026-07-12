import { createArboritoStore } from './create-store.js';
import { useStore } from 'zustand';
import { getArboritoStore as store } from '../core/store-singleton.js';
import { closePreviewAction, enterLessonAction } from './learning-store-actions.js';
import { setNostrRelayUrlsAction } from './nostr-store-actions.js';
import { patchStoreSlice } from './sync-shallow.js';
import {
    bumpGraphUiRevisionAction,
    findNodeAction,
    loadDataAction,
    navigateMobilePathAction,
    navigatePanelBackAction,
    navigateToAction,
    notifyCurriculumSwitcherUpdateAction,
    openBranchVersionSwitcherAction,
    openConstructionEmojiPickerAction,
    openExploreCurriculumSwitcherAction,
    openTreeLibraryFromPanelAction,
    patchGraphUiAction,
    repairTreeViewFromRawAction,
    runMoveHereInPanelAction,
    selectMobileNodeAction,
    setPendingMoveNodeIdAction,
    shouldShowMoveHereInPanelAction,
    startConstructionRenameAction,
    startPanelTitleRenameAction,
    toggleConstructionModeAction,
    toggleCurriculumSwitcherFromChipAction,
    toggleNodeAction,
    wireInlineRenameInputAction,
} from './tree-graph-store-actions.js';

const DEFAULT_WEBTORRENT_SEEDER = { running: false, total: 0, done: 0, peers: 0 };

/**
 * Piloto Zustand, slice de árbol / grafo / construcción.
 * Se sincroniza desde el snapshot global en syncReactSnapshot().
 */
export const treeGraphStore = createArboritoStore(() => ({
    data: null,
    rawGraphData: null,
    graphUi: null,
    constructionMode: false,
    constructionEditFocus: null,
    constructionLockedBranchRefId: null,
    curriculumEditLang: null,
    treeHydrating: false,
    treeGrowingOverlay: false,
    treeContext: null,
    nostrLiveSeeds: null,
    webtorrentSeeder: { running: false, total: 0, done: 0, peers: 0 },
}));

/** @param {Record<string, unknown>} snap, reactStateStore snapshot */
export function syncTreeGraphStoreFromSnapshot(snap) {
    if (!snap || typeof snap !== 'object') return;
    patchStoreSlice(treeGraphStore, {
        data: snap.data ?? null,
        rawGraphData: snap.rawGraphData ?? null,
        graphUi: snap.graphUi ?? null,
        constructionMode: !!snap.constructionMode,
        constructionEditFocus: snap.constructionEditFocus ?? null,
        constructionLockedBranchRefId: snap.constructionLockedBranchRefId ?? null,
        curriculumEditLang: snap.curriculumEditLang ?? null,
        treeHydrating: !!snap.treeHydrating,
        treeGrowingOverlay: !!snap.treeGrowingOverlay,
        treeContext: snap.treeContext ?? null,
        nostrLiveSeeds: snap.nostrLiveSeeds ?? null,
        webtorrentSeeder:
            snap.webtorrentSeeder && typeof snap.webtorrentSeeder === 'object'
                ? snap.webtorrentSeeder
                : DEFAULT_WEBTORRENT_SEEDER,
    });
}

export function useTreeGraphSlice(selector) {
    return useStore(treeGraphStore, selector);
}

/** Actualización síncrona del slice (p. ej. graphUi entre microtasks del singleton). */
export function patchTreeGraphSlice(partial) {
    if (!partial || typeof partial !== 'object') return;
    patchStoreSlice(treeGraphStore, partial);
}

export {
    bumpGraphUiRevisionAction,
    commitTreeGraphState,
    findNodeAction,
    loadDataAction,
    navigateMobilePathAction,
    navigatePanelBackAction,
    navigateToAction,
    notifyCurriculumSwitcherUpdateAction,
    openBranchVersionSwitcherAction,
    openConstructionEmojiPickerAction,
    openExploreCurriculumSwitcherAction,
    openTreeLibraryFromPanelAction,
    patchGraphUiAction,
    repairTreeViewFromRawAction,
    runMoveHereInPanelAction,
    selectMobileNodeAction,
    setPendingMoveNodeIdAction,
    shouldShowMoveHereInPanelAction,
    startConstructionRenameAction,
    startPanelTitleRenameAction,
    toggleConstructionModeAction,
    toggleCurriculumSwitcherFromChipAction,
    toggleNodeAction,
    wireInlineRenameInputAction,
} from './tree-graph-store-actions.js';

/** Acciones grafo, dominio en `tree-graph-store-actions.js`; resto delega al singleton. */
export const treeGraphActions = {
    findNode: findNodeAction,
    navigateTo: navigateToAction,
    toggleNode: toggleNodeAction,
    loadData: loadDataAction,
    updateGraphUi: patchGraphUiAction,
    patchGraphUi: patchGraphUiAction,
    bumpGraphUiRevision: bumpGraphUiRevisionAction,
    toggleConstructionMode: toggleConstructionModeAction,
    loadComposedTree: (id) => store.loadComposedTree?.(id),
    getGraphActionContext: (root) => store.getGraphActionContext?.(root),
    closeUnifiedCurriculumSwitcher: () => store.closeUnifiedCurriculumSwitcher?.(),
    selectMobileNode: selectMobileNodeAction,
    setGraphMoveMode: (on) => store.setGraphMoveMode?.(on),
    handleGraphDockAction: (...a) => store.handleGraphDockAction?.(...a),
    applyGraphConstructionNodeIcon: (...a) => store.applyGraphConstructionNodeIcon?.(...a),
    addInstalledBranchToActiveComposedTree: (id) => store.addInstalledBranchToActiveComposedTree?.(id),
    addBranchToActiveComposedTree: (id) => store.addBranchToActiveComposedTree?.(id),
    renameGraphNodeFromConstruction: (...a) => store.renameGraphNodeFromConstruction?.(...a),
    setPendingMoveNodeId: setPendingMoveNodeIdAction,
    isCompleted: (id) => store.isCompleted?.(id),
    openNodeFromMobileTree: (id) => store.openNodeFromMobileTree?.(id),
    loadNodeChildren: (node) => store.loadNodeChildren?.(node),
    navigateIntoChild: (id) => store.navigateIntoChild?.(id),
    runGraphNodeAction: (...a) => store.runGraphNodeAction?.(...a),
    navigateMobilePath: navigateMobilePathAction,
    repairTreeViewFromRaw: repairTreeViewFromRawAction,
    getPublicationMetadataLimits: () => store.getPublicationMetadataLimits?.(),
    showDialog: (...a) => store.showDialog?.(...a),
    startMovePickOnTree: (id) => store.startMovePickOnTree?.(id),
    moveNode: (...a) => store.moveNode?.(...a),
    closePreview: closePreviewAction,
    enterLesson: enterLessonAction,
    getActivePublicTreeRef: () => store.getActivePublicTreeRef?.(),
    setNostrRelayUrls: setNostrRelayUrlsAction,
    stopWebTorrentSeeder: () => store.stopWebTorrentSeeder?.(),
    startWebTorrentSeeder: () => store.startWebTorrentSeeder?.(),
    getNodeMetaTargetPath: (node, lang) => store.getNodeMetaTargetPath?.(node, lang),
    openExploreCurriculumSwitcher: openExploreCurriculumSwitcherAction,
    openBranchVersionSwitcher: openBranchVersionSwitcherAction,
    openTreeLibraryFromPanel: openTreeLibraryFromPanelAction,
    navigatePanelBack: navigatePanelBackAction,
    toggleCurriculumSwitcherFromChip: toggleCurriculumSwitcherFromChipAction,
    notifyCurriculumSwitcherUpdate: notifyCurriculumSwitcherUpdateAction,
    openConstructionEmojiPicker: openConstructionEmojiPickerAction,
    shouldShowMoveHereInPanel: shouldShowMoveHereInPanelAction,
    runMoveHereInPanel: runMoveHereInPanelAction,
    startConstructionRename: startConstructionRenameAction,
    startPanelTitleRename: startPanelTitleRenameAction,
    wireInlineRenameInput: wireInlineRenameInputAction,
};
