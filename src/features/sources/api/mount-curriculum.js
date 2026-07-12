/**
 * Single entry point to load a curriculum into the store.
 * The graph uses `treeHydrating`, not `loading` (that flag is for language, lessons, etc.).
 */

import { parseNostrTreeUrl } from '../../nostr/api/nostr-refs.js';
import { isNostrTreeMaintainerBlocked } from '../../nostr/api/maintainer-nostr-tree-blocklist.js';
import { getFrozenTreeBundle } from './tree-freeze-cache.js';
import {
    getTreeBundleCache,
    getTreeBundleCacheByUrl,
    putTreeBundleCache,
    TREE_BUNDLE_CACHE_FRESH_MS,
} from './tree-bundle-cache.js';
import { ensureConnectedNostr } from '../../../shared/lib/connected-services/index.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { scheduleAutoWebTorrentSeeder } from '../../p2p-webtorrent/api/auto-webtorrent-seeder.js';
import { mountComposedTree } from '../../forest/api/mount-composed-tree.js';
import { parseArboritoTreeBundle } from '../../forest/api/arborito-tree-bundle.js';
import { importComposedTreeFromBundle } from '../../forest/api/import-composed-tree-bundle.js';

import { DataProcessor } from '../../tree-graph/api/data-processor.js';
import { normalizeLoadedTreeJson } from '../../tree-graph/api/tree-load-pipeline.js';
import { sanitizeImportedTreeJson } from '../../tree-graph/api/tree-import-sanitize.js';
import { yieldToPaint } from '../../../shared/lib/yield-to-paint.js';
import { runThrottledBackgroundTask } from '../../../shared/lib/background-task-gate.js';
import {
    clearActiveSourcePointer,
    isLocalSourceGoneError,
    localActiveSourceStillExists,
} from './active-source-pointer.js';
import { branchShareCode, hydratePublishedShareCode } from './published-share-context.js';

function isSourcesModalOpen(store) {
    const m = store.state?.modal;
    return !!(m && (m === 'sources' || (typeof m === 'object' && m.type === 'sources')));
}

/**
 * @param {import('../../../core/store.js' ).Store} store
 * @param {object|null} source
 * @param {boolean} [forceRefresh=true] same meaning as before: open readme/versions on “full” load
 * @returns {Promise<boolean>} true if the graph mounted (`DataProcessor.process` succeeded)
 */
export async function mountCurriculum(store, source, forceRefresh = true) {
    await store.ensureCoreReady();
    if (source == null) {
        if (typeof store.clearConstructionUndoStack === 'function') store.clearConstructionUndoStack();
        if (typeof store.syncNostrPresenceFromActiveSource === 'function') {
            store.syncNostrPresenceFromActiveSource(null);
        }
        try {
            clearActiveSourcePointer();
        } catch {
            /* ignore */
        }
        store.update({
            treeHydrating: false,
            data: null,
            rawGraphData: null,
            activeSource: null,
            path: [],
            selectedNode: null,
            previewNode: null,
            loading: false,
            searchIndexStatus: 'idle',
            searchIndexError: null,
            treeCollaboratorRoles: null,
            treeCollaboratorUsernames: null,
            treeCollaboratorRolesByUsername: null,
            treeContext: null
        });
        return false;
    }

    const nextUrlEarly = source.url != null ? String(source.url) : '';
    const treeRefBlock = !nextUrlEarly.startsWith('branch://') ? parseNostrTreeUrl(nextUrlEarly) : null;
    if (treeRefBlock && isNostrTreeMaintainerBlocked(treeRefBlock.pub, treeRefBlock.universeId)) {
        const ui = store.ui;
        store.update({
            treeHydrating: false,
            loading: false,
            error:
                ui.maintainerBlocklistLoadRefused ||
                'This tree is blocked in this app build (maintainer list). It is not an automatic community block—see project policy to appeal.'
        });
        queueMicrotask(() => store.maybePromptNoTree());
        return false;
    }

    const epoch = ++store._curriculumMountEpoch;
    const prevSourceId = (store.state.activeSource && store.state.activeSource.id);
    /** First mount of the session (boot / F5): there is no previous tree to roll back to. */
    const isInitialMount = !prevSourceId;
    const switchedSource =
        !isInitialMount && String(prevSourceId || '') !== String((source && source.id) || '');
    /** Snapshot before attempting this mount (used if the same source refresh fails). */
    const snapBefore = {
        activeSource: store.state.activeSource,
        data: store.state.data,
        rawGraphData: store.state.rawGraphData,
        path: Array.isArray(store.state.path) ? [...store.state.path] : [],
        selectedNode: store.state.selectedNode,
        previewNode: store.state.previewNode
    };
    if (switchedSource) {
        store._treeForumHydratedForSourceId = null;
        if (typeof store.clearConstructionUndoStack === 'function') store.clearConstructionUndoStack();
    }
    // While hydrating, ensure UI doesn't keep rendering stale tree presentation from the previous rawGraphData.
    // We set activeSource early for chrome (e.g. construction dock) but clear data/rawGraphData until DataProcessor finishes.
    const isRemoteSource = !!(source && nextUrlEarly && !nextUrlEarly.startsWith('branch://'));
    const sourcesPickerOpen = isSourcesModalOpen(store);
    /** Keep the open tree visible while picking another from Biblioteca, avoids blank canvas on failed loads. */
    const holdCurrentTreeDuringSwitch = switchedSource && sourcesPickerOpen;
    /** Import / explicit callers set this before `loadData`; do not clear on local first mount. */
    const explicitGrowingOverlay = !!store.state.treeGrowingOverlay;
    store._treeHydrateStartedAt = Date.now();
    store.update({
        treeHydrating: true,
        treeGrowingOverlay:
            explicitGrowingOverlay || (!!(isRemoteSource || switchedSource) && !sourcesPickerOpen),
        error: null,
        activeSource: holdCurrentTreeDuringSwitch ? snapBefore.activeSource : source,
        data: holdCurrentTreeDuringSwitch ? snapBefore.data : null,
        rawGraphData: holdCurrentTreeDuringSwitch ? snapBefore.rawGraphData : null,
        path: holdCurrentTreeDuringSwitch ? snapBefore.path : [],
        selectedNode: holdCurrentTreeDuringSwitch ? snapBefore.selectedNode : null,
        previewNode: holdCurrentTreeDuringSwitch ? snapBefore.previewNode : null,
        searchIndexStatus: 'idle',
        searchIndexError: null,
        treeContext: nextUrlEarly.startsWith('tree://') ? store.state.treeContext : null,
    });
    await yieldToPaint();

    let success = false;
    try {
        if (!store.state.i18nData) {
            await store.loadLanguage(store.state.lang);
        }

        const nextUrl = nextUrlEarly;
        const prevUrl = (store.state.activeSource && store.state.activeSource.url);
        if (nextUrl && nextUrl !== prevUrl) {
            store.update({ searchCache: {} });
        }

        let graphJson;
        let finalSource;

        if (nextUrl.startsWith('tree://')) {
            return mountComposedTree(store, source, forceRefresh);
        }

        if (nextUrl.startsWith('branch://')) {
            await store.userStore?.ensureBranchesHydrated?.();
            const { json, finalSource: fs } = store.sourceManager.readBranchSync(source);
            graphJson = json;
            finalSource = fs;
        } else {
            const sourceId = String(source.id || '');
            const wantFrozen =
                sourceId &&
                store.userStore?.isTreeFrozen?.(sourceId);

            if (wantFrozen) {
                const frozen = await getFrozenTreeBundle(sourceId);
                if (frozen?.treeJson) {
                    graphJson = frozen.treeJson;
                    finalSource = {
                        ...source,
                        isFrozenCopy: true,
                        frozenAt: frozen.frozenAt || null,
                    };
                } else {
                    store.userStore?.setTreeFrozen?.(sourceId, false);
                }
            }

            if (!graphJson) {
                let cached = sourceId ? await getTreeBundleCache(sourceId) : null;
                if (!cached?.treeJson && nextUrl) {
                    cached = await getTreeBundleCacheByUrl(nextUrl);
                }
                const cacheAge = cached?.savedAt ? Date.now() - Number(cached.savedAt) : Infinity;
                const cacheFresh = cacheAge < TREE_BUNDLE_CACHE_FRESH_MS;
                if (cached?.treeJson) {
                    graphJson = cached.treeJson;
                    finalSource = {
                        ...source,
                        origin: cached.origin || source.origin,
                    };
                }

                const skipNetwork = !!graphJson && (!forceRefresh || cacheFresh);
                if (!skipNetwork) {
                    const ticket = ++store._networkLoadTicket;
                    let out;
                    try {
                        await ensureConnectedNostr(store, {
                            timeoutMs: shouldShowMobileUI() ? 20000 : 12000,
                        });
                        out = await store.sourceManager.loadData(
                            source,
                            store.state.lang,
                            forceRefresh,
                            store.state.rawGraphData
                        );
                    } catch (e) {
                        if (graphJson) {
                            const ui = store.ui || {};
                            queueMicrotask(() =>
                                store.notify(
                                    ui.treeLoadedFromCacheOffline ||
                                        'Showing cached copy, network refresh failed.',
                                    false
                                )
                            );
                        } else if (ticket !== store._networkLoadTicket) {
                            const ui = store.ui || {};
                            queueMicrotask(() =>
                                store.notify(
                                    ui.curriculumLoadSuperseded ||
                                        'Tree load was cancelled (a newer load started).',
                                    false
                                )
                            );
                            return false;
                        } else {
                            store.update({
                                error: String((e && e.message) || e),
                                loading: false,
                            });
                            queueMicrotask(() => store.maybePromptNoTree());
                            return false;
                        }
                    }
                    if (!graphJson) {
                        if (ticket !== store._networkLoadTicket) {
                            const ui = store.ui || {};
                            queueMicrotask(() =>
                                store.notify(
                                    ui.curriculumLoadSuperseded ||
                                        'Tree load was cancelled (a newer load started).',
                                    false
                                )
                            );
                            return false;
                        }
                        graphJson = out.json;
                        finalSource = out.finalSource;
                    } else if (out?.json) {
                        graphJson = out.json;
                        finalSource = out.finalSource;
                    }
                    if (forceRefresh && (finalSource && finalSource.origin) === 'nostr' && parseNostrTreeUrl(String(finalSource.url || ''))) {
                        store._treeForumHydratedForSourceId = null;
                    }
                }
            }
        }

        if (graphJson && parseArboritoTreeBundle(graphJson)) {
            const treeRef = parseNostrTreeUrl(String((finalSource && finalSource.url) || source.url || ''));
            const entry = await importComposedTreeFromBundle(store, graphJson, {
                treeRef: treeRef || undefined,
                shareCode: (finalSource && finalSource.shareCode) || undefined,
            });
            return store.loadComposedTree(entry.id);
        }

        graphJson = normalizeLoadedTreeJson(graphJson, store, finalSource);
        if (!graphJson) {
            const ui = store.ui || {};
            store.update({
                loading: false,
                error:
                    ui.curriculumLoadInvalidTreeJson ||
                    'Could not load this tree (invalid or empty data).'
            });
            return false;
        }

        const { tree: sanitized, issues } = sanitizeImportedTreeJson(graphJson);
        graphJson = sanitized;
        if (!graphJson) {
            const ui = store.ui || {};
            store.update({
                loading: false,
                error:
                    ui.curriculumLoadInvalidTreeJson ||
                    'Could not load this tree (invalid or empty data).'
            });
            return false;
        }
        if (issues.length && import.meta.env?.DEV) {
            console.warn('[Arborito] tree import sanitize', issues);
        }

        try {
            const metaCode = String(graphJson?.meta?.shareCode || finalSource?.shareCode || '').trim();
            const branchUrl = String(finalSource?.url || '');
            if (metaCode && branchUrl.startsWith('branch://')) {
                const localId = branchUrl.slice('branch://'.length).split('/')[0];
                const entry = store.userStore?.state?.branches?.find((t) => t.id === localId);
                if (entry?.publishedNetworkUrl && !branchShareCode(entry)) {
                    store.userStore.setBranchPublishedNetworkUrl?.(
                        localId,
                        entry.publishedNetworkUrl,
                        metaCode
                    );
                }
            }
        } catch {
            /* ignore */
        }

        const postLoadParallel = [];
        if (!nextUrl.startsWith('branch://') && typeof store.ensureNetworkUserPair === 'function') {
            postLoadParallel.push(store.ensureNetworkUserPair());
        }
        if (typeof store.refreshTreeNetworkGovernance === 'function') {
            postLoadParallel.push(store.refreshTreeNetworkGovernance(finalSource));
        }
        if (postLoadParallel.length) await Promise.all(postLoadParallel);
        const carryOverSelection =
            String(prevSourceId || '') === String((finalSource && finalSource.id) || '');
        await yieldToPaint();
        DataProcessor.process(store, graphJson, finalSource, {
            suppressReadmeAutoOpen: !forceRefresh,
            carryOverSelection
        });
        // Best-effort: notify the creator on this device if new directory reports exist.
        try {
            if (typeof store.maybeNotifyOwnerAboutNewDirectoryReports === 'function') {
                void store.maybeNotifyOwnerAboutNewDirectoryReports(finalSource);
            }
            if (typeof store.maybeNotifyOwnerAboutUrgentUserInbox === 'function') {
                void store.maybeNotifyOwnerAboutUrgentUserInbox(finalSource);
            }
        } catch {
            /* ignore */
        }
        if (typeof store.syncNostrPresenceFromActiveSource === 'function') {
            store.syncNostrPresenceFromActiveSource(finalSource);
        }
        if (typeof store.maybeShowCloudSyncBannerForSource === 'function') {
            store.maybeShowCloudSyncBannerForSource(finalSource);
        }
        try {
            void store.touchPublishedInactivityActivity?.(finalSource);
        } catch {
            /* ignore */
        }
        try {
            const branchUrl = String(finalSource?.url || '');
            if (branchUrl.startsWith('branch://')) {
                const localId = branchUrl.slice('branch://'.length).split('/')[0];
                store.userStore?.touchBranchRecency?.(localId);
                const entry = store.userStore?.state?.branches?.find((t) => t.id === localId);
                if (entry?.publishedNetworkUrl) {
                    void hydratePublishedShareCode(entry, { kind: 'branch' });
                }
                queueMicrotask(() => {
                    void runThrottledBackgroundTask(
                        `branch-maintain:${localId}`,
                        async () => {
                            const { autoMaintainPublishedBranch } = await import(
                                '../../publishing/api/published-entry-auto-maintain.js'
                            );
                            await autoMaintainPublishedBranch(store, localId);
                        },
                        { oncePerSession: true, minIntervalMs: 8000 }
                    ).catch((err) => {
                        console.warn('[Arborito] autoMaintainPublishedBranch', err);
                    });
                });
            }
        } catch {
            /* ignore */
        }
        success = true;
        store._curriculumLoadedAt = Date.now();
        if (finalSource?.id && store.state.rawGraphData) {
            void putTreeBundleCache(String(finalSource.id), {
                treeJson: store.state.rawGraphData,
                url: finalSource.url,
                origin: finalSource.origin,
            });
        }
        if (typeof store.maybeScheduleShellProductTourAfterTree === 'function') {
            queueMicrotask(() => store.maybeScheduleShellProductTourAfterTree());
        }
        queueMicrotask(() => {
            try {
                store.dispatchEvent(new CustomEvent('graph-update'));
            } catch {
                /* ignore */
            }
        });
        try {
            store.publishInstalledSourcesForAccount?.({ immediate: true });
        } catch { /* ignore */ }
        scheduleAutoWebTorrentSeeder(store);
    } catch (e) {
        console.error('[Arborito] mountCurriculum', e);
        store.update({
            error: String((e && e.message) || e),
            data: null,
            rawGraphData: null,
            loading: false
        });
        queueMicrotask(() => store.maybePromptNoTree());
        success = false;
    } finally {
        if (epoch === store._curriculumMountEpoch) {
            if (!success) {
                const err = store.state.error;
                const ui = store.ui || {};
                if (isInitialMount) {
                    /*
                     * Boot / F5: we had no previous tree to roll back to, so wiping
                     * `activeSource` would leave the canvas blank, the user reads
                     * this as “my tree disappeared”. Instead, clear the loading
                     * flags but keep the saved source pointer in `localStorage`
                     * (already written in the same source path on success and
                     * preserved on failure below) so the picker that opens via
                     * `maybePromptNoTree` can offer one-tap retry against the
                     * exact same tree the user had loaded last session.
                     */
                    store.update({
                        treeHydrating: false,
                        treeGrowingOverlay: false,
                        activeSource: null,
                        data: null,
                        rawGraphData: null,
                        path: [],
                        selectedNode: null,
                        previewNode: null,
                        ...(err ? { error: err } : {})
                    });
                    try {
                        const localGone =
                            isLocalSourceGoneError(err) ||
                            (source &&
                                (String(source.url || '').startsWith('branch://') ||
                                    String(source.url || '').startsWith('tree://')) &&
                                !localActiveSourceStillExists(source, store.userStore));
                        if (localGone) {
                            clearActiveSourcePointer();
                        } else if (source && source.id) {
                            localStorage.setItem('arborito-active-source-id', String(source.id));
                            localStorage.setItem('arborito-active-source-meta', JSON.stringify(source));
                        }
                    } catch {
                        /* ignore */
                    }
                    queueMicrotask(() => store.maybePromptNoTree());
                } else if (switchedSource) {
                    /** Failed switch: restore the previous tree so the canvas and dismiss gate stay consistent. */
                    store.update({
                        treeHydrating: false,
                        treeGrowingOverlay: false,
                        activeSource: snapBefore.activeSource,
                        data: snapBefore.data,
                        rawGraphData: snapBefore.rawGraphData,
                        path: snapBefore.path,
                        selectedNode: snapBefore.selectedNode,
                        previewNode: snapBefore.previewNode,
                        ...(err ? { error: err } : {})
                    });
                    if (snapBefore.data) {
                        queueMicrotask(() => {
                            try {
                                store.dispatchEvent(new CustomEvent('graph-update'));
                            } catch {
                                /* ignore */
                            }
                        });
                    }
                    try {
                        const prev = snapBefore.activeSource;
                        const localGone =
                            isLocalSourceGoneError(err) ||
                            (source &&
                                (String(source.url || '').startsWith('branch://') ||
                                    String(source.url || '').startsWith('tree://')) &&
                                !localActiveSourceStillExists(source, store.userStore));
                        if (localGone) {
                            clearActiveSourcePointer();
                        } else if (prev && prev.id) {
                            localStorage.setItem('arborito-active-source-id', prev.id);
                            localStorage.setItem('arborito-active-source-meta', JSON.stringify(prev));
                        } else if (source && source.id) {
                            /* Resilience: do NOT wipe `arborito-active-source-meta` on a
                               transient load failure when the *attempted* source has a
                               usable identity. If we cleared it here, one bad relay on
                               startup would make the app "forget" which tree the user
                               had open, forcing them to navigate the sources list
                               again on every reload while Nostr is flaky. Keep the
                               pointer so the next reload retries the same tree once
                               relays come back. (The community-source bookmark in
                               `communitySources` catalog is also untouched.) */
                            localStorage.setItem('arborito-active-source-id', String(source.id));
                            localStorage.setItem('arborito-active-source-meta', JSON.stringify(source));
                        } else {
                            clearActiveSourcePointer();
                        }
                    } catch {
                        /* ignore */
                    }
                } else {
                    store.update({
                        treeHydrating: false,
                        treeGrowingOverlay: false,
                        activeSource: snapBefore.activeSource,
                        data: snapBefore.data,
                        rawGraphData: snapBefore.rawGraphData,
                        path: snapBefore.path,
                        selectedNode: snapBefore.selectedNode,
                        previewNode: snapBefore.previewNode,
                        ...(err ? { error: err } : {})
                    });
                }
                const msg = String(err || '').trim();
                if (msg) {
                    const tpl = ui.curriculumLoadFailedSummary || '{message}';
                    queueMicrotask(() => store.notify(tpl.replace(/\{message\}/g, msg), true));
                }
            } else {
                store.update({ treeHydrating: false, treeGrowingOverlay: false });
                store._treeHydrateStartedAt = 0;
            }
        }
    }
    return success;
}
