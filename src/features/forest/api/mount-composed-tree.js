/**
 * Mount a composed tree (árbol), collection of branch refs.
 */

import { DataProcessor } from '../../tree-graph/api/data-processor.js';
import { normalizeLoadedTreeJson } from '../../tree-graph/api/tree-load-pipeline.js';
import { composeTreeGraph } from './compose-tree-graph.js';
import { parseNostrTreeUrl } from '../../nostr/api/nostr-refs.js';
import { yieldToPaint } from '../../../shared/lib/yield-to-paint.js';
import { runThrottledBackgroundTask } from '../../../shared/lib/background-task-gate.js';

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

/**
 * Load branch curriculum for a ref entry.
 * @param {import('../../../core/store.js' ).Store} store
 * @param {object} ref
 */
async function loadBranchPayloadForRef(store, ref) {
    const branchId = String(ref.branchId || '').trim();
    const sourceUrl = String(ref.sourceUrl || ref.networkUrl || '').trim();

    if (sourceUrl.startsWith('branch://') || branchId) {
        await store.userStore.ensureBranchesHydrated();
        const id = branchId || sourceUrl.slice('branch://'.length).split('/')[0];
        const entry = store.userStore.state.branches.find((b) => b.id === id);
        if (!entry?.data) throw new Error(`Branch not found: ${id}`);
        return { ref: { ...ref, branchId: id, refId: ref.refId || id }, data: entry.data };
    }

    if (sourceUrl.startsWith('nostr://') || parseNostrTreeUrl(sourceUrl)) {
        const src = store.state.communitySources?.find(
            (s) => String(s.url) === sourceUrl || String(s.id) === String(ref.communityId || '')
        ) || { id: ref.communityId || branchId, url: sourceUrl, type: 'community', name: ref.displayName || '' };
        const out = await store.sourceManager.loadData(src, store.state.lang, false);
        return {
            ref: { ...ref, refId: ref.refId || src.id },
            data: normalizeBranchDataFromLoad(out.json),
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
    store.update({
        treeHydrating: true,
        error: null,
        activeSource: { ...source, treeId, type: 'composed-tree', name: treeEntry.name },
        ...(forceRefresh
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

    try {
        const refs = Array.isArray(treeEntry.branchRefs) ? treeEntry.branchRefs : [];
        if (!refs.length) {
            store.update({ treeHydrating: false, error: store.ui.emptyTreeNoBranches || 'This tree has no branches yet.' });
            return false;
        }

        const branchPayloads = [];
        for (const ref of refs) {
            branchPayloads.push(await loadBranchPayloadForRef(store, ref));
        }

        const { graphJson, singleBranch, virtualRootId } = composeTreeGraph({
            treeEntry,
            branchPayloads,
            lang: store.state.lang,
        });

        const finalSource = {
            ...source,
            id: treeId,
            treeId,
            type: 'composed-tree',
            url: `tree://${treeId}`,
            name: treeEntry.name,
        };

        const normalized = normalizeLoadedTreeJson(graphJson, store, finalSource);

        const treeContext = {
            kind: 'composed-tree',
            treeId,
            singleBranch: !!singleBranch,
            virtualRootId,
            branchRefId: singleBranch ? (branchPayloads[0]?.ref?.refId || null) : null,
            activeBranchRefId: null,
        };

        store.state.treeContext = treeContext;

        const ok = await DataProcessor.process(store, normalized, finalSource, {
            suppressReadmeAutoOpen: !forceRefresh,
            carryOverSelection: !forceRefresh,
        });

        if (epoch !== store._curriculumMountEpoch) return false;
        store.update({ treeContext, treeHydrating: false, treeGrowingOverlay: false });
        if (ok) {
            queueMicrotask(() => {
                try {
                    store.dispatchEvent(new CustomEvent('graph-update'));
                } catch {
                    /* ignore */
                }
            });
        }
        return ok;
    } catch (e) {
        console.error('[Arborito] mountComposedTree failed', e);
        if (epoch === store._curriculumMountEpoch) {
            store.update({
                treeHydrating: false,
                treeGrowingOverlay: false,
                error: String((e && e.message) || e),
            });
        }
        return false;
    }
}
