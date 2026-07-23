import { useCallback } from 'react';
import { useApp } from './useApp.js';
import { getArboritoStore as store } from '../../core/store-singleton.js';
import { shellUiActions } from '../../stores/shell-ui-store.js';

/**
 * Shell / modal router, única puerta al store para `.jsx` en `app/` y `shared/ui/`.
 * No importar `core/store.js` directamente en componentes.
 */
export function useShell() {
    const { modal, ui } = useApp();

    const setModal = useCallback((next) => shellUiActions.setModal(next), []);
    const dismissModal = useCallback((opts) => shellUiActions.dismissModal(opts), []);
    const closeDialog = useCallback((result) => store.closeDialog(result), []);
    const notify = useCallback((msg, isError) => shellUiActions.notify(msg, isError), []);
    const leaveCertificatesView = useCallback(() => store.leaveCertificatesView?.(), []);
    const isSourcesDismissBlocked = useCallback(() => store.isSourcesDismissBlocked?.() ?? false, []);

    return {
        modal,
        ui,
        setModal,
        dismissModal,
        closeDialog,
        notify,
        leaveCertificatesView,
        isSourcesDismissBlocked,
    };
}

/** Singleton para efectos imperativos del shell (solo en hooks internos o efectos puntuales). */
export function useShellStore() {
    return store;
}

/** Modal actions only, avoids re-renders from unrelated store slices. */
export function useShellModalActions() {
    const setModal = useCallback((next) => shellUiActions.setModal(next), []);
    const dismissModal = useCallback((opts) => shellUiActions.dismissModal(opts), []);
    const closeDialog = useCallback((result) => store.closeDialog(result), []);
    const leaveCertificatesView = useCallback(() => store.leaveCertificatesView?.(), []);
    const isSourcesDismissBlocked = useCallback(() => store.isSourcesDismissBlocked?.() ?? false, []);

    return {
        setModal,
        dismissModal,
        closeDialog,
        leaveCertificatesView,
        isSourcesDismissBlocked,
    };
}
