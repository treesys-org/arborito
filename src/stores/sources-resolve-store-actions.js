import { getArboritoStore } from '../core/store-singleton.js';
import { parseNostrTreeUrl } from '../features/nostr/api/nostr-refs.js';
import { clearSearchIndexForTreeId } from '../features/search/api/search-index-service.js';
import { clearLessonCacheForSource } from '../features/learning/api/lesson-content-cache.js';
import { removeFrozenTreeBundle } from '../features/sources/api/tree-freeze-cache.js';
import { removeTreeBundleCache } from '../features/sources/api/tree-bundle-cache.js';
import { canonicalNetworkTreeUrlString } from '../features/sources/api/modals/logic/sources-helpers.js';
import {
    clearActiveSourcePointer,
    localActiveSourceStillExists,
} from '../features/sources/api/active-source-pointer.js';
import { startRotatingWebTorrentSeeder, stopRotatingWebTorrentSeeder, collectWebTorrentMagnets } from '../features/p2p-webtorrent/api/webtorrent-seeder-rotate.js';
import { branchIdFromBranchUrl } from '../shared/lib/branch-id.js';

function shell() {
    return getArboritoStore();
}

/** Prefer a local garden copy over re-fetching Nostr when the saved link matches. */
async function resolveLoadSourceForSmartMerge(store, source) {
    await store.userStore?.ensureBranchesHydrated?.();
    const url = String(source?.url || '').trim();
    const canon = canonicalNetworkTreeUrlString(url) || url;
    const treeRef = parseNostrTreeUrl(url);
    const branches = store.userStore?.state?.branches || [];

    const localBranch = branches.find((b) => {
        if (!b?.data) return false;
        const pub = canonicalNetworkTreeUrlString(String(b?.publishedNetworkUrl || '').trim());
        if (pub && pub === canon) return true;
        if (treeRef?.universeId && String(b?.data?.universeId || '').trim() === treeRef.universeId) {
            return true;
        }
        return false;
    });

    if (localBranch?.id) {
        return {
            id: localBranch.id,
            name: localBranch.name || source.name,
            url: `branch://${localBranch.id}`,
            type: 'branch',
            isTrusted: true,
            shareCode:
                store.userStore.getBranchPublishedShareCode?.(localBranch.id) ||
                source.shareCode ||
                null,
        };
    }

    if (
        treeRef &&
        !(Array.isArray(source.recommendedRelays) && source.recommendedRelays.length)
    ) {
        try {
            const nostr = await store.ensureNostrReady?.();
            const dir = await nostr?.loadGlobalTreeDirectoryEntryOnce?.(treeRef);
            if (Array.isArray(dir?.recommendedRelays) && dir.recommendedRelays.length) {
                return { ...source, recommendedRelays: dir.recommendedRelays };
            }
        } catch {
            /* ignore, fall back to default relays */
        }
    }

    return source;
}

/** Source list management, deferred product tour, no-tree prompt, and WebTorrent seeder controls. */

export function _hasActiveSourcePointerAction() {
    const store = shell();
    if (!store) return undefined;

            try {
                return !!localStorage.getItem('arborito-active-source-id');
            } catch {
                return false;
            }

}

export function _localGardenCountsAction() {
    const store = shell();
    if (!store) return undefined;

            const branches = store.userStore?.state?.branches?.length ?? 0;
            const trees = store.userStore?.state?.trees?.length ?? 0;
            return { branches, trees, any: branches > 0 || trees > 0 };

}

export function _shouldAutoOpenSourcesOnBootAction() {
    /* Bosque (sources picker) opens only when the user asks for it, not on cold start. */
    return false;
}

export function _scheduleDeferredProductTourAfterBootAction() {
    const store = shell();
    if (!store) return undefined;

            if (store._deferredTourScheduled) return;
            store._deferredTourScheduled = true;
            store._scheduleDeferredProductTour();

}

export function addCommunitySourceAction(url, opts) {
    const store = shell();
    if (!store) return undefined;

            return store.sourceManager.addCommunitySource(url, opts || {});

}

export function removeCommunitySourceAction(id) {
    const store = shell();
    if (!store) return undefined;

            const prevActive = store.state.activeSource;
            store.sourceManager.removeCommunitySource(id);
            // GDPR/local: if user deletes a tree link, also clear derived local caches for that source.
            try {
                clearSearchIndexForTreeId(id);
                clearLessonCacheForSource(id);
                removeFrozenTreeBundle(id);
                removeTreeBundleCache(id);
                store.userStore?.setTreeFrozen?.(id, false);
            } catch {
                /* ignore */
            }
            if (prevActive?.id === id) {
                void store.clearCanvasAndShowLoadTreeWelcome();
            }

}

export async function loadAndSmartMergeAction(sourceId) {
    const store = shell();
    if (!store) return undefined;

            const sid = String(sourceId || '').trim();
            if (!sid) return false;
            /* Prefer the saved link (Internet) over version rows in case the id collides. */
            let source =
                store.state.communitySources.find((s) => String(s.id) === sid) ||
                store.state.availableReleases.find((s) => String(s.id) === sid);
            if (!source) {
                const ui = store.ui || {};
                store.notify(
                    ui.sourcesLoadNotFound || ui.sourcesInstallFailed || 'Tree not found in your saved list.',
                    true
                );
                return false;
            }
            const resolved = await resolveLoadSourceForSmartMerge(store, source);
            return store.loadData(resolved, false);

}

export function canRetractActivePublicUniverseAction() {
    const store = shell();
    if (!store) return undefined;

            /* Live public tree only — not a local branch that merely links a published URL. */
            const srcUrl = String(store.state.activeSource?.url || '');
            const liveRef = parseNostrTreeUrl(srcUrl);
            if (!liveRef) return false;
            return !!store.getNostrPublisherPair(liveRef.pub);

}

export function getPublishedTreeRefForActiveLocalSourceAction() {
    const store = shell();
    if (!store) return undefined;

            try {
                const srcUrl = String(store.state.activeSource?.url || '');
                if (!srcUrl.startsWith('branch://')) return null;
                const localId = branchIdFromBranchUrl(srcUrl);
                if (!localId) return null;
                const published = store.userStore?.getBranchPublishedNetworkUrl?.(localId);
                if (!published) return null;
                return parseNostrTreeUrl(published);
            } catch {
                return null;
            }

}

export async function startWebTorrentSeederAction() {
    const store = shell();
    if (!store) return undefined;

            try {
                if (!collectWebTorrentMagnets(store.state.rawGraphData).length) {
                    store.notify(store.ui.webtorrentSeederNoMeta || 'This tree has no WebTorrent metadata to seed.', true);
                    return false;
                }
                if (!store.webtorrent?.available?.()) {
                    store.notify(store.ui.webtorrentSeederUnavailable || 'WebTorrent is not available in this environment.', true);
                    return false;
                }
                return await startRotatingWebTorrentSeeder(store);
            } catch (e) {
                console.warn('startWebTorrentSeeder', e);
                store.update({ webtorrentSeeder: { running: false, error: String(e?.message || e) } });
                return false;
            }

}

export function stopWebTorrentSeederAction() {
    const store = shell();
    if (!store) return undefined;
    stopRotatingWebTorrentSeeder(store);
}

export function _scheduleDeferredProductTourAction() {
    const store = shell();
    if (!store) return undefined;

            if (store.state.constructionMode) return;
            const sourcesPickerDoneKey = 'arborito-ui-tour-sources-picker-v1-done';
            let tries = 0;
            const attempt = () => {
                tries += 1;
                if (store.state.constructionMode) return;
                const modal = store.state.modal;
                const modalType = typeof modal === 'string' ? modal : modal?.type;
                const overlayBlocking = !!store.state.modalOverlay;
                const previewBlocking = !!store.state.previewNode;

                if (overlayBlocking || previewBlocking) {
                    if (tries < 160) setTimeout(attempt, 400);
                    return;
                }

                if (store.state.treeHydrating || (store.state.activeSource && !store.state.data)) {
                    if (tries < 160) setTimeout(attempt, 400);
                    return;
                }

                if (store._curriculumLoadedAt && Date.now() - store._curriculumLoadedAt < 600) {
                    if (tries < 160) setTimeout(attempt, 120);
                    return;
                }

                /* No tree loaded: open the Trees picker so the user has somewhere
                 * to go, BUT only when nothing else is currently showing. The
                 * earlier behaviour ("if modal is not sources, replace it with
                 * sources") hijacked the onboarding wizard mid-flow: after a fresh
                 * register the user lands on "Account created!" to save the secret,
                 * store poller would fire ~650 ms later and swap that view for the
                 * Trees picker without any tap, the "advances on its own" the user
                 * reported even on desktop with no input. Onboarding's own
                 * `_complete()` is the single source of truth that opens sources
                 * when the user is actually ready; we wait for whatever modal is
                         * up to close on its own before nudging the picker open. */
                if (!store.state.data) {
                    if (!store._shouldAutoOpenSourcesOnBoot()) return;
                    try {
                        if (localStorage.getItem(sourcesPickerDoneKey)) return;
                    } catch {
                        return;
                    }
                    if (modalType) {
                        /* Something is up (onboarding, profile, sources already, etc.),
                         * retry later instead of replacing it. */
                        if (tries < 160) setTimeout(attempt, 400);
                        return;
                    }
                    try {
                        store.setModal({ type: 'sources' });
                    } catch {
                        /* ignore */
                    }
                    if (overlayBlocking || previewBlocking) {
                        if (tries < 160) setTimeout(attempt, 400);
                        return;
                    }
                    window.dispatchEvent(
                        new CustomEvent('arborito-start-tour', {
                            detail: { source: 'deferred-no-tree', force: true, skipDockForOpenTrees: true }
                        })
                    );
                    return;
                }

                try {
                    if (localStorage.getItem('arborito-ui-tour-done')) return;
                } catch {
                    return;
                }
                if (modal) {
                    if (tries < 160) setTimeout(attempt, 400);
                    return;
                }
                window.dispatchEvent(new CustomEvent('arborito-start-tour', { detail: { source: 'deferred-init' } }));
            };
            setTimeout(attempt, 200);

}

export function maybeScheduleShellProductTourAfterTreeAction() {
    const store = shell();
    if (!store) return undefined;

            const shellPendingKey = 'arborito-ui-tour-shell-pending-v1';
            try {
                if (localStorage.getItem('arborito-ui-tour-done')) return;
                if (localStorage.getItem(shellPendingKey) !== 'true') return;
            } catch {
                return;
            }
            if (store.state.constructionMode) return;
            if (!store.state.data || !store.state.rawGraphData || !store.state.activeSource) return;
            try {
                localStorage.removeItem(shellPendingKey);
            } catch {
                /* ignore */
            }

            let tries = 0;
            const attempt = () => {
                tries += 1;
                if (store.state.constructionMode) return;
                if (store.state.modal || store.state.modalOverlay || store.state.previewNode) {
                    if (tries < 48) setTimeout(attempt, 120);
                    return;
                }
                if (store.state.treeHydrating && !store.state.data) {
                    if (tries < 48) setTimeout(attempt, 120);
                    return;
                }
                if (!store.state.data) {
                    if (tries < 48) setTimeout(attempt, 120);
                    return;
                }
                try {
                    if (localStorage.getItem('arborito-ui-tour-done')) return;
                } catch {
                    return;
                }
                window.dispatchEvent(
                    new CustomEvent('arborito-start-tour', {
                        detail: { source: 'shell-after-tree', force: true },
                    })
                );
            };
            requestAnimationFrame(() => requestAnimationFrame(attempt));

}

export function maybePromptNoTreeAction(opts = {}) {
    const store = shell();
    if (!store) return undefined;

            if (store.state.constructionMode) return;
            if (store.state.treeHydrating) {
                /* Stuck hydrate with no data, still offer the picker after a long wait. */
                const stuckMs = Number(store._treeHydrateStartedAt) || 0;
                if (!stuckMs || Date.now() - stuckMs < 45000) return;
                store.update({ treeHydrating: false, treeGrowingOverlay: false, loading: false });
            }
            if (store.state.loading) return;
            if (store.state.data) return;
            if (store._curriculumLoadedAt && Date.now() - store._curriculumLoadedAt < 2500) return;
            if (store._hasActiveSourcePointer() && !store.state.data) {
                try {
                    const saved = localStorage.getItem('arborito-active-source-meta');
                    let meta = saved ? JSON.parse(saved) : null;
                    const savedId = localStorage.getItem('arborito-active-source-id');
                    if (!meta && savedId) {
                        const id = String(savedId).trim();
                        meta = id.startsWith('branch-')
                            ? { id, url: `branch://${id}`, type: 'branch' }
                            : { id, treeId: id, url: `tree://${id}`, type: 'composed-tree' };
                    }
                    if (meta && !localActiveSourceStillExists(meta, store.userStore)) {
                        clearActiveSourcePointer();
                    }
                } catch {
                    /* ignore */
                }
            }

            const m = store.state.modal;
            const t = typeof m === 'string' ? m : m?.type;
            if (t === 'language') return;
            if (t === 'onboarding') return;
            if (t === 'load-warning') return;
            if (t === 'dialog') return;
            if (!store._shouldAutoOpenSourcesOnBoot()) return;
            store.setModal({ type: 'sources' });
            store._maybeStartSourcesPickerTour();

}

export function _maybeStartSourcesPickerTourAction() {
    const store = shell();
    if (!store) return undefined;

            const sourcesPickerDoneKey = 'arborito-ui-tour-sources-picker-v1-done';
            try {
                if (localStorage.getItem(sourcesPickerDoneKey)) return;
            } catch {
                return;
            }
            const fire = () => {
                try {
                    if (localStorage.getItem(sourcesPickerDoneKey)) return;
                } catch {
                    return;
                }
                const m = store.state.modal;
                const mt = typeof m === 'string' ? m : m?.type;
                const fromOnboarding = !!(m && typeof m === 'object' && m.fromOnboarding);
                if (mt !== 'sources' || (store.state.data && !fromOnboarding)) return;
                if (store.state.modalOverlay || store.state.previewNode) return;
                window.dispatchEvent(
                    new CustomEvent('arborito-start-tour', {
                        detail: { source: 'no-tree-sources', force: true, skipDockForOpenTrees: true }
                    })
                );
            };
            setTimeout(fire, 400);
            setTimeout(fire, 900);

}

/** Store.prototype, explicit actions (no bindStoreContext). */
export const storeSourceResolveMethods = {
    _hasActiveSourcePointer: _hasActiveSourcePointerAction,
    _localGardenCounts: _localGardenCountsAction,
    _shouldAutoOpenSourcesOnBoot: _shouldAutoOpenSourcesOnBootAction,
    _scheduleDeferredProductTourAfterBoot: _scheduleDeferredProductTourAfterBootAction,
    addCommunitySource: addCommunitySourceAction,
    removeCommunitySource: removeCommunitySourceAction,
    loadAndSmartMerge: loadAndSmartMergeAction,
    canRetractActivePublicUniverse: canRetractActivePublicUniverseAction,
    getPublishedTreeRefForActiveLocalSource: getPublishedTreeRefForActiveLocalSourceAction,
    startWebTorrentSeeder: startWebTorrentSeederAction,
    stopWebTorrentSeeder: stopWebTorrentSeederAction,
    _scheduleDeferredProductTour: _scheduleDeferredProductTourAction,
    maybeScheduleShellProductTourAfterTree: maybeScheduleShellProductTourAfterTreeAction,
    maybePromptNoTree: maybePromptNoTreeAction,
    _maybeStartSourcesPickerTour: _maybeStartSourcesPickerTourAction,
};
