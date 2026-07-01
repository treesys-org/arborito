import { useCallback } from 'react';
import { useHookUi, useShellModalActions, useShellModalLang } from '../../../app/hooks/useHookShell.js';
import { getArboritoStore as store } from '../../../core/store-singleton.js';
import { shellUiActions } from '../../../stores/shell-ui-store-actions.js';
import { getUserStoreAction } from '../../../stores/identity-store-actions.js';
import { publishingActions } from '../../../stores/publishing-store-actions.js';
import { searchActions } from '../../../stores/search-store.js';

/** Backup, export PDF, import progreso. */
export function useBackupExport() {
    const ui = useHookUi();
    const { modal } = useShellModalLang();
    const { dismissModal, setModal, notify } = useShellModalActions();

    const confirm = useCallback((...args) => shellUiActions.confirm(...args), []);
    const alert = useCallback((...args) => shellUiActions.alert(...args), []);
    const importProgress = useCallback((data) => publishingActions.importProgress(data), []);
    const downloadProgressFile = useCallback(() => publishingActions.downloadProgressFile(), []);
    const findNode = useCallback((id) => searchActions.findNode(id), []);
    const loadNodeChildren = useCallback((node) => store?.loadNodeChildren?.(node), []);
    const isSignedIn = useCallback(() => shellUiActions.isSignedIn(), []);

    return {
        ui,
        modal,
        confirm,
        alert,
        importProgress,
        downloadProgressFile,
        findNode,
        loadNodeChildren,
        isSignedIn,
        userStore: getUserStoreAction(),
        dismissModal,
        notify,
        setModal,
    };
}

export function useBackupExportStore() {
    return store;
}
