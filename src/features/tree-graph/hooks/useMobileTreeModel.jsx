import { useEffect, useMemo, useRef } from 'react';
import { useTreeGraphStore } from './useTreeGraph.js';
import { useArboritoGraphUiState } from '../../../app/hooks/useArboritoStore.js';
import { useShellUiSlice } from '../../../stores/shell-ui-store.js';
import { useSourcesSlice } from '../../../stores/sources-store.js';
import { enforceConstructionPathLock } from '../../editor/api/construction-enter-flow.js';
import { createDefaultGraphUi } from '../api/graph-ui-state.js';
import { planMobileTreeModelFromState } from '../api/logic/mobile-tree-model.js';

function pathsEqual(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (String(a[i]) !== String(b[i])) return false;
    }
    return true;
}

/**
 * Derive mobile tree render model from store.graphUi (pure plan + effects in useEffect).
 */
export function useMobileTreeModel() {
    const store = useTreeGraphStore();
    const state = useArboritoGraphUiState();
    const viewMode = useShellUiSlice((s) => s.viewMode);
    const theme = useShellUiSlice((s) => s.theme);
    const activeSource = useSourcesSlice((s) => s.activeSource);
    const graphUi = state.graphUi ?? createDefaultGraphUi();
    const root = state.data;
    const warnedRef = useRef('');

    const plan = useMemo(() => {
        if (!root || !graphUi) return { model: null, scroll: null, effects: null };
        const next = planMobileTreeModelFromState(graphUi, root);
        if (!next) return { model: null, scroll: null, effects: null };
        return next;
    }, [
        root,
        root?.id,
        graphUi?.revision,
        graphUi?.mobilePath?.join('>'),
        graphUi?.selectedNodeId,
        graphUi?.pendingMoveNodeId,
        graphUi?.versionMenuOpen,
        graphUi?.inlineRenameNodeId,
        graphUi?.prevMobilePathDepth,
        graphUi?.prevMobileScrollPath,
        graphUi?.syncConstructionRootTrunkScroll,
        graphUi?.growthPulseSourceId,
        graphUi?.lastMobileBranchChildCount,
        state.curriculumEditLang,
        activeSource?.id,
        activeSource?.url,
        viewMode,
        theme,
        state.constructionMode,
        state.nostrLiveSeeds,
    ]);

    useEffect(() => {
        if (!root || !state.constructionMode) return;
        enforceConstructionPathLock();
    }, [root?.id, state.constructionMode, graphUi?.mobilePath?.join('>')]);

    useEffect(() => {
        const effects = plan.effects;
        if (!effects || !root) return;

        const { normalizedPath, pendingDeeperPathLoad, deeperLoadNode, graphUiPatches } = effects;
        const currentPath = graphUi?.mobilePath;

        if (
            Array.isArray(normalizedPath) &&
            normalizedPath.length > 0 &&
            !pathsEqual(currentPath, normalizedPath)
        ) {
            store.patchGraphUi({ mobilePath: normalizedPath });
        }

        if (pendingDeeperPathLoad && deeperLoadNode) {
            store
                .loadNodeChildren(deeperLoadNode)
                .then(() => {
                    store.bumpGraphUiRevision();
                })
                .catch(() => {
                    /* ignore */
                });
        }

        if (graphUiPatches && Object.keys(graphUiPatches).length > 0) {
            store.patchGraphUi(graphUiPatches);
        }
    }, [plan, root?.id, graphUi?.mobilePath?.join('>')]);

    useEffect(() => {
        if (!root?.id) return;
        const key = String(root.id);
        if (plan.model?.pathNodes?.length) {
            warnedRef.current = '';
            return;
        }
        if (warnedRef.current === key) return;
        warnedRef.current = key;
        console.warn('[Arborito] mobile tree model empty despite loaded data', {
            rootId: root.id,
            mobilePath: graphUi?.mobilePath,
        });
    }, [root?.id, plan.model?.pathNodes?.length, graphUi?.mobilePath?.join('>')]);

    return { model: plan.model, scroll: plan.scroll };
}
