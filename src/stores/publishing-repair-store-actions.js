import { getArboritoStore } from '../core/store-singleton.js';
import { parseNostrTreeUrl } from '../features/nostr/api/nostr-refs.js';
import { ensureConnectedNostr } from '../shared/lib/connected-services/index.js';
import { computeBranchSetHashSync } from '../features/forest/api/branch-set-hash.js';
import { importComposedTreeFromBundle } from '../features/forest/api/import-composed-tree-bundle.js';
import { isPublishedResourceOwner } from '../features/publishing/api/published-owner.js';

function shell() {
    return getArboritoStore();
}

/** Restore a published branch's local curriculum from its last published snapshot. */
export async function repairPublishedBranchAction(branchId) {
    const store = shell();
    if (!store) return { ok: false };

    const id = String(branchId || '').trim();
    if (!id) return { ok: false, reason: 'missing-id' };

    const entry = (store.userStore?.state?.branches || []).find((b) => String(b?.id) === id);
    if (!entry) return { ok: false, reason: 'missing-entry' };

    const snap = entry.publishedSnapshot;
    if (snap && typeof snap === 'object') {
        try {
            entry.data = JSON.parse(JSON.stringify(snap));
        } catch {
            entry.data = snap;
        }
        entry.draftHash =
            entry.publishedSnapshotHash || store.userStore.hashJson?.(entry.data) || entry.draftHash;
        store.userStore.markBranchDirty?.(id);
        store.userStore.persist?.();
        return { ok: true, source: 'snapshot' };
    }

    const url = String(entry.publishedNetworkUrl || '').trim();
    const treeRef = url ? parseNostrTreeUrl(url) : null;
    if (!treeRef || !isPublishedResourceOwner(entry, store.getNostrPublisherPair.bind(store))) {
        return { ok: false, reason: 'no-baseline' };
    }

    await ensureConnectedNostr(store);
    const bundle = await store.nostr?.loadBundle?.({
        pub: treeRef.pub,
        universeId: treeRef.universeId,
    });
    const tree = bundle?.tree;
    if (!tree || typeof tree !== 'object') {
        return { ok: false, reason: 'network-missing' };
    }

    /* Full curriculum shape — never store a single language root as entry.data. */
    const payload =
        tree.languages && typeof tree.languages === 'object'
            ? tree
            : { languages: { en: tree } };
    try {
        entry.data = JSON.parse(JSON.stringify(payload));
    } catch {
        entry.data = payload;
    }
    store.userStore.setBranchPublishedSnapshot?.(id, entry.data);
    entry.draftHash = entry.publishedSnapshotHash || store.userStore.hashJson?.(entry.data);
    store.userStore.markBranchDirty?.(id);
    store.userStore.persist?.();
    return { ok: true, source: 'network' };
}

/** Fix composed tree refs / baseline from owner-local or network canonical copy. */
export async function repairPublishedComposedTreeAction(treeId) {
    const store = shell();
    if (!store) return { ok: false };

    const id = String(treeId || '').trim();
    if (!id) return { ok: false, reason: 'missing-id' };

    let entry = store.userStore.getTree?.(id);
    if (!entry) return { ok: false, reason: 'missing-entry' };

    await store.userStore.ensureBranchesHydrated();
    const branches = store.userStore.state.branches || [];
    const refs = (entry.branchRefs || []).filter((ref) => {
        const bid = String(ref?.branchId || ref?.refId || '').trim();
        if (!bid) return false;
        if (String(ref?.networkUrl || '').trim()) return true;
        return branches.some((b) => String(b?.id) === bid);
    });

    if (refs.length !== (entry.branchRefs || []).length) {
        store.userStore.updateTree(id, { branchRefs: refs });
        entry = store.userStore.getTree(id);
    }

    const hash = computeBranchSetHashSync(entry?.branchRefs || []);
    if (hash) {
        store.userStore.updateTree(id, { branchSetHash: hash });
        entry = store.userStore.getTree(id);
    }

    const url = String(entry?.publishedNetworkUrl || '').trim();
    const treeRef = url ? parseNostrTreeUrl(url) : null;
    const isOwner = isPublishedResourceOwner(entry, store.getNostrPublisherPair.bind(store));
    const integrityBroken = refs.length === 0 && (entry?.branchRefs || []).length > 0;

    if (isOwner && treeRef && integrityBroken) {
        await ensureConnectedNostr(store);
        const bundle = await store.nostr?.loadBundle?.({
            pub: treeRef.pub,
            universeId: treeRef.universeId,
        });
        if (bundle) {
            await importComposedTreeFromBundle(store, bundle, { treeRef });
            return { ok: true, source: 'network' };
        }
    }

    if (isOwner && hash && !String(entry?.publishedBranchSetHash || '').trim()) {
        store.userStore.updateTree(id, { publishedBranchSetHash: hash });
    }

    return { ok: true, source: 'local' };
}
