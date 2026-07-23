import { useEffect } from 'react';
import { registerPanelRef, unregisterPanelRef } from '../panel-refs.js';

/**
 * Register imperative panel API for cross-feature calls (sidebar.closeMobileMenuIfOpen, etc.).
 * @param {string} refKey
 * @param {() => object | null | undefined} buildApi, latest API (may be null on first paint)
 */
export function useRegisterPanel(refKey, buildApi) {
    useEffect(() => {
        if (!refKey || !buildApi) return undefined;
        const panel = buildApi();
        if (panel) registerPanelRef(refKey, panel);
    });

    useEffect(() => {
        if (!refKey) return undefined;
        return () => unregisterPanelRef(refKey);
    }, [refKey]);
}
