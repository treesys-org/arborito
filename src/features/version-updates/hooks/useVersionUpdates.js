import { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useHookUi, useShellModalActions } from '../../../app/hooks/useHookShell.js';
import { getArboritoStore as store } from '../../../core/store-singleton.js';
import { useSourcesSlice } from '../../../stores/sources-store.js';
import { useTreeGraphSlice, treeGraphActions } from '../../../stores/tree-graph-store.js';
import { shellUiActions } from '../../../stores/shell-ui-store-actions.js';
import { getUserStoreAction } from '../../../stores/identity-store-actions.js';
import { isArboritoDemoTree } from '../../publishing/api/demo-tree-guard.js';

/** Versiones / snapshots / timeline. */
export function useVersionUpdates() {
    const ui = useHookUi();
    const { notify, dismissModal, setModal } = useShellModalActions();
    const { availableReleases, activeSource } = useSourcesSlice(
        useShallow((s) => ({
            availableReleases: s.availableReleases,
            activeSource: s.activeSource,
        }))
    );
    const constructionMode = useTreeGraphSlice((s) => s.constructionMode);
    const rawGraphData = useTreeGraphSlice((s) => s.rawGraphData);
    const isDemoTree = isArboritoDemoTree({ state: { rawGraphData, activeSource } });

    const loadData = useCallback((source, forceRefresh = true) => store.loadData(source, forceRefresh), []);
    const alert = useCallback((...args) => shellUiActions.alert(...args), []);
    const materializeNetworkReleaseSnapshot = useCallback(
        (id) => store.materializeNetworkReleaseSnapshot(id),
        []
    );
    const notifyCurriculumSwitcherUpdate = useCallback(
        () => treeGraphActions.notifyCurriculumSwitcherUpdate(),
        []
    );

    const slice = {
        ui,
        availableReleases,
        activeSource,
        constructionMode,
        isDemoTree,
        loadData,
        alert,
        materializeNetworkReleaseSnapshot,
        notifyCurriculumSwitcherUpdate,
        notify,
        dismissModal,
        setModal,
        userStore: getUserStoreAction(),
    };

    return {
        ...slice,
        state: slice,
        value: slice,
    };
}
