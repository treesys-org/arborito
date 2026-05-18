/**
 * Explicit construction-mode sync across the UI (mobile + desktop).
 * The store already sets `html.arborito-construction-mobile` in `UIStore.update`; here we nudge
 * repaints that sometimes do not arrive from `state-change` alone (mobile trunk, panel).
 */

/**
 * @param {EventTarget & { value?: object }} storeLike — store instance (EventTarget + `.value`)
 */
export function afterConstructionModeMutation(storeLike) {
    if (typeof document === 'undefined') return;
    queueMicrotask(() => {
        try {
            storeLike.dispatchEvent(new CustomEvent('graph-update'));
        } catch {
            /* ignore */
        }
        import('../utils/search-index-service.js').then((m) => {
            try {
                m.scheduleSearchIndexAfterConstructionMutation(storeLike);
            } catch {
                /* ignore */
            }
        });
        const panel = document.querySelector('arborito-construction-panel');
        if (panel && typeof panel.syncConstructionFromStore === 'function') {
            panel.syncConstructionFromStore();
        }
    });
}
