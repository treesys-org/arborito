/**
 * Shows local search index status (D2).
 * @param {HTMLElement | null} el
 * @param {{ searchIndexStatus?: string, searchIndexError?: string | null }} snapshot — `store.value` o equivalente
 * @param {object} ui — `store.ui`
 */
export function applySearchIndexBanner(el, snapshot, ui) {
    if (!el) return;
    const s = (snapshot && snapshot.searchIndexStatus) || 'idle';
    if (s === 'indexing') {
        el.classList.remove('hidden');
        el.textContent = ui.searchIndexBuilding || 'Building search index…';
        el.setAttribute('role', 'status');
    } else if (s === 'error') {
        el.classList.remove('hidden');
        const technical = snapshot.searchIndexError && String(snapshot.searchIndexError);
        if (technical && typeof console !== 'undefined' && console.warn) {
            console.warn('[Arborito] Search index:', technical);
        }
        el.textContent = ui.searchIndexFailed || 'Search index failed.';
        el.setAttribute('role', 'alert');
    } else {
        el.classList.add('hidden');
        el.textContent = '';
        el.removeAttribute('role');
    }
}
