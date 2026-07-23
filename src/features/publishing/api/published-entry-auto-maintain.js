import {
    getBranchSyncState,
    getComposedTreeSyncState,
} from './published-entry-sync-state.js';
import { isPublishedResourceOwner } from './published-owner.js';

/**
 * Repair / sync a published composed tree when the owner opens it or the catalog scans.
 * Never auto-publishes curriculum updates — that requires an explicit Publish/Update.
 * @returns {Promise<boolean>} whether anything changed
 */
export async function autoMaintainPublishedComposedTree(store, treeId) {
    const id = String(treeId || '').trim();
    if (!store || !id) return false;

    const entry = store.userStore?.getTree?.(id);
    if (!entry) return false;

    const getPair = store.getNostrPublisherPair?.bind(store);
    if (!getPair || !isPublishedResourceOwner(entry, getPair)) return false;

    const state = getComposedTreeSyncState(entry, {
        getNostrPublisherPair: getPair,
        branches: store.userStore?.state?.branches,
    });
    if (state.mode === 'upToDate' || state.mode === 'publish') return false;

    if (state.mode === 'repair') {
        const repaired = await store.repairPublishedComposedTree?.(id);
        return !!repaired?.ok;
    }

    /* mode === 'update': leave for explicit dock/hub publish. */
    return false;
}

/**
 * Repair a published branch (local curriculum). Network updates require explicit Publish.
 * @returns {Promise<boolean>}
 */
export async function autoMaintainPublishedBranch(store, branchId) {
    const id = String(branchId || '').trim();
    if (!store || !id) return false;

    const branch = (store.userStore?.state?.branches || []).find((b) => String(b?.id) === id);
    if (!branch) return false;

    const getPair = store.getNostrPublisherPair?.bind(store);
    if (!getPair || !isPublishedResourceOwner(branch, getPair)) return false;

    const state = getBranchSyncState(branch, { getNostrPublisherPair: getPair });
    if (state.mode === 'upToDate' || state.mode === 'publish') return false;

    if (state.mode === 'repair') {
        const repaired = await store.repairPublishedBranch?.(id);
        return !!repaired?.ok;
    }

    /* mode === 'update': never silent republish. */
    return false;
}

/** Background pass when Árboles opens, owner entries only, best-effort (yield between items). */
export async function autoMaintainPublishedCatalog(store) {
    if (!store) return 0;
    await store.userStore?.ensureBranchesHydrated?.();
    const getPair = store.getNostrPublisherPair?.bind(store);
    if (!getPair) return 0;

    const { scheduleIdle } = await import('../../../shared/lib/yield-to-paint.js');

    let changed = 0;
    const branches = (store.userStore?.state?.branches || []).filter((branch) =>
        isPublishedResourceOwner(branch, getPair)
    );
    const trees = (store.userStore?.state?.trees || []).filter((tree) =>
        isPublishedResourceOwner(tree, getPair)
    );
    if (!branches.length && !trees.length) return 0;

    for (const branch of branches) {
        await new Promise((resolve) => scheduleIdle(resolve, 48));
        try {
            if (await autoMaintainPublishedBranch(store, branch.id)) changed += 1;
        } catch (e) {
            console.warn('[Arborito] autoMaintainPublishedBranch', branch.id, e);
        }
    }
    for (const tree of trees) {
        await new Promise((resolve) => scheduleIdle(resolve, 48));
        try {
            if (await autoMaintainPublishedComposedTree(store, tree.id)) changed += 1;
        } catch (e) {
            console.warn('[Arborito] autoMaintainPublishedComposedTree', tree.id, e);
        }
    }
    return changed;
}
