/** Deep-link query keys for shared courses (`?source=` / `?code=`). One-shot: strip after consume. */
export const SHARE_TREE_PARAM_KEYS = ['source', 'code'];

/**
 * Remove share deep-link params so a reload does not re-open the same course.
 * Mirrors certificate share stripping (`?cert=`). Does not rewrite the URL to the active tree.
 */
export function stripShareTreeParams() {
    if (typeof window === 'undefined' || !window.history?.replaceState) return;
    try {
        const url = new URL(window.location.href);
        let touched = false;
        for (const key of SHARE_TREE_PARAM_KEYS) {
            if (url.searchParams.has(key)) {
                url.searchParams.delete(key);
                touched = true;
            }
        }
        if (!touched) return;
        const qs = url.searchParams.toString();
        const next = `${url.pathname}${qs ? `?${qs}` : ''}${url.hash || ''}`;
        window.history.replaceState({}, '', next);
    } catch {
        /* ignore */
    }
}
