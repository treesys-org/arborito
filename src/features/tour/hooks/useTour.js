import { useCallback } from 'react';
import { useHookUi, useShellModalActions } from '../../../app/hooks/useHookShell.js';
import { getArboritoStore } from '../../../core/store-singleton.js';

/** Product tour, hooks internos pueden usar useTourStore(). */
export function useTour() {
    const ui = useHookUi();
    const { dismissModal, setModal } = useShellModalActions();

    const maybeScheduleShellProductTourAfterTree = useCallback(
        () => getArboritoStore()?.maybeScheduleShellProductTourAfterTree?.(),
        []
    );
    const subscribeStateChange = useCallback((handler) => {
        const s = getArboritoStore();
        if (!s) return () => {};
        s.addEventListener('state-change', handler);
        return () => s.removeEventListener('state-change', handler);
    }, []);

    return {
        ui,
        maybeScheduleShellProductTourAfterTree,
        subscribeStateChange,
        setModal,
        dismissModal,
    };
}

export function useTourStore() {
    return getArboritoStore();
}
