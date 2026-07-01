import { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useHookUi, useShellModalActions } from '../../../app/hooks/useHookShell.js';
import { getArboritoStore as store } from '../../../core/store-singleton.js';
import { useSourcesSlice } from '../../../stores/sources-store.js';
import { useTreeGraphSlice, treeGraphActions } from '../../../stores/tree-graph-store.js';
import { shellUiActions } from '../../../stores/shell-ui-store-actions.js';
import { getUserStoreAction } from '../../../stores/identity-store-actions.js';

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

    const loadData = useCallback((source) => store.loadData(source), []);
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

export function useVersionUpdatesStore() {
    return store;
}
