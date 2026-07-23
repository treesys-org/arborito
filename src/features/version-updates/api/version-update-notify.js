/**
 * Notify learners when a remote branch has a newer archived release.
 * Uses the consolidated curriculum switcher (version tab), same as post-switch flow.
 */

const DISMISS_PREFIX = 'arborito-version-notify-dismiss:';

function baseSourceId(activeSource) {
    const id = String(activeSource?.id || '').trim();
    if (!id) return '';
    const dash = id.lastIndexOf('-');
    if (dash > 0 && activeSource?.type === 'archive') {
        return id.slice(0, dash);
    }
    return id;
}

function isRemoteCurriculumSource(activeSource) {
    if (!activeSource?.url) return false;
    const url = String(activeSource.url);
    if (url.startsWith('branch://') || url.startsWith('tree://') || url.startsWith('nostr://')) {
        return false;
    }
    if (activeSource.type === 'branch' || activeSource.type === 'composed-tree') return false;
    return true;
}

/**
 * @param {object} activeSource
 * @param {object[]} releases
 * @returns {object|null}
 */
export function findNewerRemoteRelease(activeSource, releases) {
    if (!isRemoteCurriculumSource(activeSource)) return null;
    const archives = (releases || [])
        .filter((r) => r?.type === 'archive' && r.url)
        .sort((a, b) => String(b.id).localeCompare(String(a.id)));
    if (!archives.length) return null;

    const latest = archives[0];
    const currentUrl = String(activeSource.url || '');

    if (currentUrl === String(latest.url)) return null;

    if (activeSource.type === 'archive') {
        const currentIdx = archives.findIndex(
            (a) => String(a.url) === currentUrl || String(a.id) === String(activeSource.year || '')
        );
        if (currentIdx === 0) return null;
        return latest;
    }

    return null;
}

function isDismissed(sourceId, releaseId) {
    try {
        return localStorage.getItem(`${DISMISS_PREFIX}${sourceId}:${releaseId}`) === '1';
    } catch {
        return false;
    }
}

export function dismissRemoteVersionNotify(sourceId, releaseId) {
    try {
        localStorage.setItem(`${DISMISS_PREFIX}${sourceId}:${releaseId}`, '1');
    } catch {
        /* ignore */
    }
}

function isSourcesModalOpen(store) {
    const m = store?.state?.modal;
    return !!(m && (m === 'sources' || (typeof m === 'object' && m.type === 'sources')));
}

/**
 * @param {import('../../../core/store-singleton.js').ArboritoStore | null} store
 */
export function maybeNotifyRemoteVersionUpdate(store) {
    if (!store?.state?.activeSource) return;
    if (store.state.constructionMode || store.state.modal || store.state.treeHydrating) return;

    const src = store.state.activeSource;
    const releases = store.state.availableReleases || [];
    const newer = findNewerRemoteRelease(src, releases);
    if (!newer) return;

    const sourceId = baseSourceId(src);
    const releaseId = String(newer.id || newer.url || '');
    if (!sourceId || !releaseId || isDismissed(sourceId, releaseId)) return;

    dismissRemoteVersionNotify(sourceId, releaseId);

    const ui = store.ui || {};
    const label = String(newer.name || releaseId);
    const msg = (ui.releasesUpdateAvailable || 'New version available: {name}').replace('{name}', label);
    try {
        store.notify?.(msg, false);
    } catch {
        /* ignore */
    }

    setTimeout(() => {
        if (store.state.modal || store.state.constructionMode || store.state.treeHydrating) return;
        if (isSourcesModalOpen(store)) return;
        store.dispatchEvent(
            new CustomEvent('open-curriculum-switcher', {
                detail: {
                    preferTab: 'version',
                    newReleaseId: releaseId,
                    newReleaseName: newer.name || releaseId,
                },
            })
        );
    }, 700);
}
