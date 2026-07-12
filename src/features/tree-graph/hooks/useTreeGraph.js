import { useCallback, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
    useHookUi,
    useShellModalActions,
    useShellModalLang,
} from '../../../app/hooks/useHookShell.js';
import { getArboritoStore as store } from '../../../core/store-singleton.js';
import { useTreeGraphSlice, treeGraphActions } from '../../../stores/tree-graph-store.js';
import { useSourcesSlice } from '../../../stores/sources-store.js';
import { getUserStoreAction } from '../../../stores/identity-store-actions.js';
import { shellUiActions } from '../../../stores/shell-ui-store-actions.js';
import { isTreeForumEnabled } from '../../../shared/lib/tree-forum-enabled.js';
import {
    exploreShowsCurriculumChip as exploreShowsCurriculumChipPure,
    resolveBranchPanelIcon,
    resolvePanelTreeIcon as resolvePanelTreeIconPure,
} from '../api/logic/graph-mobile-panel-helpers.js';

/**
 * Árbol, grafo, curriculum, construcción.
 * Único punto de entrada para .jsx de tree-graph (no importar core/store.js).
 */
export function useTreeGraph() {
    const ui = useHookUi();
    const { modal, viewMode } = useShellModalLang();
    const { dismissModal, setModal, notify, update } = useShellModalActions();
    const { activeSource, communitySources, availableReleases } = useSourcesSlice(
        useShallow((s) => ({
            activeSource: s.activeSource,
            communitySources: s.communitySources,
            availableReleases: s.availableReleases,
        }))
    );
    const slice = useTreeGraphSlice((s) => s);
    const {
        data,
        rawGraphData,
        graphUi,
        constructionMode,
        constructionEditFocus,
        constructionLockedBranchRefId,
        curriculumEditLang,
        treeHydrating,
        treeGrowingOverlay,
        nostrLiveSeeds,
        webtorrentSeeder,
    } = slice;

    const forumNavEnabled = isTreeForumEnabled(rawGraphData?.meta, activeSource);

    const findNode = useCallback((id) => treeGraphActions.findNode(id), []);
    const navigateTo = useCallback((id, data) => treeGraphActions.navigateTo(id, data), []);
    const toggleNode = useCallback((id) => treeGraphActions.toggleNode(id), []);
    const loadData = useCallback((source) => treeGraphActions.loadData(source), []);
    const confirm = useCallback((...a) => shellUiActions.confirm(...a), []);
    const acknowledge = useCallback((opts) => shellUiActions.acknowledge(opts), []);
    const alert = useCallback((...a) => shellUiActions.alert(...a), []);
    const updateGraphUi = useCallback((patch) => treeGraphActions.updateGraphUi(patch), []);
    const patchGraphUi = useCallback((patch) => treeGraphActions.patchGraphUi(patch), []);
    const bumpGraphUiRevision = useCallback(() => treeGraphActions.bumpGraphUiRevision(), []);
    const toggleConstructionMode = useCallback(() => treeGraphActions.toggleConstructionMode(), []);
    const loadComposedTree = useCallback((id) => treeGraphActions.loadComposedTree(id), []);
    const getGraphActionContext = useCallback((root) => treeGraphActions.getGraphActionContext(root), []);
    const closeUnifiedCurriculumSwitcher = useCallback(
        () => treeGraphActions.closeUnifiedCurriculumSwitcher(),
        []
    );
    const selectMobileNode = useCallback((id) => treeGraphActions.selectMobileNode(id), []);
    const setGraphMoveMode = useCallback((on) => treeGraphActions.setGraphMoveMode(on), []);
    const handleGraphDockAction = useCallback((...a) => treeGraphActions.handleGraphDockAction(...a), []);
    const applyGraphConstructionNodeIcon = useCallback(
        (...a) => treeGraphActions.applyGraphConstructionNodeIcon(...a),
        []
    );
    const addInstalledBranchToActiveComposedTree = useCallback(
        (id) => treeGraphActions.addInstalledBranchToActiveComposedTree(id),
        []
    );
    const addBranchToActiveComposedTree = useCallback((id) => treeGraphActions.addBranchToActiveComposedTree(id), []);
    const renameGraphNodeFromConstruction = useCallback(
        (...a) => treeGraphActions.renameGraphNodeFromConstruction(...a),
        []
    );
    const setPendingMoveNodeId = useCallback((id) => treeGraphActions.setPendingMoveNodeId(id), []);
    const isCompleted = useCallback((id) => treeGraphActions.isCompleted(id), []);
    const openNodeFromMobileTree = useCallback((id) => treeGraphActions.openNodeFromMobileTree(id), []);
    const loadNodeChildren = useCallback((node) => treeGraphActions.loadNodeChildren(node), []);
    const navigateIntoChild = useCallback((id) => treeGraphActions.navigateIntoChild(id), []);
    const runGraphNodeAction = useCallback((...a) => treeGraphActions.runGraphNodeAction(...a), []);
    const navigateMobilePath = useCallback((path) => treeGraphActions.navigateMobilePath(path), []);
    const repairTreeViewFromRaw = useCallback(() => treeGraphActions.repairTreeViewFromRaw(), []);
    const getPublicationMetadataLimits = useCallback(() => treeGraphActions.getPublicationMetadataLimits(), []);
    const showDialog = useCallback((...a) => shellUiActions.showDialog(...a), []);
    const startMovePickOnTree = useCallback((id) => treeGraphActions.startMovePickOnTree(id), []);
    const moveNode = useCallback((...a) => treeGraphActions.moveNode(...a), []);
    const closePreview = useCallback(() => treeGraphActions.closePreview(), []);
    const enterLesson = useCallback(() => treeGraphActions.enterLesson(), []);
    const getActivePublicTreeRef = useCallback(() => treeGraphActions.getActivePublicTreeRef(), []);
    const setNostrRelayUrls = useCallback((urls) => treeGraphActions.setNostrRelayUrls(urls), []);
    const stopWebTorrentSeeder = useCallback(() => treeGraphActions.stopWebTorrentSeeder(), []);
    const startWebTorrentSeeder = useCallback(() => treeGraphActions.startWebTorrentSeeder(), []);
    const getNodeMetaTargetPath = useCallback((node, lang) => treeGraphActions.getNodeMetaTargetPath(node, lang), []);

    const chipState = useMemo(
        () => ({
            constructionMode,
            viewMode,
            activeSource,
        }),
        [constructionMode, viewMode, activeSource]
    );

    const exploreShowsCurriculumChip = useCallback(
        (current) => exploreShowsCurriculumChipPure(chipState, current),
        [chipState]
    );
    const resolvePanelTreeIcon = useCallback(() => resolvePanelTreeIconPure(data), [data]);

    const openExploreCurriculumSwitcher = useCallback(
        (...a) => treeGraphActions.openExploreCurriculumSwitcher(...a),
        []
    );
    const openBranchVersionSwitcher = useCallback(
        (...a) => treeGraphActions.openBranchVersionSwitcher(...a),
        []
    );
    const openTreeLibraryFromPanel = useCallback(
        (...a) => treeGraphActions.openTreeLibraryFromPanel(...a),
        []
    );
    const navigatePanelBack = useCallback((...a) => treeGraphActions.navigatePanelBack(...a), []);
    const toggleCurriculumSwitcherFromChip = useCallback(
        (...a) => treeGraphActions.toggleCurriculumSwitcherFromChip(...a),
        []
    );
    const openConstructionEmojiPicker = useCallback(
        (...a) => treeGraphActions.openConstructionEmojiPicker(...a),
        []
    );
    const shouldShowMoveHereInPanel = useCallback(
        (...a) => treeGraphActions.shouldShowMoveHereInPanel(...a),
        []
    );
    const runMoveHereInPanel = useCallback((...a) => treeGraphActions.runMoveHereInPanel(...a), []);
    const startConstructionRename = useCallback(
        (...a) => treeGraphActions.startConstructionRename(...a),
        []
    );
    const startPanelTitleRename = useCallback((...a) => treeGraphActions.startPanelTitleRename(...a), []);
    const wireInlineRenameInput = useCallback((...a) => treeGraphActions.wireInlineRenameInput(...a), []);

    return {
        ui,
        modal,
        viewMode,
        activeSource,
        communitySources,
        availableReleases,
        userStore: getUserStoreAction(),
        data,
        rawGraphData,
        graphUi,
        constructionMode,
        constructionEditFocus,
        constructionLockedBranchRefId,
        curriculumEditLang,
        treeHydrating,
        treeGrowingOverlay,
        nostrLiveSeeds,
        webtorrentSeeder,
        forumNavEnabled,
        findNode,
        navigateTo,
        toggleNode,
        loadData,
        confirm,
        acknowledge,
        alert,
        updateGraphUi,
        patchGraphUi,
        bumpGraphUiRevision,
        toggleConstructionMode,
        loadComposedTree,
        getGraphActionContext,
        closeUnifiedCurriculumSwitcher,
        selectMobileNode,
        setGraphMoveMode,
        handleGraphDockAction,
        applyGraphConstructionNodeIcon,
        addInstalledBranchToActiveComposedTree,
        addBranchToActiveComposedTree,
        renameGraphNodeFromConstruction,
        setPendingMoveNodeId,
        isCompleted,
        openNodeFromMobileTree,
        loadNodeChildren,
        navigateIntoChild,
        runGraphNodeAction,
        navigateMobilePath,
        repairTreeViewFromRaw,
        getPublicationMetadataLimits,
        showDialog,
        startMovePickOnTree,
        moveNode,
        closePreview,
        enterLesson,
        getActivePublicTreeRef,
        setNostrRelayUrls,
        stopWebTorrentSeeder,
        startWebTorrentSeeder,
        getNodeMetaTargetPath,
        exploreShowsCurriculumChip,
        resolvePanelTreeIcon,
        resolveBranchPanelIcon,
        openExploreCurriculumSwitcher,
        openBranchVersionSwitcher,
        openTreeLibraryFromPanel,
        navigatePanelBack,
        toggleCurriculumSwitcherFromChip,
        openConstructionEmojiPicker,
        shouldShowMoveHereInPanel,
        runMoveHereInPanel,
        startConstructionRename,
        startPanelTitleRename,
        wireInlineRenameInput,
        dismissModal,
        setModal,
        notify,
        update,
    };
}

/** Suscripción al singleton, solo en hooks internos, no en components. */
export function useTreeGraphStore() {
    return store;
}
