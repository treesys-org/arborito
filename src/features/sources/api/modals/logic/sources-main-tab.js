/**
 * Library chrome tabs: mine | explore (primary) + trees (combined, demoted).
 * Legacy ids `branches` / `forest` normalize here so older call sites keep working.
 */

/** First library open lands on Explorar so the network catalog is discoverable. */
export const SOURCES_SAW_EXPLORE_KEY = 'arborito-sources-saw-explore';

export function normalizeSourcesMainTab(raw) {
    const t = String(raw || '')
        .trim()
        .toLowerCase();
    if (t === 'trees' || t === 'tree' || t === 'forest' || t === 'combined') return 'trees';
    if (t === 'explore' || t === 'internet' || t === 'network') return 'explore';
    if (t === 'mine' || t === 'branches' || t === 'branch' || t === 'local') return 'mine';
    return 'mine';
}

/** Branches list scope driven by primary tabs (not by trees subview). */
export function sourcesScopeForMainTab(tab) {
    return normalizeSourcesMainTab(tab) === 'explore' ? 'internet' : 'branch';
}

/** Mark Explorar as seen (first-open default). Safe no-op outside a browser. */
export function markSourcesExploreSeen() {
    try {
        localStorage.setItem(SOURCES_SAW_EXPLORE_KEY, '1');
    } catch {
        /* ignore */
    }
}

export function hasSeenSourcesExplore() {
    try {
        return localStorage.getItem(SOURCES_SAW_EXPLORE_KEY) === '1';
    } catch {
        return true;
    }
}
