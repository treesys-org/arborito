/** Default mobile graph UI state shape (no store import). */
export function createDefaultGraphUi() {
    return {
        mobilePath: [],
        selectedNodeId: null,
        pendingMoveNodeId: null,
        isMoveMode: false,
        inlineRenameNodeId: null,
        versionMenuOpen: false,
        treeSwitcherOpen: false,
        treeSwitcherKindFilter: 'all',
        curriculumSwitcherTreesOnly: false,
        curriculumSwitcherVersionsOnly: false,
        curriculumSwitcherTab: 'tree',
        syncConstructionRootTrunkScroll: false,
        lastMobileBranchChildCount: undefined,
        prevMobilePathDepth: undefined,
        prevMobileScrollPath: null,
        growthPulseSourceId: '',
        lastTrunkSig: '',
        lastChildrenSig: '',
        lastRootContentHeight: 0,
        revision: 0,
        /** @type {null | { type: string, nodeId?: string, rect?: object, [key: string]: unknown }} */
        constructionOverlay: null,
        curriculumCreateBusy: false,
        treePaintPending: false,
        suppressCurriculumDocCloseUntil: 0,
        curriculumChromeBindKey: null,
    };
}
