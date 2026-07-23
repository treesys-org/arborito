import { useCallback } from 'react';
import { useHookUi, useShellModalActions } from '../../../app/hooks/useHookShell.js';
import { useShellUiSlice } from '../../../stores/shell-ui-store.js';
import { publishingActions } from '../../../stores/publishing-store-actions.js';

/** Publicar, licencias, diff. */
export function usePublishing() {
    const ui = useHookUi();
    const { publishingTree } = useShellUiSlice((s) => s);
    const { dismissModal, setModal, notify, confirm, alert } = useShellModalActions();

    const publishTreePublicInteractive = useCallback(
        (opts) => publishingActions.publishTreePublicInteractive(opts),
        []
    );
    const revokePublicTreeInteractive = useCallback(
        (opts) => publishingActions.revokePublicTreeInteractive(opts),
        []
    );
    const downloadProgressFile = useCallback(() => publishingActions.downloadProgressFile(), []);

    return {
        ui,
        publishingTree,
        confirm,
        alert,
        publishTreePublicInteractive,
        revokePublicTreeInteractive,
        downloadProgressFile,
        dismissModal,
        setModal,
        notify,
    };
}

export function usePublishingStore() {
    return publishingActions;
}
