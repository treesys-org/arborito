import { useImperativeHandle, useMemo } from 'react';
import { useRegisterPanel } from './useRegisterPanel.js';

/**
 * Expose imperative panel API via ref + registerPanelRef for cross-feature calls.
 *
 * @param {import('react').Ref} ref, forwarded ref from parent
 * @param {string} refKey, panel registry key (e.g. 'sidebar', 'graph')
 * @param {() => object} buildApi, returns methods other modules call via getPanelRef()
 * @param {import('react').DependencyList} [deps], when API shape changes
 */
export function usePanelImperative(ref, refKey, buildApi, deps = []) {
    const api = useMemo(buildApi, deps);
    useImperativeHandle(ref, () => api, [api]);
    useRegisterPanel(refKey, () => api);
    return api;
}
