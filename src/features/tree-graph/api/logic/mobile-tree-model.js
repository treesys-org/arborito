import { getArboritoStore as store } from '../../../../core/store-singleton.js';
import { fileSystem } from '../../../backup-export/api/filesystem.js';
import { curriculumTreeDisplayName } from '../../../version-updates/api/version-switch-logic.js';
import { TreeUtils } from '../tree-utils.js';
import { computeMobilePathNodes } from './mobile-path-nodes.js';

export { computeMobilePathNodes } from './mobile-path-nodes.js';

/** Cleared after path / selection / completed-set changes so the next render rebuilds. */
export function invalidateMobilePrototypeKeys() {
    store.bumpGraphUiRevision();
}

/** @param {object} graphLike — mobilePath + graphUi fields used by buildTrunkSig */
export function buildTrunkSig(graphLike, root, current, pathNodes, harvested, completedSet) {
    const mobilePath = Array.isArray(graphLike.mobilePath) ? graphLike.mobilePath : [];
    return [
        mobilePath.join('>'),
        store.value.lang || '',
        store.value.curriculumEditLang || '',
        store.value.activeSource?.id || '',
        store.value.activeSource?.url || '',
        root?.id != null ? String(root.id) : '',
        store.value.viewMode || '',
        store.value.theme || '',
        completedSet ? completedSet.size : 0,
        harvested.length,
        store.value.nostrLiveSeeds == null ? '' : String(store.value.nostrLiveSeeds),
        typeof document !== 'undefined' && document.documentElement.classList.contains('arborito-desktop')
            ? 'd'
            : 'm',
        curriculumTreeDisplayName(store.ui).slice(0, 240),
        graphLike._versionMenuOpen ? 'v1' : 'v0',
        graphLike._inlineRenameNodeId != null ? String(graphLike._inlineRenameNodeId) : '',
        store.value.constructionMode ? 'c1' : 'c0',
        graphLike.selectedNodeId != null ? String(graphLike.selectedNodeId) : '',
        fileSystem.features.canWrite ? 'w1' : 'w0',
        graphLike.pendingMoveNodeId != null ? String(graphLike.pendingMoveNodeId) : '',
        pathNodes.map((n) => `${n.id}:${(n.name || '').slice(0, 240)}`).join('\u001e'),
    ].join('|');
}

export function buildChildrenSig(current) {
    const kids = Array.isArray(current.children) ? current.children : [];
    return kids
        .map(
            (c) =>
                `${c.id}:${(c.name || '').slice(0, 240)}:${c.type || ''}:${
                    c.hasUnloadedChildren ? 1 : 0
                }:${Array.isArray(c.children) ? c.children.length : 0}:${c.icon || ''}`
        )
        .join('\u001e');
}

function graphLikeFromGraphUi(graphUi) {
    return {
        mobilePath: graphUi.mobilePath,
        _versionMenuOpen: graphUi.versionMenuOpen,
        _inlineRenameNodeId: graphUi.inlineRenameNodeId,
        selectedNodeId: graphUi.selectedNodeId,
        pendingMoveNodeId: graphUi.pendingMoveNodeId,
    };
}

function shouldZeroConstructionRootTrunkScroll(graphUi) {
    if (!graphUi?.syncConstructionRootTrunkScroll) return false;
    if (!store.value.constructionMode || !fileSystem.features.canWrite) return false;
    if (typeof document === 'undefined') return false;
    const docRoot = document.documentElement;
    if (
        !docRoot.classList.contains('arborito-construction-mobile') ||
        docRoot.classList.contains('arborito-desktop')
    ) {
        return false;
    }
    const p = graphUi.mobilePath;
    return Array.isArray(p) && p.length <= 1;
}

/**
 * Pure mobile tree model for React — no store mutations during render.
 * @returns {null | { model: object, scroll: object, effects: object }}
 */
export function planMobileTreeModelFromState(graphUi, root) {
    if (!root || !graphUi) return null;

    const growthSrc = String(store.value.activeSource?.id || '');
    const growthSourceChanged = graphUi.growthPulseSourceId !== growthSrc;
    const prevPathDepthForGrowth =
        typeof graphUi.prevMobilePathDepth === 'number' ? graphUi.prevMobilePathDepth : null;

    const findNode = (tid) => store.findNode(tid);
    const { pathNodes, current, normalizedPath, pendingDeeperPathLoad } = computeMobilePathNodes(
        graphUi.mobilePath,
        root,
        findNode
    );
    if (!pathNodes.length) return null;

    const harvested = (store.value.gamification && store.value.gamification.seeds) || [];
    const completedSet = store.value.completedNodes;

    const graphLike = {
        ...graphLikeFromGraphUi(graphUi),
        mobilePath: normalizedPath,
    };
    const trunkSig = buildTrunkSig(graphLike, root, current, pathNodes, harvested, completedSet);
    const childrenSig = buildChildrenSig(current);

    const trunkPathGrew = prevPathDepthForGrowth != null && pathNodes.length > prevPathDepthForGrowth;
    const tailNodeForGrowth = pathNodes[pathNodes.length - 1];
    const branchChildCount = (tailNodeForGrowth?.children || []).length;
    const branchChildrenGrew =
        !!store.value.constructionMode &&
        fileSystem.features.canWrite &&
        !growthSourceChanged &&
        typeof graphUi.lastMobileBranchChildCount === 'number' &&
        branchChildCount > graphUi.lastMobileBranchChildCount &&
        prevPathDepthForGrowth != null &&
        pathNodes.length === prevPathDepthForGrowth;
    const shouldPulseGrowthKnot = trunkPathGrew || branchChildrenGrew;

    const pathBeforeRebuild = JSON.stringify(normalizedPath);
    const pathChangedForScroll =
        graphUi.prevMobileScrollPath != null && graphUi.prevMobileScrollPath !== pathBeforeRebuild;
    const firstPathPaint = graphUi.prevMobileScrollPath == null;
    const zeroConstructionScroll = shouldZeroConstructionRootTrunkScroll(graphUi);
    const syncScroll = pathChangedForScroll || firstPathPaint || zeroConstructionScroll;

    const activeIndex = pathNodes.length - 1;
    const pulseKnotIndex = shouldPulseGrowthKnot ? activeIndex : -1;

    const graphUiPatches = {};
    if (growthSourceChanged) {
        graphUiPatches.growthPulseSourceId = growthSrc;
        graphUiPatches.lastMobileBranchChildCount = undefined;
    }
    if (graphUi.lastTrunkSig !== trunkSig) graphUiPatches.lastTrunkSig = trunkSig;
    if (graphUi.lastChildrenSig !== childrenSig) graphUiPatches.lastChildrenSig = childrenSig;
    if (graphUi.prevMobilePathDepth !== pathNodes.length) {
        graphUiPatches.prevMobilePathDepth = pathNodes.length;
    }
    if (graphUi.lastMobileBranchChildCount !== branchChildCount) {
        graphUiPatches.lastMobileBranchChildCount = branchChildCount;
    }
    if (graphUi.prevMobileScrollPath !== pathBeforeRebuild) {
        graphUiPatches.prevMobileScrollPath = pathBeforeRebuild;
    }
    if (zeroConstructionScroll && graphUi.syncConstructionRootTrunkScroll) {
        graphUiPatches.syncConstructionRootTrunkScroll = false;
    }

    return {
        model: {
            pathNodes,
            current,
            harvested,
            activeIndex,
            pulseKnotIndex,
        },
        scroll: { syncScroll, preserveTrunkScroll: syncScroll ? null : undefined, pathNodes },
        effects: {
            normalizedPath,
            pendingDeeperPathLoad,
            deeperLoadNode: pendingDeeperPathLoad ? current : null,
            graphUiPatches,
        },
    };
}

