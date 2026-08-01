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
import { resolveDirectoryIconForPublish } from './branch-catalog-icon.js';
import { ensureConnectedNostr } from '../../../shared/lib/connected-services/index.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { scheduleAutoWebTorrentSeeder } from '../../p2p-webtorrent/api/auto-webtorrent-seeder.js';
import { mountComposedTree } from '../../forest/api/mount-composed-tree.js';
import { parseArboritoTreeBundle } from '../../forest/api/arborito-tree-bundle.js';
import { importComposedTreeFromBundle } from '../../forest/api/import-composed-tree-bundle.js';
import { refreshRemoteTreeBundleInBackground } from './remote-tree-swr-refresh.js';
import { isUniverseRevokedError, promptStudentUniverseRevoked, hasPendingUniverseRevokePrompt } from './universe-revoked.js';
import { shouldSuppressTreeGrowingBlock, isBibliotecaModalOpen, isBibliotecaSoftMount } from './sources-session.js';

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
import { getPanelRef } from '../../../app/panel-refs.js';
import { confirmConstructionTreeLoadIfNeeded } from '../../editor/api/construction-enter-flow.js';
import { resetSageChatForSourceChange } from '../../../stores/learning-store-actions.js';
import {
    ensureDemoProgressSyncOnline,
    isArboritoDemoTree,
} from '../../publishing/api/demo-tree-guard.js';
import { DEMO_BRANCH_ID } from '../../../core/demo/arborito-demo-ids.js';

function nostrConnectTimeoutMs() {
    return shouldShowMobileUI() ? 20000 : 12000;
}

/**
 * @param {import('../../../core/store.js' ).Store} store
 * @param {object|null} source
 * @param {boolean} [forceRefresh=true] same meaning as before: open readme/versions on “full” load
 * @param {{ skipConstructionLoadConfirm?: boolean }} [opts]
 * @returns {Promise<boolean>} true if the graph mounted (`DataProcessor.process` succeeded)
 */
export async function mountCurriculum(store, source, forceRefresh = true, opts = {}) {
    await store.ensureCoreReady();
    /*
     * If post–sign-in autoload is waiting and this mount is not that autoload,
     * the user (or boot UI) chose a tree — do not steal it afterward.
     */
    if (source != null && store._autoloadAfterSignInPending && !store._autoloadMountInFlight) {
        try {
            store.cancelAutoloadTreeAfterSignIn?.({ userChose: true });
        } catch {
            /* ignore */
        }
    }
    if (source == null) {
        const contentApi = getPanelRef('content');
        if (typeof contentApi?.confirmLeaveIfNeeded === 'function') {
            const ok = await contentApi.confirmLeaveIfNeeded();
            if (!ok) return false;
        }
        if (typeof store.clearConstructionUndoStack === 'function') store.clearConstructionUndoStack();
        if (typeof store.syncNostrPresenceFromActiveSource === 'function') {
            store.syncNostrPresenceFromActiveSource(null);
        }
        try {
            clearActiveSourcePointer();
        } catch {
            /* ignore */
        }
        resetSageChatForSourceChange(store);
        store.update({
            treeHydrating: false,
            data: null,
            rawGraphData: null,
            activeSource: null,
            path: [],
            selectedNode: null,
            previewNode: null,
            lessonContentLoading: false,
            loading: false,
            searchIndexStatus: 'idle',
            searchIndexError: null,
            treeCollaboratorRoles: null,
            treeCollaboratorUsernames: null,
            treeCollaboratorRolesByUsername: null,
            treeContext: null
        });
        /* Never leave empty sky — remount Arborito demo. */
        queueMicrotask(() => {
            void store.ensureMinimumDemoMounted?.();
        });
        return false;
    }

    const prevSrc = store.state?.activeSource;
    const prevKey = prevSrc ? String(prevSrc.id || prevSrc.url || '') : '';
    const nextKey = String(source.id || source.url || '');
    if (prevKey && nextKey && prevKey !== nextKey) {
        const contentApi = getPanelRef('content');
        if (typeof contentApi?.confirmLeaveIfNeeded === 'function') {
            const ok = await contentApi.confirmLeaveIfNeeded();
            if (!ok) return false;
        }
        /* Fork / plant / create-tree already chose to switch — do not ask
         * “load while editing?” for that intentional mount. */
        if (store.state.constructionMode && !opts?.skipConstructionLoadConfirm) {
            try {
                const proceed = await confirmConstructionTreeLoadIfNeeded(
                    source?.type === 'composed-tree' ? String(source.treeId || source.id || '') : ''
                );
                if (!proceed) return false;
            } catch (e) {
                console.error('[Arborito] construction load confirm', e);
            }
        }
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
                'This tree is blocked in this app build (maintainer list). It is not an automatic community block: see project policy to appeal.'
        });
        queueMicrotask(() => {
            if (!store.state.data) void store.ensureMinimumDemoMounted?.();
            else store.maybePromptNoTree();
        });
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
        /* Clear before hydrate so mid-switch Sage turns cannot keep prior course focus/demo chat. */
        resetSageChatForSourceChange(store);
    }
    // While hydrating, ensure UI doesn't keep rendering stale tree presentation from the previous rawGraphData.
    // We set activeSource early for chrome (e.g. construction dock) but clear data/rawGraphData until DataProcessor finishes.
    const isComposedTreeUrl = nextUrlEarly.startsWith('tree://');
    /* Composed trees resolve from local garden / IDB first; mountComposedTree owns overlay + clear. */
    const isRemoteSource = !!(
        source &&
        nextUrlEarly &&
        !nextUrlEarly.startsWith('branch://') &&
        !isComposedTreeUrl
    );
    const isCacheableRemote = isRemoteSource;
    const sourcesPickerOpen = shouldSuppressTreeGrowingBlock(store);
    /**
     * Keep the open tree visible while Biblioteca modal is still open (failed pick
     * must not blank the canvas). Soft-mount closes the modal first — then clear
     * and show trunk loading placeholders until the first paint.
     * Use modal state only (not sticky panel refs): refs stay after dismiss and
     * would wrongly hold the previous tree for the whole Añadir wait.
     */
    const holdCurrentTreeDuringSwitch =
        switchedSource && isBibliotecaModalOpen(store) && !isBibliotecaSoftMount();
    /** Import / explicit callers set this before `loadData`; do not clear on local first mount. */
    const explicitGrowingOverlay = !!store.state.treeGrowingOverlay;

    /*
     * Peek IndexedDB before the growing overlay so revisits with cache skip the
     * full-screen wait and can paint via stale-while-revalidate. Kick Nostr
     * connect in parallel with the cache read on remote opens.
     */
    let earlyRemoteCache = null;
    let earlyFrozen = null;
    const earlySourceId = String(source.id || '');
    const earlyConnectPromise = isCacheableRemote
        ? ensureConnectedNostr(store, { timeoutMs: nostrConnectTimeoutMs() })
        : null;
    if (isCacheableRemote && earlySourceId && store.userStore?.isTreeFrozen?.(earlySourceId)) {
        earlyFrozen = await getFrozenTreeBundle(earlySourceId);
        if (!earlyFrozen?.treeJson) {
            store.userStore?.setTreeFrozen?.(earlySourceId, false);
            earlyFrozen = null;
        }
    }
    if (isCacheableRemote && !earlyFrozen?.treeJson) {
        earlyRemoteCache = earlySourceId ? await getTreeBundleCache(earlySourceId) : null;
        if (!earlyRemoteCache?.treeJson && nextUrlEarly) {
            earlyRemoteCache = await getTreeBundleCacheByUrl(nextUrlEarly);
        }
    }
    const hasInstantRemoteCopy = !!(earlyFrozen?.treeJson || earlyRemoteCache?.treeJson);

    store._treeHydrateStartedAt = Date.now();
    store._curriculumMountInFlight = true;

    /* Hand off composed trees before clearing the canvas / full-screen “cargando”. */
    if (isComposedTreeUrl) {
        if (switchedSource) {
            store.update({ searchCache: {} });
        }
        if (!store.state.i18nData) {
            await store.loadLanguage(store.state.lang);
        }
        try {
            return await mountComposedTree(store, source, forceRefresh);
        } finally {
            store._curriculumMountInFlight = false;
        }
    }

    const isLocalBranch = nextUrlEarly.startsWith('branch://');
    /*
     * Keep a warm canvas while reopening the same tree (boot remount, language
     * reload, demo seed, SWR). Blanking data + treeHydrating triggers the
     * fullscreen “Cargando árbol de conocimiento…” even when the graph was
     * already painted a moment earlier.
     */
    const keepGraphVisible =
        holdCurrentTreeDuringSwitch ||
        (!!snapBefore.data && !switchedSource) ||
        (hasInstantRemoteCopy && !switchedSource && !!snapBefore.data);
    const localFastOpen = isLocalBranch && !forceRefresh && !switchedSource;
    const softOpen = !forceRefresh;
    const softCachedRemote = hasInstantRemoteCopy && softOpen && !switchedSource;
    const showBlockingOverlay =
        !softOpen &&
        (explicitGrowingOverlay ||
            (!keepGraphVisible &&
                !localFastOpen &&
                !softCachedRemote &&
                !sourcesPickerOpen &&
                !hasInstantRemoteCopy &&
                !!(isRemoteSource || switchedSource)));

    const nextData =
        keepGraphVisible || (softOpen && !switchedSource && snapBefore.data) ? snapBefore.data : null;
    const nextRaw =
        keepGraphVisible || (softOpen && !switchedSource && snapBefore.rawGraphData)
            ? snapBefore.rawGraphData
            : null;
    /* Invariant: blanking the canvas always raises hydrating so the sky is never empty. */
    const blankingCanvas = !nextData;
    store.update({
        /*
         * Soft open keeps a warm canvas when possible. If the canvas blanks (first
         * mount, hard switch, cold soft-open), always show hydrating chrome — never
         * data:null + treeHydrating:false (empty sky).
         */
        treeHydrating: blankingCanvas
            ? true
            : softOpen
              ? false
              : !(keepGraphVisible || localFastOpen || softCachedRemote),
        treeGrowingOverlay: showBlockingOverlay,
        treeGrowingHint: null,
        error: null,
        activeSource: holdCurrentTreeDuringSwitch ? snapBefore.activeSource : source,
        data: nextData,
        rawGraphData: nextRaw,
        path: keepGraphVisible || (softOpen && !switchedSource && snapBefore.path?.length) ? snapBefore.path : [],
        selectedNode:
            keepGraphVisible || (softOpen && snapBefore.selectedNode)
                ? snapBefore.selectedNode
                : null,
        previewNode:
            keepGraphVisible || (softOpen && snapBefore.previewNode)
                ? snapBefore.previewNode
                : null,
        searchIndexStatus: 'idle',
        searchIndexError: null,
        treeContext:
            keepGraphVisible || (softOpen && store.state.treeContext)
                ? store.state.treeContext
                : null,
    });
    /* Avoid a blank paint frame when the graph stays up or soft/local open. */
    if (!softOpen && !keepGraphVisible && !localFastOpen) await yieldToPaint();

    let success = false;
    /** @type {{ source: object, connectPromise: Promise<unknown>|null }|null} */
    let swrRefresh = null;
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

        if (nextUrl.startsWith('branch://')) {
            await store.userStore?.ensureBranchesHydrated?.();
            const { json, finalSource: fs } = store.sourceManager.readBranchSync(source, {
                freshBranchId: opts?.freshBranchId,
            });
            graphJson = json;
            finalSource = fs;
        } else {
            if (earlyFrozen?.treeJson) {
                graphJson = earlyFrozen.treeJson;
                finalSource = {
                    ...source,
                    isFrozenCopy: true,
                    frozenAt: earlyFrozen.frozenAt || null,
                };
            }

            if (!graphJson) {
                const cached = earlyRemoteCache;
                const cacheAge = cached?.savedAt ? Date.now() - Number(cached.savedAt) : Infinity;
                const cacheFresh = cacheAge < TREE_BUNDLE_CACHE_FRESH_MS;
                if (cached?.treeJson) {
                    graphJson = cached.treeJson;
                    finalSource = {
                        ...source,
                        origin: cached.origin || source.origin,
                    };
                }

                /* Fresh cache may skip a blocking fetch, but always SWR in the
                 * background so republishes (icons, lesson bodies) replace the
                 * painted copy once the stamp differs. */
                const skipBlockingNetwork = !!graphJson && (!forceRefresh || cacheFresh);
                const connectPromise =
                    earlyConnectPromise ||
                    ensureConnectedNostr(store, { timeoutMs: nostrConnectTimeoutMs() });
                if (graphJson) {
                    swrRefresh = { source, connectPromise };
                }
                if (!skipBlockingNetwork && !graphJson) {
                    const ticket = ++store._networkLoadTicket;
                    let out;
                    try {
                        await connectPromise;
                        const paintSkeletonEarly = (skelBundle) => {
                            if (epoch !== store._curriculumMountEpoch) return;
                            if (ticket !== store._networkLoadTicket) return;
                            if (!skelBundle || typeof skelBundle !== 'object') return;
                            if (parseArboritoTreeBundle(skelBundle)) return;
                            let provisional = normalizeLoadedTreeJson(skelBundle, store, {
                                ...source,
                                origin: 'nostr',
                            });
                            if (!provisional) return;
                            const { tree: sanitized } = sanitizeImportedTreeJson(provisional);
                            provisional = sanitized;
                            if (!provisional) return;
                            if (epoch !== store._curriculumMountEpoch) return;
                            if (ticket !== store._networkLoadTicket) return;
                            const provisionalSource = {
                                ...source,
                                origin: 'nostr',
                                isTrusted: source.isTrusted === true,
                                shareCode:
                                    (skelBundle.meta && skelBundle.meta.shareCode) ||
                                    source.shareCode ||
                                    null,
                            };
                            DataProcessor.process(store, provisional, provisionalSource, {
                                suppressReadmeAutoOpen: true,
                                carryOverSelection: true,
                            });
                            /* Early skeleton is the loading UI — no fullscreen “Cargando…”. */
                            store.update({
                                treeGrowingOverlay: false,
                                treeHydrating: false,
                                treeGrowingHint: null,
                            });
                        };
                        out = await store.sourceManager.loadData(
                            source,
                            store.state.lang,
                            forceRefresh,
                            store.state.rawGraphData,
                            { onSkeleton: paintSkeletonEarly }
                        );
                    } catch (e) {
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
                        if (isUniverseRevokedError(e)) {
                            const ui = store.ui || {};
                            store.update({
                                error: String(
                                    (e && e.message) ||
                                        ui.nostrUniverseRevokedError ||
                                        e
                                ),
                                loading: false,
                                treeHydrating: false,
                                treeGrowingOverlay: false,
                            });
                            queueMicrotask(() => {
                                void promptStudentUniverseRevoked(store, {
                                    source,
                                    treeJson: earlyRemoteCache?.treeJson || null,
                                    keepViewingCached: false,
                                }).then(() => store.maybePromptNoTree());
                            });
                            return false;
                        }
                        store.update({
                            error: String((e && e.message) || e),
                            loading: false,
                        });
                        queueMicrotask(() => store.maybePromptNoTree());
                        return false;
                    }
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
                    if (
                        forceRefresh &&
                        (finalSource && finalSource.origin) === 'nostr' &&
                        parseNostrTreeUrl(String(finalSource.url || ''))
                    ) {
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
            success = await store.loadComposedTree(entry.id, !!forceRefresh);
            if (success && swrRefresh) {
                void refreshRemoteTreeBundleInBackground(store, swrRefresh.source, {
                    epoch,
                    connectPromise: swrRefresh.connectPromise,
                });
            }
            return success;
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

        const carryOverSelection =
            String(prevSourceId || '') === String((finalSource && finalSource.id) || '') ||
            (!!store.state.rawGraphData?.meta?.skeleton &&
                String(store.state.activeSource?.id || '') ===
                    String((finalSource && finalSource.id) || ''));
        const softMountPaint = isBibliotecaSoftMount();
        /* Soft-mount already shows trunk/comic — paint structure as soon as JSON is ready. */
        if (!softMountPaint) await yieldToPaint();
        DataProcessor.process(store, graphJson, finalSource, {
            suppressReadmeAutoOpen: !forceRefresh || !!store.state.rawGraphData?.meta?.skeleton,
            carryOverSelection
        });
        /* Pair + governance do not block first graph paint (especially soft-mount). */
        const postLoadParallel = [];
        if (!nextUrl.startsWith('branch://') && typeof store.ensureNetworkUserPair === 'function') {
            postLoadParallel.push(store.ensureNetworkUserPair());
        }
        if (typeof store.refreshTreeNetworkGovernance === 'function') {
            postLoadParallel.push(store.refreshTreeNetworkGovernance(finalSource));
        }
        if (postLoadParallel.length) {
            if (softMountPaint) {
                void Promise.all(postLoadParallel).catch(() => {
                    /* best-effort after paint */
                });
            } else {
                await Promise.all(postLoadParallel);
            }
        }
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
        try {
            if (isArboritoDemoTree(store) && ensureDemoProgressSyncOnline(store)) {
                void store.reconcileNetworkProgress?.();
            }
        } catch {
            /* ignore */
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
            /* Backfill Forest catalog emoji for installed online sources. */
            try {
                if (
                    (finalSource.origin === 'nostr' || parseNostrTreeUrl(String(finalSource.url || ''))) &&
                    typeof store.sourceManager?.patchCommunitySourceMeta === 'function'
                ) {
                    const icon = resolveDirectoryIconForPublish({ tree: store.state.rawGraphData });
                    if (icon) store.sourceManager.patchCommunitySourceMeta(finalSource.id, { icon });
                }
            } catch {
                /* ignore */
            }
        }
        if (
            isCacheableRemote &&
            !swrRefresh &&
            hasPendingUniverseRevokePrompt(finalSource || source)
        ) {
            /* No background refresh (e.g. frozen copy): surface pending notice now. */
            const pendingSource = finalSource || source;
            queueMicrotask(() => {
                if (!hasPendingUniverseRevokePrompt(pendingSource)) return;
                void promptStudentUniverseRevoked(store, {
                    source: pendingSource,
                    treeJson: store.state.rawGraphData,
                    keepViewingCached: true,
                });
            });
        }
        if (swrRefresh) {
            void refreshRemoteTreeBundleInBackground(store, swrRefresh.source, {
                epoch,
                connectPromise: swrRefresh.connectPromise,
            });
        }
        if (typeof store.maybeScheduleShellProductTourAfterTree === 'function') {
            queueMicrotask(() => store.maybeScheduleShellProductTourAfterTree());
        }
        queueMicrotask(() => {
            void import('../../garden-progress/api/share-certificate.js')
                .then((m) => {
                    try {
                        m.consumeCertificateShareParam?.(store);
                    } catch {
                        /* ignore */
                    }
                })
                .catch(() => {});
        });
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
        if (isUniverseRevokedError(e)) {
            store.update({
                error: String((e && e.message) || e),
                data: null,
                rawGraphData: null,
                loading: false,
                treeHydrating: true,
            });
            queueMicrotask(() => {
                void promptStudentUniverseRevoked(store, {
                    source,
                    treeJson: earlyRemoteCache?.treeJson || earlyFrozen?.treeJson || null,
                    keepViewingCached: false,
                }).then(() => store.maybePromptNoTree());
            });
            success = false;
        } else {
            store.update({
                error: String((e && e.message) || e),
                data: null,
                rawGraphData: null,
                loading: false,
                treeHydrating: true,
            });
            queueMicrotask(() => store.maybePromptNoTree());
            success = false;
        }
    } finally {
        store._curriculumMountInFlight = false;
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
                        /* Keep hydrating until demo remount paints — never bare empty sky. */
                        treeHydrating: true,
                        treeGrowingOverlay: false,
                        activeSource: null,
                        data: null,
                        rawGraphData: null,
                        path: [],
                        selectedNode: null,
                        previewNode: null,
                        lessonContentLoading: false,
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
                    /* Failed first mount: remount demo unless we *were* mounting the demo. */
                    const wasDemo =
                        String(source?.id || '') === DEMO_BRANCH_ID ||
                        String(source?.url || '') === `branch://${DEMO_BRANCH_ID}`;
                    if (!wasDemo) {
                        queueMicrotask(() => {
                            void store.ensureMinimumDemoMounted?.();
                        });
                    } else {
                        /* Demo itself failed — drop hydrating so we do not spin forever. */
                        store.update({ treeHydrating: false, treeGrowingOverlay: false });
                    }
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
                    } else {
                        queueMicrotask(() => {
                            void store.ensureMinimumDemoMounted?.();
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
                store.update({ treeHydrating: false, treeGrowingOverlay: false, treeGrowingHint: null });
                store._treeHydrateStartedAt = 0;
            }
        }
    }
    return success;
}
