import {
    getBranchSyncState,
    getComposedTreeSyncState,
} from './published-entry-sync-state.js';
import { isPublishedResourceOwner } from './published-owner.js';
import {
    parseNostrTreeUrl,
    formatNostrTreeUrl,
    isNostrNetworkAvailable,
} from '../../nostr/api/nostr-refs.js';
import { ensureConnectedNostr } from '../../../shared/lib/connected-services/index.js';
import { branchIdFromBranchUrl } from '../../../shared/lib/branch-id.js';

function stampLocalPublishedBundleGen(store, { kind, id, gen }) {
    const g = String(gen || '').trim();
    if (!g) return false;
    if (kind === 'branch') {
        const entry = (store.userStore?.state?.branches || []).find((b) => String(b?.id) === String(id));
        if (!entry) return false;
        entry.publishedBundleGen = g;
        store.userStore.state.branches = [...store.userStore.state.branches];
        store.userStore.markBranchDirty?.(id, { skipAccountSync: true });
        store.userStore.persist?.();
        return true;
    }
    const entry = store.userStore?.getTree?.(id);
    if (!entry) return false;
    entry.publishedBundleGen = g;
    store.userStore.state.trees = [...store.userStore.state.trees];
    store.userStore.markTreeDirty?.(id);
    store.userStore.persist?.();
    return true;
}

function stampLocalPublishedBundleHasSkeleton(store, { kind, id, hasSkeleton }) {
    const flag = hasSkeleton === true;
    if (kind === 'branch') {
        const entry = (store.userStore?.state?.branches || []).find((b) => String(b?.id) === String(id));
        if (!entry) return false;
        if (entry.publishedBundleHasSkeleton === flag) return true;
        entry.publishedBundleHasSkeleton = flag;
        store.userStore.state.branches = [...store.userStore.state.branches];
        store.userStore.markBranchDirty?.(id, { skipAccountSync: true });
        store.userStore.persist?.();
        return true;
    }
    const entry = store.userStore?.getTree?.(id);
    if (!entry) return false;
    if (entry.publishedBundleHasSkeleton === flag) return true;
    entry.publishedBundleHasSkeleton = flag;
    store.userStore.state.trees = [...store.userStore.state.trees];
    store.userStore.markTreeDirty?.(id);
    store.userStore.persist?.();
    return true;
}

/** Session gate so skeleton quiet-republish does not hammer relays. */
const skeletonMigrateAttempted = new Set();

/**
 * Quietly rewrite a pre-gen public mirror to generation-scoped chunks when the
 * owner opens / scans it. Same identity, share code, and listing prefs.
 * @returns {Promise<boolean>}
 */
async function migrateLegacyPublishedBundleGenIfNeeded(store, { kind, id }) {
    const getPair = store.getNostrPublisherPair?.bind(store);
    if (!getPair || !isNostrNetworkAvailable()) return false;

    let entry = null;
    if (kind === 'branch') {
        entry = (store.userStore?.state?.branches || []).find((b) => String(b?.id) === String(id));
    } else {
        entry = store.userStore?.getTree?.(id) || null;
    }
    if (!entry || entry.publishPending) return false;
    if (!isPublishedResourceOwner(entry, getPair)) return false;
    const localGen = String(entry.publishedBundleGen || '').trim();
    if (localGen && entry.publishedBundleHasSkeleton === true) return false;

    const url = String(entry.publishedNetworkUrl || '').trim();
    const treeRef = url ? parseNostrTreeUrl(url) : null;
    if (!treeRef) return false;

    await ensureConnectedNostr(store);
    if (!store.nostr?.hasConfiguredRelays?.()) return false;

    let headerMeta = null;
    try {
        headerMeta = await store.nostr.loadNostrBundleHeaderMeta?.(treeRef);
    } catch (e) {
        console.warn('[Arborito] peek published header gen', e);
        return false;
    }
    const headerGen = String(headerMeta?.gen || '').trim();

    if (headerGen && headerMeta?.hasSkeleton === true) {
        stampLocalPublishedBundleGen(store, { kind, id, gen: headerGen });
        stampLocalPublishedBundleHasSkeleton(store, { kind, id, hasSkeleton: true });
        return !localGen;
    }

    if (headerGen && !localGen) {
        stampLocalPublishedBundleGen(store, { kind, id, gen: headerGen });
    }

    /* Network still on legacy addresses, or gen without skeleton — republish in place (owner only). */
    const sessionKey = `${kind}:${id}:skel`;
    if (skeletonMigrateAttempted.has(sessionKey)) return false;
    if (entry.publishedBundleHasSkeleton === true && headerGen) return false;

    try {
        if (kind === 'branch') {
            const activeId = branchIdFromBranchUrl(String(store.state.activeSource?.url || ''));
            if (String(activeId || '') !== String(id)) return false;
            skeletonMigrateAttempted.add(sessionKey);
            const reuse = formatNostrTreeUrl(treeRef.pub, treeRef.universeId);
            const raw = store.state.rawGraphData;
            const includeForum = raw?.meta?.forumEnabled === true;
            const listInDiscover = raw?.meta?.listInDiscover !== false;
            const res = await store.publishActiveTreeToNostrUniverse?.({
                reuseNostrTreeUrl: reuse,
                includeForum,
                listInDiscover,
                skipLocalMediaConfirm: true,
            });
            if (!(res && res.publicTreeUrl)) {
                skeletonMigrateAttempted.delete(sessionKey);
                return false;
            }
            if (raw) {
                try {
                    store.userStore.setBranchPublishedSnapshot?.(id, JSON.parse(JSON.stringify(raw)));
                } catch {
                    store.userStore.setBranchPublishedSnapshot?.(id, raw);
                }
            }
            if (res.gen) stampLocalPublishedBundleGen(store, { kind, id, gen: res.gen });
            stampLocalPublishedBundleHasSkeleton(store, { kind, id, hasSkeleton: true });
            return true;
        }

        skeletonMigrateAttempted.add(sessionKey);
        const includeForum = entry.publishedForumEnabled === true;
        const listInDiscover = entry.publishedListInDiscover !== false;
        const res = await store.publishComposedTreeToNostr?.({
            treeId: id,
            reuseNostrTreeUrl: formatNostrTreeUrl(treeRef.pub, treeRef.universeId),
            includeForum,
            listInDiscover,
            skipLocalMediaConfirm: true,
            quiet: true,
        });
        if (!(res && res.publicTreeUrl)) {
            skeletonMigrateAttempted.delete(sessionKey);
            return false;
        }
        if (res.gen) stampLocalPublishedBundleGen(store, { kind, id, gen: res.gen });
        stampLocalPublishedBundleHasSkeleton(store, { kind, id, hasSkeleton: true });
        return true;
    } catch (e) {
        skeletonMigrateAttempted.delete(sessionKey);
        console.warn('[Arborito] legacy published bundle gen migrate', kind, id, e);
        return false;
    }
}

/**
 * Repair / sync a published composed tree when the owner opens it or the catalog scans.
 * Never auto-publishes curriculum content updates — that requires explicit Publish/Update.
 * Quietly migrates pre-gen mirrors and adds the structure skeleton when missing.
 * @returns {Promise<boolean>} whether anything changed
 */
export async function autoMaintainPublishedComposedTree(store, treeId) {
    const id = String(treeId || '').trim();
    if (!store || !id) return false;

    const entry = store.userStore?.getTree?.(id);
    if (!entry) return false;

    const getPair = store.getNostrPublisherPair?.bind(store);
    if (!getPair || !isPublishedResourceOwner(entry, getPair)) return false;

    let changed = false;
    if (await migrateLegacyPublishedBundleGenIfNeeded(store, { kind: 'composed-tree', id })) {
        changed = true;
    }

    const state = getComposedTreeSyncState(store.userStore.getTree?.(id) || entry, {
        getNostrPublisherPair: getPair,
        branches: store.userStore?.state?.branches,
    });
    if (state.mode === 'upToDate' || state.mode === 'publish') return changed;

    if (state.mode === 'repair') {
        const repaired = await store.repairPublishedComposedTree?.(id);
        return changed || !!repaired?.ok;
    }

    /* mode === 'update': leave for explicit dock/hub publish. */
    return changed;
}

/**
 * Repair a published branch (local curriculum). Network content updates require explicit Publish.
 * Quietly migrates pre-gen mirrors and adds the structure skeleton when missing (active branch).
 * @returns {Promise<boolean>}
 */
export async function autoMaintainPublishedBranch(store, branchId) {
    const id = String(branchId || '').trim();
    if (!store || !id) return false;

    const branch = (store.userStore?.state?.branches || []).find((b) => String(b?.id) === id);
    if (!branch) return false;

    const getPair = store.getNostrPublisherPair?.bind(store);
    if (!getPair || !isPublishedResourceOwner(branch, getPair)) return false;

    let changed = false;
    if (await migrateLegacyPublishedBundleGenIfNeeded(store, { kind: 'branch', id })) {
        changed = true;
    }

    const state = getBranchSyncState(
        (store.userStore?.state?.branches || []).find((b) => String(b?.id) === id) || branch,
        { getNostrPublisherPair: getPair }
    );
    if (state.mode === 'upToDate' || state.mode === 'publish') return changed;

    if (state.mode === 'repair') {
        const repaired = await store.repairPublishedBranch?.(id);
        return changed || !!repaired?.ok;
    }

    /* mode === 'update': never silent curriculum republish. */
    return changed;
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
