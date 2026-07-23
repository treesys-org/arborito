import { createContext, useCallback, useContext, useEffect } from 'react';

const DockHubEmbedCloseContext = createContext(null);

/**
 * Parent sheet reads `closeRef.current()` on backdrop tap.
 * Visible dock-embed modal registers its close handler (e.g. arcade setup back-step).
 */
export function DockHubEmbedCloseProvider({ closeRef, fallbackClose, children }) {
    const register = useCallback(
        (fn) => {
            closeRef.current = typeof fn === 'function' ? fn : fallbackClose;
        },
        [closeRef, fallbackClose]
    );

    return (
        <DockHubEmbedCloseContext.Provider value={register}>{children}</DockHubEmbedCloseContext.Provider>
    );
}

/** Register close/back handler while this embed panel is visible. */
export function useDockHubEmbedClose(handler, active) {
    const register = useContext(DockHubEmbedCloseContext);
    useEffect(() => {
        if (!register || !active) return undefined;
        register(handler);
        return () => register(null);
    }, [register, handler, active]);
}
