/**
 * Single entry point to load a curriculum into the store.
 * The graph uses `treeHydrating`, not `loading` (that flag is for language, lessons, etc.).
 */

import { parseNostrTreeUrl } from '../services/nostr-refs.js';
import { isNostrTreeMaintainerBlocked } from '../config/maintainer-nostr-tree-blocklist.js';

import { DataProcessor } from '../utils/data-processor.js';
import { normalizeLoadedTreeJson } from '../utils/tree-load-pipeline.js';

/**
 * @param {import('../store.js').Store} store
 * @param {object|null} source
 * @param {boolean} [forceRefresh=true] same meaning as before: open readme/versions on “full” load
 * @returns {Promise<boolean>} true if the graph mounted (`DataProcessor.process` succeeded)
 */
export async function mountCurriculum(store, source, forceRefresh = true) {
    if (source == null) {
        if (typeof store.clearConstructionUndoStack === 'function') store.clearConstructionUndoStack();
        if (typeof store.syncNostrPresenceFromActiveSource === 'function') {
            store.syncNostrPresenceFromActiveSource(null);
        }
        try {
            localStorage.removeItem('arborito-active-source-id');
            localStorage.removeItem('arborito-active-source-meta');
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
            treeCollaboratorRoles: null
        });
        return false;
    }

    const nextUrlEarly = source.url != null ? String(source.url) : '';
    const treeRefBlock = !nextUrlEarly.startsWith('local://') ? parseNostrTreeUrl(nextUrlEarly) : null;
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
    const switchedSource = String(prevSourceId || '') !== String((source && source.id) || '');
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
    }
    if (typeof store.clearConstructionUndoStack === 'function') store.clearConstructionUndoStack();
    // While hydrating, ensure UI doesn't keep rendering stale tree presentation from the previous rawGraphData.
    // We set activeSource early for chrome (e.g. construction dock) but clear data/rawGraphData until DataProcessor finishes.
    store.update({
        treeHydrating: true,
        error: null,
        activeSource: source,
        data: null,
        rawGraphData: null,
        path: [],
        selectedNode: null,
        previewNode: null,
        searchIndexStatus: 'idle',
        searchIndexError: null
    });

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

        if (nextUrl.startsWith('local://')) {
            const { json, finalSource: fs } = store.sourceManager.readLocalTreeSync(source);
            graphJson = json;
            finalSource = fs;
        } else {
            const ticket = ++store._networkLoadTicket;
            let out;
            try {
                out = await store.sourceManager.loadData(
                    source,
                    store.state.lang,
                    forceRefresh,
                    store.state.rawGraphData
                );
            } catch (e) {
                if (ticket !== store._networkLoadTicket) return false;
                store.update({
                    error: String((e && e.message) || e),
                    loading: false
                });
                queueMicrotask(() => store.maybePromptNoTree());
                return false;
            }
            if (ticket !== store._networkLoadTicket) return false;
            graphJson = out.json;
            finalSource = out.finalSource;
            if (forceRefresh && (finalSource && finalSource.origin) === 'nostr' && parseNostrTreeUrl(String(finalSource.url || ''))) {
                store._treeForumHydratedForSourceId = null;
            }
        }

        graphJson = normalizeLoadedTreeJson(graphJson, store, finalSource);
        if (!graphJson) {
            const ui = store.ui || {};
            store.update({
                loading: false,
                error:
                    ui.curriculumLoadInvalidTreeJson ||
                    ui.nostrLoadFailedError ||
                    'Could not load this tree (invalid or empty data).'
            });
            return false;
        }

        const postLoadParallel = [];
        if (!nextUrl.startsWith('local://') && typeof store.ensureNetworkUserPair === 'function') {
            postLoadParallel.push(store.ensureNetworkUserPair());
        }
        if (typeof store.refreshTreeNetworkGovernance === 'function') {
            postLoadParallel.push(store.refreshTreeNetworkGovernance(finalSource));
        }
        if (postLoadParallel.length) await Promise.all(postLoadParallel);
        const carryOverSelection =
            String(prevSourceId || '') === String((finalSource && finalSource.id) || '');
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
        success = true;
        if (typeof store.maybeScheduleShellProductTourAfterTree === 'function') {
            queueMicrotask(() => store.maybeScheduleShellProductTourAfterTree());
        }
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
                if (switchedSource) {
                    /** Do not show another course as if it were the one the user chose; revert link + empty canvas. */
                    store.update({
                        treeHydrating: false,
                        activeSource: snapBefore.activeSource,
                        data: null,
                        rawGraphData: null,
                        path: [],
                        selectedNode: null,
                        previewNode: null,
                        ...(err ? { error: err } : {})
                    });
                    try {
                        const prev = snapBefore.activeSource;
                        if (prev && prev.id) {
                            localStorage.setItem('arborito-active-source-id', prev.id);
                            localStorage.setItem('arborito-active-source-meta', JSON.stringify(prev));
                        } else {
                            localStorage.removeItem('arborito-active-source-id');
                            localStorage.removeItem('arborito-active-source-meta');
                        }
                    } catch {
                        /* ignore */
                    }
                } else {
                    store.update({
                        treeHydrating: false,
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
                store.update({ treeHydrating: false });
            }
        }
    }
    return success;
}
