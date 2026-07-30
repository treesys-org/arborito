/**
 * Mount a composed tree (árbol), collection of branch refs.
 */

import { DataProcessor } from '../../tree-graph/api/data-processor.js';
import { normalizeLoadedTreeJson } from '../../tree-graph/api/tree-load-pipeline.js';
import { composeTreeGraph, composeTreeGraphPlaceholder } from './compose-tree-graph.js';
import { parseNostrTreeUrl } from '../../nostr/api/nostr-refs.js';
import { yieldToPaint } from '../../../shared/lib/yield-to-paint.js';
import { runThrottledBackgroundTask } from '../../../shared/lib/background-task-gate.js';
import { getPanelRef } from '../../../app/panel-refs.js';
import { resetSageChatForSourceChange } from '../../../stores/learning-store-actions.js';

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

/**
 * Load branch curriculum for a ref entry.
 * @param {import('../../../core/store.js' ).Store} store
 * @param {object} ref
 * @param {{ onProvisional?: (payload: { ref: object, data: object, skeleton: boolean }) => void }} [opts]
 */
async function loadBranchPayloadForRef(store, ref, opts = {}) {
    const branchId = String(ref.branchId || '').trim();
    const sourceUrl = String(ref.sourceUrl || ref.networkUrl || '').trim();
    const nostrUrl =
        sourceUrl.startsWith('nostr://') || parseNostrTreeUrl(sourceUrl) ? sourceUrl : '';

    if (sourceUrl.startsWith('branch://') || branchId) {
        await store.userStore.ensureBranchesHydrated();
        const id = branchId || sourceUrl.slice('branch://'.length).split('/')[0];
        const entry = store.userStore.state.branches.find((b) => b.id === id);
        if (entry?.data) {
            return {
                ref: { ...ref, branchId: id, refId: ref.refId || id },
                data: entry.data,
                skeleton: false,
            };
        }
        /* Remote composed trees often set branchId to the remote universe id.
         * If we also have a nostr URL, load from the network instead of failing. */
        if (!nostrUrl) {
            throw new Error(`Branch not found: ${id}`);
        }
    }

    if (nostrUrl) {
        const src =
            store.state.communitySources?.find(
                (s) => String(s.url) === nostrUrl || String(s.id) === String(ref.communityId || '')
            ) || {
                id: ref.communityId || branchId,
                url: nostrUrl,
                type: 'community',
                name: ref.displayName || '',
            };
        let provisionalSent = false;
        const out = await store.sourceManager.loadData(src, store.state.lang, false, null, {
            onSkeleton: (skel) => {
                if (provisionalSent || typeof opts.onProvisional !== 'function') return;
                const data = normalizeBranchDataFromLoad(skel);
                if (!data?.languages || typeof data.languages !== 'object') return;
                provisionalSent = true;
                opts.onProvisional({
                    ref: { ...ref, refId: ref.refId || src.id },
                    data,
                    skeleton: true,
                });
            },
        });
        return {
            ref: { ...ref, refId: ref.refId || src.id },
            data: normalizeBranchDataFromLoad(out.json),
            skeleton: false,
        };
    }

    throw new Error(`Cannot resolve branch ref: ${ref.displayName || branchId || sourceUrl}`);
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

    await store.userStore.ensureBranchesHydrated();
    const treeEntry = store.userStore.getTree(treeId);
    if (!treeEntry) {
        store.update({ treeHydrating: false, error: 'Tree not found.' });
        return false;
    }

    /* Same as mountCurriculum — remount clears selection / graph under an open lesson. */
    try {
        const contentApi = getPanelRef('content');
        if (typeof contentApi?.confirmLeaveIfNeeded === 'function') {
            const ok = await contentApi.confirmLeaveIfNeeded();
            if (!ok) return false;
        }
    } catch {
        /* ignore */
    }

    try {
        await runThrottledBackgroundTask(
            `tree-maintain:${treeId}`,
            async () => {
                const { autoMaintainPublishedComposedTree } = await import(
                    '../../publishing/api/published-entry-auto-maintain.js'
                );
                await autoMaintainPublishedComposedTree(store, treeId);
            },
            { oncePerSession: true, minIntervalMs: 8000 }
        );
    } catch (e) {
        console.warn('[Arborito] autoMaintainPublishedComposedTree', e);
    }

    const epoch = ++store._curriculumMountEpoch;
    const prevSourceId = store.state?.activeSource?.id != null ? String(store.state.activeSource.id) : '';
    const switchedSource = !!prevSourceId && prevSourceId !== treeId;
    if (switchedSource) resetSageChatForSourceChange(store);
    const sourcesPickerOpen = (() => {
        const m = store.state?.modal;
        return !!(m && (m === 'sources' || (typeof m === 'object' && m.type === 'sources')));
    })();
    const clearGraph = !!forceRefresh;
    store.update({
        treeHydrating: true,
        /* Full-screen spinner when canvas will be empty and Biblioteca is not owning the loading UI. */
        treeGrowingOverlay:
            !!store.state.treeGrowingOverlay || (clearGraph && !sourcesPickerOpen),
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
              }
            : {}),
    });
    await yieldToPaint();

    const finalSource = {
        ...source,
        id: treeId,
        treeId,
        type: 'composed-tree',
        url: `tree://${treeId}`,
        name: treeEntry.name,
    };

    const paintGraph = async (branchPayloads, { skeleton }) => {
        if (epoch !== store._curriculumMountEpoch) return false;
        const { graphJson, singleBranch, virtualRootId } = composeTreeGraph({
            treeEntry,
            branchPayloads,
            lang: store.state.lang,
        });
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

        const ok = await DataProcessor.process(store, normalized, finalSource, {
            suppressReadmeAutoOpen: true,
            carryOverSelection: skeleton || (!forceRefresh && !switchedSource),
        });
        if (epoch !== store._curriculumMountEpoch) return false;
        const ui = store.ui || {};
        store.update({
            treeContext,
            treeGrowingOverlay: false,
            treeHydrating: skeleton,
            treeGrowingHint: skeleton
                ? ui.treeGrowingShort || ui.curriculumLoadingHint || null
                : null,
        });
        return ok;
    };

    try {
        const refs = Array.isArray(treeEntry.branchRefs) ? treeEntry.branchRefs : [];
        if (!refs.length) {
            store.update({
                treeHydrating: false,
                error: store.ui.emptyTreeNoBranches || 'This tree has no branches yet.',
            });
            return false;
        }

        /* Immediate structure: branch titles under the tree root. */
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
                const ui = store.ui || {};
                store.update({
                    treeContext,
                    treeGrowingOverlay: false,
                    treeHydrating: true,
                    treeGrowingHint: ui.treeGrowingShort || ui.curriculumLoadingHint || null,
                });
            }
        } catch (e) {
            console.warn('[Arborito] composed tree placeholder paint failed', e);
        }

        const slots = refs.map(() => null);
        let structurePaintGen = 0;
        let resolveSlotsFilled = null;
        const slotsFilled = new Promise((resolve) => {
            resolveSlotsFilled = resolve;
        });

        const tryPaintFromSlots = async () => {
            if (epoch !== store._curriculumMountEpoch) return;
            if (!slots.every(Boolean)) return;
            const gen = ++structurePaintGen;
            const skeleton = slots.some((s) => s.skeleton);
            await paintGraph(
                slots.map((s) => ({ ref: s.ref, data: s.data })),
                { skeleton }
            );
            if (gen !== structurePaintGen) return;
        };

        const putSlot = (i, payload) => {
            if (!payload?.data) return;
            /* Prefer full over skeleton; ignore stale skeleton after full. */
            if (slots[i] && slots[i].skeleton === false && payload.skeleton) return;
            slots[i] = payload;
            if (slots.every(Boolean)) resolveSlotsFilled?.();
            void tryPaintFromSlots();
        };

        const fullLoads = refs.map((ref, i) =>
            loadBranchPayloadForRef(store, ref, {
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
                    throw e;
                })
        );

        /* Paint as soon as every member has skeleton or full; do not wait for all fulls. */
        await Promise.race([slotsFilled, Promise.allSettled(fullLoads)]);
        await tryPaintFromSlots();

        const settled = await Promise.allSettled(fullLoads);
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

        const ok = await paintGraph(okPayloads, { skeleton: false });
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
