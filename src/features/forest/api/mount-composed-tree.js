/**
 * Mount a composed tree (árbol), collection of branch refs.
 */

import { DataProcessor } from '../../tree-graph/api/data-processor.js';
import { normalizeLoadedTreeJson } from '../../tree-graph/api/tree-load-pipeline.js';
import { composeTreeGraph, composeTreeGraphPlaceholder } from './compose-tree-graph.js';
import {
    buildComposedGraphFingerprint,
    getComposedGraphCache,
    getLatestComposedGraphCacheForTree,
    putComposedGraphCache,
} from './composed-graph-cache.js';
import { parseNostrTreeUrl, formatNostrTreeUrl } from '../../nostr/api/nostr-refs.js';
import { yieldToPaint } from '../../../shared/lib/yield-to-paint.js';
import { runThrottledBackgroundTask } from '../../../shared/lib/background-task-gate.js';
import { getPanelRef } from '../../../app/panel-refs.js';
import { resetSageChatForSourceChange } from '../../../stores/learning-store-actions.js';
import { ensureConnectedNostr } from '../../../shared/lib/connected-services/index.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { deepCloneJson } from '../../../shared/lib/deep-clone-json.js';
import {
    getTreeBundleCachesForUrls,
    putTreeBundleCache,
    TREE_BUNDLE_CACHE_FRESH_MS,
} from '../../sources/api/tree-bundle-cache.js';
import { shouldSuppressTreeGrowingBlock, isBibliotecaUiOpen, isBibliotecaSoftMount } from '../../sources/api/sources-session.js';

/**
 * Normalize branch curriculum JSON from local store or Nostr bundle.
 * @param {object} json
 */
function normalizeBranchDataFromLoad(json) {
    if (!json || typeof json !== 'object') return json;
    if (json.languages && typeof json.languages === 'object') return json;
    if (json.tree?.languages && typeof json.tree.languages === 'object') return json.tree;
    return json;
}

function stampDiscoverMeta(graphJson, treeEntry) {
    if (!treeEntry?.publishedNetworkUrl || !graphJson) return;
    graphJson.meta = graphJson.meta && typeof graphJson.meta === 'object' ? graphJson.meta : {};
    if (Object.prototype.hasOwnProperty.call(treeEntry, 'publishedListInDiscover')) {
        graphJson.meta.listInDiscover = treeEntry.publishedListInDiscover !== false;
    } else if (!Object.prototype.hasOwnProperty.call(graphJson.meta, 'listInDiscover')) {
        graphJson.meta.listInDiscover = true;
    }
    if (Object.prototype.hasOwnProperty.call(treeEntry, 'publishedForumEnabled')) {
        graphJson.meta.forumEnabled = treeEntry.publishedForumEnabled === true;
    }
}

function refNostrUrl(ref) {
    const sourceUrl = String(ref?.sourceUrl || ref?.networkUrl || '').trim();
    if (sourceUrl.startsWith('nostr://') || parseNostrTreeUrl(sourceUrl)) return sourceUrl;
    return '';
}

function cacheKeyForUrl(url) {
    const g = parseNostrTreeUrl(url);
    if (g) return formatNostrTreeUrl(g.pub, g.universeId);
    return String(url || '').trim();
}

/**
 * Local garden branch published at the same Nostr URL as a composed-tree member ref.
 * @param {import('../../../core/store.js' ).Store} store
 * @param {string} nostrUrl
 */
function findLocalBranchByNetworkUrl(store, nostrUrl) {
    const key = cacheKeyForUrl(nostrUrl);
    if (!key) return null;
    const branches = store.userStore?.state?.branches || [];
    for (const b of branches) {
        if (!b?.data) continue;
        const pub = String(b.publishedNetworkUrl || '').trim();
        if (pub && cacheKeyForUrl(pub) === key) return b;
        /* branchId on remote refs is often the universe id */
        const g = parseNostrTreeUrl(nostrUrl);
        if (g && String(b.id) === String(g.universeId)) return b;
    }
    return null;
}

/**
 * Resolve a member ref from local garden / IndexedDB without network.
 * @returns {{ ref: object, data: object, skeleton: boolean, fromCache?: boolean } | null}
 */
function resolveBranchOffline(store, ref, cacheRow) {
    const branchId = String(ref.branchId || '').trim();
    const sourceUrl = String(ref.sourceUrl || ref.networkUrl || '').trim();
    const nostrUrl = refNostrUrl(ref);

    if (sourceUrl.startsWith('branch://') || branchId) {
        const id = branchId || sourceUrl.slice('branch://'.length).split('/')[0];
        const entry = store.userStore.state.branches?.find((b) => b.id === id);
        if (entry?.data) {
            return {
                ref: { ...ref, branchId: id, refId: ref.refId || id, sourceUrl: `branch://${id}` },
                data: entry.data,
                skeleton: false,
            };
        }
    }

    if (nostrUrl) {
        const local = findLocalBranchByNetworkUrl(store, nostrUrl);
        if (local?.data) {
            return {
                ref: {
                    ...ref,
                    branchId: local.id,
                    refId: ref.refId || local.id,
                    sourceUrl: `branch://${local.id}`,
                    networkUrl: nostrUrl,
                },
                data: local.data,
                skeleton: false,
            };
        }
        if (cacheRow?.treeJson) {
            const data = normalizeBranchDataFromLoad(cacheRow.treeJson);
            if (data?.languages && typeof data.languages === 'object') {
                const isSkel = cacheRow.treeJson?.meta?.skeleton === true;
                return {
                    ref: { ...ref, refId: ref.refId || cacheRow.sourceId || branchId || nostrUrl },
                    data,
                    skeleton: isSkel,
                    fromCache: true,
                };
            }
        }
    }
    return null;
}

/**
 * Load branch curriculum for a ref entry (network path).
 * @param {import('../../../core/store.js' ).Store} store
 * @param {object} ref
 * @param {{
 *   onProvisional?: (payload: { ref: object, data: object, skeleton: boolean }) => void,
 * }} [opts]
 */
async function loadBranchPayloadFromNetwork(store, ref, opts = {}) {
    const nostrUrl = refNostrUrl(ref);
    if (!nostrUrl) {
        throw new Error(`Cannot resolve branch ref: ${ref.displayName || ref.branchId || ''}`);
    }
    const branchId = String(ref.branchId || '').trim();
    const src =
        store.state.communitySources?.find(
            (s) =>
                cacheKeyForUrl(String(s.url || '')) === cacheKeyForUrl(nostrUrl) ||
                String(s.id) === String(ref.communityId || '')
        ) || {
            id: ref.communityId || branchId || nostrUrl,
            url: nostrUrl,
            type: 'community',
            name: ref.displayName || '',
            shareCode: String(ref.shareCode || '').trim() || undefined,
        };
    if (!src.shareCode && ref.shareCode) src.shareCode = String(ref.shareCode).trim();

    const resolvedRef = { ...ref, refId: ref.refId || src.id, networkUrl: nostrUrl, sourceUrl: nostrUrl };
    let provisionalSent = false;
    const out = await store.sourceManager.loadData(src, store.state.lang, false, null, {
        onSkeleton: (skel) => {
            if (provisionalSent || typeof opts.onProvisional !== 'function') return;
            const data = normalizeBranchDataFromLoad(skel);
            if (!data?.languages || typeof data.languages !== 'object') return;
            provisionalSent = true;
            opts.onProvisional({
                ref: resolvedRef,
                data,
                skeleton: true,
            });
        },
    });
    const data = normalizeBranchDataFromLoad(out.json);
    if (data && out.finalSource?.id) {
        void putTreeBundleCache(String(out.finalSource.id), {
            treeJson: data,
            url: nostrUrl,
            origin: 'nostr',
        });
    }
    return {
        ref: resolvedRef,
        data,
        skeleton: false,
    };
}

/**
 * @param {import('../../../core/store.js' ).Store} store
 * @param {object} source - { treeId, name, type: 'composed-tree', url: 'tree://…' }
 * @param {boolean} [forceRefresh=true]
 */
export async function mountComposedTree(store, source, forceRefresh = true) {
    await store.ensureCoreReady();
    const treeId = String(source.treeId || source.id || '').trim();
    if (!treeId) return false;

    const hydratePromise = store.userStore.ensureBranchesHydrated();
    /* Peek entry early if trees catalog is already warm; otherwise after hydrate. */
    let treeEntry = store.userStore.getTree(treeId);
    if (!treeEntry) {
        await hydratePromise;
        treeEntry = store.userStore.getTree(treeId);
    }
    if (!treeEntry) {
        store.update({ treeHydrating: false, error: 'Tree not found.' });
        return false;
    }

    try {
        const contentApi = getPanelRef('content');
        if (typeof contentApi?.confirmLeaveIfNeeded === 'function') {
            const ok = await contentApi.confirmLeaveIfNeeded();
            if (!ok) return false;
        }
    } catch {
        /* ignore */
    }

    let refs = Array.isArray(treeEntry.branchRefs) ? treeEntry.branchRefs : [];
    if (!refs.length) {
        store.update({
            treeHydrating: false,
            error: store.ui.emptyTreeNoBranches || 'This tree has no branches yet.',
        });
        return false;
    }

    const sameTreeAlreadyOpen =
        store.state.activeSource?.type === 'composed-tree' &&
        String(store.state.activeSource.treeId || '') === treeId &&
        !!store.state.data;

    /*
     * Same-session reopen: paint the last composed graph from RAM before hydrate/IDB.
     * Avoids trunk comic + multi-second wait when the user already opened this playlist.
     */
    const warmHit = !forceRefresh ? getLatestComposedGraphCacheForTree(treeId) : null;
    if (warmHit?.graphJson && !sameTreeAlreadyOpen) {
        const epoch = ++store._curriculumMountEpoch;
        const prevSourceId =
            store.state?.activeSource?.id != null ? String(store.state.activeSource.id) : '';
        const switchedSource = !!prevSourceId && prevSourceId !== treeId;
        if (switchedSource) resetSageChatForSourceChange(store);

        const finalSource = {
            ...source,
            id: treeId,
            treeId,
            type: 'composed-tree',
            url: `tree://${treeId}`,
            name: treeEntry.name,
        };
        store.update({
            treeHydrating: false,
            treeGrowingOverlay: false,
            treeGrowingHint: null,
            error: null,
            activeSource: { ...source, treeId, type: 'composed-tree', name: treeEntry.name },
        });

        const graphJson = warmHit.graphJson;
        stampDiscoverMeta(graphJson, treeEntry);
        graphJson.meta = graphJson.meta && typeof graphJson.meta === 'object' ? graphJson.meta : {};
        delete graphJson.meta.skeleton;

        const normalized = normalizeLoadedTreeJson(graphJson, store, finalSource);
        const treeContext = {
            kind: 'composed-tree',
            treeId,
            singleBranch: !!warmHit.singleBranch,
            virtualRootId: warmHit.virtualRootId,
            branchRefId: null,
            activeBranchRefId: null,
        };
        store.state.treeContext = treeContext;
        DataProcessor.process(store, normalized, finalSource, {
            suppressReadmeAutoOpen: true,
            carryOverSelection: false,
        });
        if (epoch !== store._curriculumMountEpoch) return false;
        store._composedMountFingerprint = warmHit.fingerprint;
        store.update({
            treeContext,
            treeHydrating: false,
            treeGrowingOverlay: false,
            treeGrowingHint: null,
        });
        queueMicrotask(() => {
            try {
                store.dispatchEvent(new CustomEvent('graph-update'));
            } catch {
                /* ignore */
            }
        });

        /* Quiet reconcile: refresh members if hydrate/IDB now differs. */
        void (async () => {
            try {
                const nostrUrls = refs.map(refNostrUrl).filter(Boolean);
                const [, cacheByUrl] = await Promise.all([
                    hydratePromise,
                    nostrUrls.length
                        ? getTreeBundleCachesForUrls(nostrUrls)
                        : Promise.resolve(new Map()),
                ]);
                if (epoch !== store._curriculumMountEpoch) return;
                treeEntry = store.userStore.getTree(treeId) || treeEntry;
                refs = Array.isArray(treeEntry.branchRefs) ? treeEntry.branchRefs : refs;
                const offlinePayloads = refs.map((ref) => {
                    const url = refNostrUrl(ref);
                    const cacheRow = url ? cacheByUrl.get(cacheKeyForUrl(url)) || null : null;
                    return resolveBranchOffline(store, ref, cacheRow);
                });
                const allOfflineFull =
                    offlinePayloads.every(Boolean) &&
                    offlinePayloads.every((p) => p && !p.skeleton);
                if (!allOfflineFull) return;
                const fp = buildComposedGraphFingerprint(
                    store,
                    treeEntry,
                    store.state.lang,
                    offlinePayloads
                );
                if (!fp || fp === warmHit.fingerprint) {
                    store._composedMountFingerprint = fp || warmHit.fingerprint;
                    return;
                }
                if (epoch !== store._curriculumMountEpoch) return;

                /*
                 * Hydrate often replaces branch.data object identity → fingerprint
                 * tokens churn without content change. Re-key the warm graph instead
                 * of recomposing (avoids a second paint flash on every reopen).
                 */
                const warmParts = String(warmHit.fingerprint || '').split('|');
                const structuralSame =
                    warmParts.length >= 5 &&
                    String(treeEntry?.updated || 0) === warmParts[1] &&
                    String(treeEntry?.name || '') === warmParts[2] &&
                    String(store.state.lang || '').toUpperCase() === warmParts[3] &&
                    String(refs.length) === warmParts[4];
                if (structuralSame) {
                    const prev = getComposedGraphCache(warmHit.fingerprint);
                    if (prev?.graphJson) {
                        putComposedGraphCache(fp, {
                            graphJson: prev.graphJson,
                            singleBranch: !!prev.singleBranch,
                            virtualRootId: prev.virtualRootId,
                        });
                    }
                    store._composedMountFingerprint = fp;
                    return;
                }

                let graphJson;
                let singleBranch;
                let virtualRootId;
                const cached = getComposedGraphCache(fp);
                if (cached) {
                    graphJson = cached.graphJson;
                    singleBranch = cached.singleBranch;
                    virtualRootId = cached.virtualRootId;
                } else {
                    const composed = composeTreeGraph({
                        treeEntry,
                        branchPayloads: offlinePayloads.map((p) => ({
                            ref: p.ref,
                            data: p.data,
                        })),
                        lang: store.state.lang,
                    });
                    singleBranch = composed.singleBranch;
                    virtualRootId = composed.virtualRootId;
                    if (composed.graphJson) {
                        putComposedGraphCache(fp, {
                            graphJson: composed.graphJson,
                            singleBranch: !!singleBranch,
                            virtualRootId,
                        });
                        graphJson = deepCloneJson(composed.graphJson);
                    } else {
                        graphJson = composed.graphJson;
                    }
                }
                if (!graphJson || epoch !== store._curriculumMountEpoch) return;
                stampDiscoverMeta(graphJson, treeEntry);
                graphJson.meta =
                    graphJson.meta && typeof graphJson.meta === 'object' ? graphJson.meta : {};
                delete graphJson.meta.skeleton;
                const normalized = normalizeLoadedTreeJson(graphJson, store, finalSource);
                const treeContext = {
                    kind: 'composed-tree',
                    treeId,
                    singleBranch: !!singleBranch,
                    virtualRootId,
                    branchRefId: null,
                    activeBranchRefId: null,
                };
                store.state.treeContext = treeContext;
                DataProcessor.process(store, normalized, finalSource, {
                    suppressReadmeAutoOpen: true,
                    carryOverSelection: true,
                });
                if (epoch !== store._curriculumMountEpoch) return;
                store._composedMountFingerprint = fp;
                store.update({
                    treeContext,
                    treeHydrating: false,
                    treeGrowingOverlay: false,
                    treeGrowingHint: null,
                });
            } catch (e) {
                console.warn('[Arborito] warm composed reopen reconcile', e);
            }
        })();

        void runThrottledBackgroundTask(
            `tree-maintain:${treeId}`,
            async () => {
                try {
                    const { autoMaintainPublishedComposedTree } = await import(
                        '../../publishing/api/published-entry-auto-maintain.js'
                    );
                    await autoMaintainPublishedComposedTree(store, treeId);
                } catch (e) {
                    console.warn('[Arborito] autoMaintainPublishedComposedTree', e);
                }
            },
            { oncePerSession: true, minIntervalMs: 8000 }
        );

        try {
            store.publishInstalledSourcesForAccount?.({ immediate: true });
        } catch {
            /* ignore */
        }
        return !!store.state.data;
    }

    const nostrUrls = refs.map(refNostrUrl).filter(Boolean);
    /* Local-only playlists never need the remote bundle IDB scan. */
    const [, cacheByUrl] = await Promise.all([
        hydratePromise,
        nostrUrls.length ? getTreeBundleCachesForUrls(nostrUrls) : Promise.resolve(new Map()),
    ]);
    /* Re-read entry after hydrate in case catalog finished loading. */
    treeEntry = store.userStore.getTree(treeId) || treeEntry;
    refs = Array.isArray(treeEntry.branchRefs) ? treeEntry.branchRefs : refs;

    const offlinePayloads = refs.map((ref) => {
        const url = refNostrUrl(ref);
        const cacheRow = url ? cacheByUrl.get(cacheKeyForUrl(url)) || null : null;
        return resolveBranchOffline(store, ref, cacheRow);
    });
    const allOffline = offlinePayloads.every(Boolean);
    const allOfflineFull = allOffline && offlinePayloads.every((p) => p && !p.skeleton);

    const composeFingerprint = allOfflineFull
        ? buildComposedGraphFingerprint(store, treeEntry, store.state.lang, offlinePayloads)
        : '';

    /* Already painted this exact playlist+members — same cost as re-tapping an open branch. */
    if (
        allOfflineFull &&
        sameTreeAlreadyOpen &&
        !forceRefresh &&
        composeFingerprint &&
        store._composedMountFingerprint === composeFingerprint
    ) {
        store.update({
            treeHydrating: false,
            treeGrowingOverlay: false,
            treeGrowingHint: null,
            error: null,
            activeSource: { ...source, treeId, type: 'composed-tree', name: treeEntry.name },
        });
        return true;
    }

    const epoch = ++store._curriculumMountEpoch;
    const prevSourceId = store.state?.activeSource?.id != null ? String(store.state.activeSource.id) : '';
    const switchedSource = !!prevSourceId && prevSourceId !== treeId;
    if (switchedSource) resetSageChatForSourceChange(store);
    const sourcesPickerOpen = shouldSuppressTreeGrowingBlock(store);

    /* Reopen with local/cache: keep the painted graph; never blank a warm canvas.
     * Soft-mount onto a different tree with no offline copy: clear so trunk/comic
     * cover until the first structure paints. */
    const clearGraph =
        !sameTreeAlreadyOpen &&
        !allOfflineFull &&
        (!!forceRefresh || (switchedSource && !isBibliotecaUiOpen(store) && !allOffline));
    const softOpen = !forceRefresh;
    const showOverlay = !softOpen && clearGraph && !sourcesPickerOpen;
    /*
     * Soft open (boot / reopen): do not raise treeHydrating before the first
     * paint — with an empty canvas that used to become the fullscreen green modal.
     * Soft-mount onto another tree: keep hydrating so Graph shows trunk/comic.
     */

    store.update({
        treeHydrating:
            softOpen && switchedSource && clearGraph
                ? true
                : softOpen
                  ? false
                  : !allOfflineFull,
        treeGrowingOverlay: showOverlay,
        error: null,
        activeSource: { ...source, treeId, type: 'composed-tree', name: treeEntry.name },
        ...(clearGraph
            ? {
                  data: null,
                  rawGraphData: null,
                  path: [],
                  selectedNode: null,
                  previewNode: null,
                  treeContext: null,
                  lessonContentLoading: false,
              }
            : {}),
    });
    /* Soft-mount / soft open already painted chrome — skip paint yield. */
    if (!allOfflineFull && !softOpen && !isBibliotecaSoftMount()) await yieldToPaint();

    void runThrottledBackgroundTask(
        `tree-maintain:${treeId}`,
        async () => {
            try {
                const { autoMaintainPublishedComposedTree } = await import(
                    '../../publishing/api/published-entry-auto-maintain.js'
                );
                await autoMaintainPublishedComposedTree(store, treeId);
            } catch (e) {
                console.warn('[Arborito] autoMaintainPublishedComposedTree', e);
            }
        },
        { oncePerSession: true, minIntervalMs: 8000 }
    );

    const finalSource = {
        ...source,
        id: treeId,
        treeId,
        type: 'composed-tree',
        url: `tree://${treeId}`,
        name: treeEntry.name,
    };

    const paintGraph = async (branchPayloads, { skeleton, fingerprint = '' }) => {
        if (epoch !== store._curriculumMountEpoch) return false;

        let graphJson;
        let singleBranch;
        let virtualRootId;
        const cacheKey = !skeleton && fingerprint ? fingerprint : '';
        const cached = cacheKey ? getComposedGraphCache(cacheKey) : null;
        if (cached) {
            graphJson = cached.graphJson;
            singleBranch = cached.singleBranch;
            virtualRootId = cached.virtualRootId;
        } else {
            const composed = composeTreeGraph({
                treeEntry,
                branchPayloads,
                lang: store.state.lang,
            });
            singleBranch = composed.singleBranch;
            virtualRootId = composed.virtualRootId;
            if (cacheKey && composed.graphJson) {
                /* Cache keeps the pristine compose; process gets a detached copy. */
                putComposedGraphCache(cacheKey, {
                    graphJson: composed.graphJson,
                    singleBranch: !!singleBranch,
                    virtualRootId,
                });
                graphJson = deepCloneJson(composed.graphJson);
            } else {
                graphJson = composed.graphJson;
            }
        }

        stampDiscoverMeta(graphJson, treeEntry);
        graphJson.meta = graphJson.meta && typeof graphJson.meta === 'object' ? graphJson.meta : {};
        if (skeleton) graphJson.meta.skeleton = true;
        else delete graphJson.meta.skeleton;

        const normalized = normalizeLoadedTreeJson(graphJson, store, finalSource);
        const treeContext = {
            kind: 'composed-tree',
            treeId,
            singleBranch: !!singleBranch,
            virtualRootId,
            branchRefId: singleBranch ? branchPayloads[0]?.ref?.refId || null : null,
            activeBranchRefId: null,
        };
        store.state.treeContext = treeContext;

        DataProcessor.process(store, normalized, finalSource, {
            suppressReadmeAutoOpen: true,
            carryOverSelection: skeleton || (!forceRefresh && !switchedSource) || sameTreeAlreadyOpen,
        });
        if (epoch !== store._curriculumMountEpoch) return false;
        if (!skeleton && fingerprint) store._composedMountFingerprint = fingerprint;
        store.update({
            treeContext,
            treeGrowingOverlay: false,
            /* Skeleton on canvas is the loading UI — no “Cargando…” chrome on top. */
            treeHydrating: false,
            treeGrowingHint: null,
        });
        /* DataProcessor.process is sync and returns void; success = graph mounted. */
        return !!store.state.data;
    };

    const finishOk = (ok) => {
        if (epoch !== store._curriculumMountEpoch) return false;
        store.update({ treeHydrating: false, treeGrowingOverlay: false, treeGrowingHint: null });
        if (ok) {
            queueMicrotask(() => {
                try {
                    store.dispatchEvent(new CustomEvent('graph-update'));
                } catch {
                    /* ignore */
                }
            });
            try {
                store.publishInstalledSourcesForAccount?.({ immediate: true });
            } catch {
                /* ignore */
            }
        }
        return ok;
    };

    try {
        /* Prefer branch:// on disk so the next open skips Nostr URL matching.
         * Defer IDB persist off the open path — rewrite refs in memory immediately. */
        const rewritten = offlinePayloads
            .map((p) => (p && String(p.ref?.sourceUrl || '').startsWith('branch://') ? p.ref : null))
            .filter(Boolean);
        if (rewritten.length === refs.length) {
            const changed = refs.some((r, i) => {
                const n = rewritten[i];
                return (
                    String(r.branchId || '') !== String(n.branchId || '') ||
                    String(r.sourceUrl || '') !== String(n.sourceUrl || '')
                );
            });
            if (changed) {
                treeEntry.branchRefs = rewritten.map((r) => ({ ...r }));
                refs = treeEntry.branchRefs;
                queueMicrotask(() => {
                    try {
                        store.userStore.updateTree(
                            treeId,
                            { branchRefs: rewritten },
                            { touchUpdated: false }
                        );
                    } catch {
                        /* ignore */
                    }
                });
            }
        }

        /* Instant reopen: every member already local or fully cached.
         * Do not SWR-refresh from Nostr on ordinary open/boot — that re-paints
         * after the graph is already up and feels like “loaded → loading…”. */
        if (allOfflineFull) {
            const ok = await paintGraph(
                offlinePayloads.map((p) => ({ ref: p.ref, data: p.data })),
                { skeleton: false, fingerprint: composeFingerprint }
            );
            return finishOk(ok);
        }

        /* Partial offline: paint what we have, fetch the rest. */
        if (allOffline) {
            await paintGraph(
                offlinePayloads.map((p) => ({ ref: p.ref, data: p.data })),
                { skeleton: offlinePayloads.some((p) => p.skeleton) }
            );
        } else {
            try {
                const placeholder = composeTreeGraphPlaceholder({
                    treeEntry,
                    lang: store.state.lang,
                });
                stampDiscoverMeta(placeholder.graphJson, treeEntry);
                const normalized = normalizeLoadedTreeJson(placeholder.graphJson, store, finalSource);
                const treeContext = {
                    kind: 'composed-tree',
                    treeId,
                    singleBranch: !!placeholder.singleBranch,
                    virtualRootId: placeholder.virtualRootId,
                    branchRefId: null,
                    activeBranchRefId: null,
                };
                store.state.treeContext = treeContext;
                await DataProcessor.process(store, normalized, finalSource, {
                    suppressReadmeAutoOpen: true,
                    carryOverSelection: true,
                });
                if (epoch === store._curriculumMountEpoch) {
                    store.update({
                        treeContext,
                        treeGrowingOverlay: false,
                        /* Placeholder is already on canvas — quiet network fill. */
                        treeHydrating: false,
                        treeGrowingHint: null,
                    });
                }
            } catch (e) {
                console.warn('[Arborito] composed tree placeholder paint failed', e);
            }
        }

        if (nostrUrls.length) {
            await ensureConnectedNostr(store, {
                timeoutMs: shouldShowMobileUI() ? 20000 : 12000,
            }).catch(() => null);
        }
        if (epoch !== store._curriculumMountEpoch) return false;

        const slots = offlinePayloads.map((p) => p);
        let resolveSlotsFilled = null;
        const slotsFilled = new Promise((resolve) => {
            resolveSlotsFilled = resolve;
        });
        if (slots.every(Boolean)) resolveSlotsFilled?.();

        let structurePainted = allOffline;
        let paintChain = Promise.resolve();

        const queueStructurePaint = () => {
            if (epoch !== store._curriculumMountEpoch) return;
            if (structurePainted) return;
            if (!slots.every(Boolean)) return;
            paintChain = paintChain.then(async () => {
                if (epoch !== store._curriculumMountEpoch) return;
                if (structurePainted) return;
                structurePainted = true;
                await paintGraph(
                    slots.map((s) => ({ ref: s.ref, data: s.data })),
                    { skeleton: slots.some((s) => s.skeleton) }
                );
            });
        };

        const putSlot = (i, payload) => {
            if (!payload?.data) return;
            if (slots[i] && slots[i].skeleton === false && payload.skeleton) return;
            slots[i] = payload;
            if (slots.every(Boolean)) {
                resolveSlotsFilled?.();
                queueStructurePaint();
            }
        };

        const fullLoads = refs.map((ref, i) => {
            if (slots[i] && slots[i].skeleton === false && !slots[i].fromCache) {
                return Promise.resolve(slots[i]);
            }
            /* Fresh full cache: keep offline payload; optional network only when forceRefresh. */
            if (slots[i] && slots[i].skeleton === false && slots[i].fromCache && !forceRefresh) {
                const age =
                    Date.now() -
                    (Number(cacheByUrl.get(cacheKeyForUrl(refNostrUrl(ref) || ''))?.savedAt) || 0);
                if (age < TREE_BUNDLE_CACHE_FRESH_MS) {
                    return Promise.resolve(slots[i]);
                }
            }
            if (!refNostrUrl(ref) && slots[i]) {
                return Promise.resolve(slots[i]);
            }
            return loadBranchPayloadFromNetwork(store, ref, {
                onProvisional: (payload) => putSlot(i, payload),
            })
                .then((full) => {
                    putSlot(i, full);
                    return full;
                })
                .catch((e) => {
                    console.warn(
                        '[Arborito] composed branch load failed',
                        ref?.displayName || ref?.branchId,
                        e
                    );
                    if (slots[i]) return slots[i];
                    throw e;
                });
        });

        await Promise.race([slotsFilled, Promise.allSettled(fullLoads)]);
        queueStructurePaint();
        await paintChain;
        if (epoch !== store._curriculumMountEpoch) return false;

        const finishFull = async () => {
            const settled = await Promise.allSettled(fullLoads);
            if (epoch !== store._curriculumMountEpoch) return false;
            const okPayloads = [];
            for (let i = 0; i < settled.length; i++) {
                if (settled[i].status === 'fulfilled' && settled[i].value?.data) {
                    okPayloads.push({ ref: settled[i].value.ref, data: settled[i].value.data });
                } else if (slots[i]?.data) {
                    okPayloads.push({ ref: slots[i].ref, data: slots[i].data });
                }
            }
            if (!okPayloads.length) {
                throw new Error(store.ui.emptyTreeNoBranches || 'Could not load tree branches.');
            }
            const fp = buildComposedGraphFingerprint(store, treeEntry, store.state.lang, okPayloads);
            const ok = await paintGraph(okPayloads, { skeleton: false, fingerprint: fp });
            return finishOk(ok);
        };

        if (slots.every((s) => s && s.skeleton === false)) {
            return finishFull();
        }

        void finishFull().catch((e) => {
            console.warn('[Arborito] composed tree full upgrade failed', e);
            if (epoch === store._curriculumMountEpoch) {
                store.update({
                    treeHydrating: false,
                    treeGrowingOverlay: false,
                    treeGrowingHint: null,
                });
            }
        });
        return true;
    } catch (e) {
        console.error('[Arborito] mountComposedTree failed', e);
        if (epoch === store._curriculumMountEpoch) {
            store.update({
                treeHydrating: false,
                treeGrowingOverlay: false,
                treeGrowingHint: null,
                error: String((e && e.message) || e),
            });
        }
        return false;
    }
}
