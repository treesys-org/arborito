import { useCallback, useMemo } from 'react';
import { useArboritoStore } from './useArboritoStore.js';
import { getArboritoStore } from '../../core/store-singleton.js';
import { shellUiActions } from '../../stores/shell-ui-store.js';

/**
 * Shell-level state + actions. Use in any feature instead of importing `core/store.js` in `.jsx`.
 */
export function useApp() {
    const state = useArboritoStore();

    const dismissModal = useCallback((opts) => shellUiActions.dismissModal(opts), []);
    const setModal = useCallback((modal) => shellUiActions.setModal(modal), []);
    const notify = useCallback((msg, isError) => shellUiActions.notify(msg, isError), []);
    const setTheme = useCallback((theme) => shellUiActions.setTheme(theme), []);
    const setLang = useCallback((lang) => shellUiActions.setLang(lang), []);
    const setViewMode = useCallback((mode, opts) => shellUiActions.setViewMode(mode, opts), []);
    const update = useCallback((patch) => getArboritoStore()?.update(patch), []);

    return useMemo(
        () => ({
            ...state,
            ui: getArboritoStore()?.ui ?? state.ui,
            dismissModal,
            setModal,
            notify,
            setTheme,
            setLang,
            setViewMode,
            update,
        }),
        [state, dismissModal, setModal, notify, setTheme, setLang, setViewMode, update]
    );
}
