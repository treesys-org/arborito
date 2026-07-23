/** Keys whose change affects mobile `<html>` shell classes, skip DOM work on graphUi-only updates. */
const MOBILE_SHELL_SYNC_KEYS = new Set([
    'modal',
    'modalOverlay',
    'previewNode',
    'selectedNode',
    'viewMode',
    'constructionMode',
    'treeHydrating',
    'data',
    'loading',
]);

/**
 * @param {Record<string, unknown>|null|undefined} partial
 */
export function shouldSyncMobileTreeShell(partial) {
    if (!partial || typeof partial !== 'object') return true;
    return Object.keys(partial).some((k) => MOBILE_SHELL_SYNC_KEYS.has(k));
}

/**
 * @param {Record<string, unknown>|null|undefined} partial
 */
export function isGraphUiOnlyPartial(partial) {
    if (!partial || typeof partial !== 'object') return false;
    const keys = Object.keys(partial);
    return keys.length > 0 && keys.every((k) => k === 'graphUi');
}

/** Tree navigation keys already synced via `patchDomainSlicesFromPartial`, skip global bus. */
const TREE_NAV_SKIP_KEYS = new Set(['graphUi', 'path']);

/** Modal route, shellUi slice syncs synchronously; skip full state-change storm. */
const MODAL_SHELL_KEYS = new Set(['modal', 'modalOverlay']);

/**
 * @param {Record<string, unknown>|null|undefined} partial
 */
export function isModalOnlyPartial(partial) {
    if (!partial || typeof partial !== 'object') return false;
    const keys = Object.keys(partial);
    return keys.length > 0 && keys.every((k) => MODAL_SHELL_KEYS.has(k));
}

/**
 * Skip `state-change` + redundant snapshot sync for high-frequency tree navigation.
 * Domain slices are patched synchronously in `store.update()` before this runs.
 *
 * @param {Record<string, unknown>|null|undefined} partial
 */
export function shouldSkipGlobalStateChange(partial) {
    if (!partial || typeof partial !== 'object') return false;
    const keys = Object.keys(partial);
    if (keys.length === 0) return false;
    return keys.every(
        (k) => TREE_NAV_SKIP_KEYS.has(k) || MODAL_SHELL_KEYS.has(k)
    );
}
