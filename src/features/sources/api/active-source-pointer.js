/** Persisted last-open tree pointer (`arborito-active-source-*`). */

export function clearActiveSourcePointer() {
    try {
        localStorage.removeItem('arborito-active-source-id');
        localStorage.removeItem('arborito-active-source-meta');
    } catch {
        /* quota / private mode */
    }
}

/**
 * Whether a local branch or composed tree still exists in the user store.
 * Remote/community sources are always kept (transient network failures).
 * @param {object|null|undefined} activeSource
 * @param {{ state?: { branches?: object[] }, getTree?: (id: string) => object|null }|null|undefined} userStore
 */
export function localActiveSourceStillExists(activeSource, userStore) {
    if (!activeSource?.url) return false;
    const url = String(activeSource.url);
    if (url.startsWith('branch://')) {
        const id = url.slice('branch://'.length).split('/')[0];
        if (!id) return false;
        const entry = userStore?.state?.branches?.find((b) => b.id === id);
        return !!(entry && entry.data);
    }
    if (url.startsWith('tree://') || activeSource.type === 'composed-tree') {
        const treeId = String(activeSource.treeId || activeSource.id || url.slice('tree://'.length)).trim();
        if (!treeId) return false;
        return !!userStore?.getTree?.(treeId);
    }
    return true;
}

/** Load failure means the on-device tree was removed, do not preserve pointer for retry. */
export function isLocalSourceGoneError(err) {
    const msg = String(err?.message || err || '').toLowerCase();
    return (
        msg.includes('local tree not found') ||
        msg.includes('tree not found') ||
        msg.includes('branch not found') ||
        msg.includes('invalid local tree source')
    );
}
