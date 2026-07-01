import { getArboritoStore } from '../core/store-singleton.js';
import { mountComposedTree } from '../features/trees/api/mount-composed-tree.js';
import { importComposedTreeFromBundle, branchRefsFromIds } from '../features/trees/api/import-composed-tree-bundle.js';
import { computeBranchSetHashSync } from '../features/trees/api/branch-set-hash.js';
import { resolveComposedRefIdFromMobilePath } from '../features/trees/api/compose-tree-graph.js';
import { getMobilePath } from '../features/tree-graph/api/graph-ui-accessors.js';

function shell() {
    return getArboritoStore();
}

function branchRefKeys(branchRefs) {
    return (Array.isArray(branchRefs) ? branchRefs : [])
        .map((r) => String(r?.networkUrl || r?.sourceUrl || r?.branchId || r?.refId || '').trim())
        .filter(Boolean);
}

function hasDuplicateBranchRefs(branchRefs) {
    const keys = branchRefKeys(branchRefs);
    return new Set(keys).size !== keys.length;
}

function findLocalTreeWithSameHash(trees, hash, excludeId = '') {
    if (!hash) return null;
    return (Array.isArray(trees) ? trees : []).find(
        (t) => t?.id !== excludeId && String(t?.branchSetHash || '') === hash
    );
}

/** Composed tree (árbol) store helpers. */

export async function loadComposedTreeAction(treeIdOrSource) {
    const store = shell();
    if (!store) return undefined;

            const treeId =
                typeof treeIdOrSource === 'string'
                    ? treeIdOrSource
                    : String(treeIdOrSource?.treeId || treeIdOrSource?.id || '').trim();
            if (!treeId) return false;
            await store.userStore.ensureBranchesHydrated();
            const entry = store.userStore.getTree(treeId);
            if (!entry) return false;
            return mountComposedTree(
                store,
                {
                    id: treeId,
                    treeId,
                    name: entry.name,
                    type: 'composed-tree',
                    url: `tree://${treeId}`,
                    isTrusted: true,
                },
                true
            );

}

export async function installComposedTreeFromNostrBundleAction(bundle, { treeRef, shareCode, remix = false } = {}) {
    const store = shell();
    if (!store) return undefined;

            return importComposedTreeFromBundle(store, bundle, { treeRef, shareCode, remix });

}

export async function pickBranchesForTreeAction(ui, defaultIds = null) {
    const store = shell();
    if (!store) return undefined;

            await store.userStore.ensureBranchesHydrated();
            const branches = store.userStore.state.branches || [];
            if (!branches.length) return null;
            const defaultSet = Array.isArray(defaultIds) ? new Set(defaultIds.map(String)) : null;
            const rows = branches.map((b) => ({
                id: b.id,
                label: b.name || b.id,
                checked: defaultSet ? defaultSet.has(String(b.id)) : true,
            }));
            return store.showExportSnapshotsPickDialog({
                title: ui.sourcesPickBranchesTitle || 'Pick branches',
                body: ui.sourcesPickBranchesBody || 'Select branches for store tree.',
                confirmText: ui.dialogConfirmTitle || 'OK',
                selectAllText: ui.sourcesPickBranchesAll || 'All',
                selectNoneText: ui.sourcesPickBranchesNone || 'None',
                snapshots: rows,
            });

}

export async function saveComposedTreeFromDraftAction({ treeId = '', name, branchIds }) {
    const store = shell();
    if (!store) return undefined;

            const ui = store.ui;
            await store.userStore.ensureBranchesHydrated();
            const ids = (Array.isArray(branchIds) ? branchIds : []).map(String).filter(Boolean);
            if (!ids.length) {
                store.notify(ui.sourcesCreateTreeNoBranches || 'Pick at least one branch.', true);
                return null;
            }
            const branchRefs = branchRefsFromIds(store, ids);
            if (hasDuplicateBranchRefs(branchRefs)) {
                store.notify(ui.sourcesDuplicateBranchInTree || 'That branch is already in store tree.', true);
                return null;
            }
            const hash = computeBranchSetHashSync(branchRefs);
            const tid = String(treeId || '').trim();
            if (tid) {
                const dup = findLocalTreeWithSameHash(store.userStore.state.trees, hash, tid);
                if (dup) {
                    store.notify(ui.sourcesDuplicateTreeLocal || 'You already have a tree with the same branches.', true);
                    return null;
                }
                store.userStore.updateTree(tid, {
                    name: String(name || '').trim(),
                    branchRefs,
                    branchSetHash: hash,
                });
                if (store.state.activeSource?.type === 'composed-tree' && store.state.activeSource.treeId === tid) {
                    await store.loadComposedTree(tid);
                }
                store.notify(ui.sourcesTreeUpdated || 'Tree updated.');
                return store.userStore.getTree(tid);
            }
            const dup = findLocalTreeWithSameHash(store.userStore.state.trees, hash);
            if (dup) {
                store.notify(ui.sourcesDuplicateTreeLocal || 'You already have a tree with the same branches.', true);
                return null;
            }
            const entry = store.userStore.createTree(String(name || '').trim(), branchRefs);
            if (entry && hash) store.userStore.updateTree(entry.id, { branchSetHash: hash });
            return entry;

}

export async function createComposedTreeInteractiveAction() {
    const store = shell();
    if (!store) return undefined;

            const ui = store.ui;
            const name = await store.prompt(
                ui.sourcesCreateTreePrompt || 'Name your tree:',
                '',
                ui.sourcesCreateTree || 'Create tree'
            );
            if (!name) return null;
            const picked = await store.pickBranchesForTree(ui);
            if (picked == null) return null;
            if (!picked.length) {
                store.notify(ui.sourcesCreateTreeNoBranches || 'Pick at least one branch.', true);
                return null;
            }
            const branchRefs = branchRefsFromIds(store, picked);
            if (hasDuplicateBranchRefs(branchRefs)) {
                store.notify(ui.sourcesDuplicateBranchInTree || 'That branch is already in store tree.', true);
                return null;
            }
            const hash = computeBranchSetHashSync(branchRefs);
            const dup = findLocalTreeWithSameHash(store.userStore.state.trees, hash);
            if (dup) {
                store.notify(ui.sourcesDuplicateTreeLocal || 'You already have a tree with the same branches.', true);
                return null;
            }
            const entry = store.userStore.createTree(String(name).trim(), branchRefs);
            if (entry && hash) store.userStore.updateTree(entry.id, { branchSetHash: hash });
            return entry;

}

export async function editComposedTreeInteractiveAction(treeId) {
    const store = shell();
    if (!store) return undefined;

            const ui = store.ui;
            const entry = store.userStore.getTree(treeId);
            if (!entry) return false;
            const currentIds = (entry.branchRefs || []).map((r) => String(r.branchId || r.refId || '')).filter(Boolean);
            const picked = await store.pickBranchesForTree(ui, currentIds);
            if (picked == null) return false;
            if (!picked.length) {
                store.notify(ui.sourcesCreateTreeNoBranches || 'Pick at least one branch.', true);
                return false;
            }
            const branchRefs = branchRefsFromIds(store, picked);
            if (hasDuplicateBranchRefs(branchRefs)) {
                store.notify(ui.sourcesDuplicateBranchInTree || 'That branch is already in store tree.', true);
                return false;
            }
            const hash = computeBranchSetHashSync(branchRefs);
            store.userStore.updateTree(treeId, { branchRefs, branchSetHash: hash });
            if (store.state.activeSource?.type === 'composed-tree' && store.state.activeSource.treeId === treeId) {
                await store.loadComposedTree(treeId);
            }
            store.notify(ui.sourcesTreeUpdated || 'Tree updated.');
            return true;

}

export async function renameComposedTreeInteractiveAction(treeId) {
    const store = shell();
    if (!store) return undefined;

            const ui = store.ui;
            const entry = store.userStore.getTree(treeId);
            if (!entry) return false;
            const name = await store.prompt(
                ui.sourcesRenameTreePrompt || 'Rename tree:',
                entry.name || '',
                ui.sourcesRenameTree || 'Rename'
            );
            if (!name) return false;
            store.userStore.updateTree(treeId, { name: String(name).trim() });
            store.notify(ui.sourcesTreeUpdated || 'Tree updated.');
            return true;

}

export function remixComposedTreeAction(treeId) {
    const store = shell();
    if (!store) return undefined;

            const ui = store.ui;
            const entry = store.userStore.getTree(treeId);
            if (!entry) return null;
            const remix = store.userStore.remixTree(treeId, `${entry.name} (remix)`);
            if (remix) store.notify(ui.sourcesTreeRemixed || 'Remix created.');
            return remix;

}

export async function addBranchToActiveComposedTreeAction(branchId) {
    const store = shell();
    if (!store) return undefined;

            const ui = store.ui;
            await store.userStore.ensureBranchesHydrated();
            const treeId = String(store.state.activeSource?.treeId || '').trim();
            if (!treeId || store.state.activeSource?.type !== 'composed-tree') return false;
            const bid = String(branchId || '').trim();
            const branch = (store.userStore.state.branches || []).find((b) => String(b.id) === bid);
            if (!branch) return false;
            const entry = store.userStore.getTree(treeId);
            if (!entry) return false;
            const currentIds = (entry.branchRefs || [])
                .map((r) => String(r.branchId || r.refId || ''))
                .filter(Boolean);
            if (currentIds.includes(bid)) {
                store.notify(ui.sourcesDuplicateBranchInTree || 'That branch is already in store tree.', true);
                return false;
            }
            const picked = [...currentIds, bid];
            const branchRefs = branchRefsFromIds(store, picked);
            if (hasDuplicateBranchRefs(branchRefs)) {
                store.notify(ui.sourcesDuplicateBranchInTree || 'That branch is already in store tree.', true);
                return false;
            }
            const hash = computeBranchSetHashSync(branchRefs);
            store.userStore.updateTree(treeId, { branchRefs, branchSetHash: hash });
            await store.loadComposedTree(treeId);
            store.notify(ui.sourcesBranchAddedToTree || 'Branch added to tree.');
            return true;

}

export async function addInstalledBranchToActiveComposedTreeAction(communityId) {
    const store = shell();
    if (!store) return undefined;

            const ui = store.ui;
            const treeId = String(store.state.activeSource?.treeId || '').trim();
            if (!treeId || store.state.activeSource?.type !== 'composed-tree') return false;
            const cid = String(communityId || '').trim();
            const community = (store.state.communitySources || []).find((s) => String(s.id) === cid);
            if (!community) return false;
            if (String(community.contentKind || '').trim() === 'composed-tree') return false;
            const entry = store.userStore.getTree(treeId);
            if (!entry) return false;
            const url = String(community.url || '').trim();
            const dup = (entry.branchRefs || []).some((r) => {
                const rid = String(r.branchId || r.refId || '').trim();
                const rurl = String(r.networkUrl || r.sourceUrl || '').trim();
                return rid === cid || (url && rurl === url);
            });
            if (dup) {
                store.notify(ui.sourcesDuplicateBranchInTree || 'That branch is already in store tree.', true);
                return false;
            }
            const newRef = {
                refId: cid,
                branchId: cid,
                sourceUrl: url,
                networkUrl: url,
                displayName: String(community.name || cid),
            };
            const branchRefs = [...(entry.branchRefs || []).map((r) => ({ ...r })), newRef];
            if (hasDuplicateBranchRefs(branchRefs)) {
                store.notify(ui.sourcesDuplicateBranchInTree || 'That branch is already in store tree.', true);
                return false;
            }
            const hash = computeBranchSetHashSync(branchRefs);
            store.userStore.updateTree(treeId, { branchRefs, branchSetHash: hash });
            await store.loadComposedTree(treeId);
            store.notify(ui.sourcesBranchAddedToTree || 'Branch added to tree.');
            return true;

}

export async function addBranchToTreeInteractiveAction(branchId) {
    const store = shell();
    if (!store) return undefined;

            const ui = store.ui;
            await store.userStore.ensureBranchesHydrated();
            const bid = String(branchId || '').trim();
            const branch = (store.userStore.state.branches || []).find((b) => String(b.id) === bid);
            if (!branch) return false;

            const addRefsToTree = async (treeId) => {
                const entry = store.userStore.getTree(treeId);
                if (!entry) return false;
                const currentIds = (entry.branchRefs || [])
                    .map((r) => String(r.branchId || r.refId || ''))
                    .filter(Boolean);
                if (currentIds.includes(bid)) {
                    store.notify(ui.sourcesDuplicateBranchInTree || 'That branch is already in store tree.', true);
                    return false;
                }
                const picked = [...currentIds, bid];
                const branchRefs = branchRefsFromIds(store, picked);
                if (hasDuplicateBranchRefs(branchRefs)) {
                    store.notify(ui.sourcesDuplicateBranchInTree || 'That branch is already in store tree.', true);
                    return false;
                }
                const hash = computeBranchSetHashSync(branchRefs);
                store.userStore.updateTree(treeId, { branchRefs, branchSetHash: hash });
                if (store.state.activeSource?.type === 'composed-tree' && store.state.activeSource.treeId === treeId) {
                    await store.loadComposedTree(treeId);
                }
                store.notify(ui.sourcesBranchAddedToTree || 'Branch added to tree.');
                return true;
            };

            const trees = store.userStore.state.trees || [];
            if (!trees.length) {
                const name = await store.prompt(
                    ui.sourcesCreateTreePrompt || 'Name your tree:',
                    String(branch.name || '').trim(),
                    ui.sourcesCreateTree || 'Create tree'
                );
                if (!name) return false;
                const branchRefs = branchRefsFromIds(store, [bid]);
                const hash = computeBranchSetHashSync(branchRefs);
                const dup = findLocalTreeWithSameHash(store.userStore.state.trees, hash);
                if (dup) {
                    store.notify(ui.sourcesDuplicateTreeLocal || 'You already have a tree with the same branches.', true);
                    return false;
                }
                const entry = store.userStore.createTree(String(name).trim(), branchRefs);
                if (entry && hash) store.userStore.updateTree(entry.id, { branchSetHash: hash });
                if (entry) store.notify(ui.sourcesBranchAddedToTree || 'Branch added to tree.');
                return !!entry;
            }

            const choices = trees.map((t) => ({
                id: String(t.id),
                label: `🌳 ${String(t.name || t.id)}`,
            }));
            choices.push({
                id: '__new__',
                label: `＋ ${ui.sourcesCreateTree || 'Create new tree…'}`,
            });
            const bodyTpl = ui.sourcesAddToTreeBody || 'Pick a tree to add “{{name}}”.';
            const picked = await store.showDialog({
                type: 'choice',
                title: ui.sourcesAddToTree || 'Add to tree…',
                body: bodyTpl.replace(/\{\{name\}\}/g, String(branch.name || bid)),
                choices,
                hideCancel: false,
            });
            if (picked == null) return false;
            const target = String(picked || '');
            if (target === '__new__') {
                const name = await store.prompt(
                    ui.sourcesCreateTreePrompt || 'Name your tree:',
                    String(branch.name || '').trim(),
                    ui.sourcesCreateTree || 'Create tree'
                );
                if (!name) return false;
                const branchRefs = branchRefsFromIds(store, [bid]);
                const hash = computeBranchSetHashSync(branchRefs);
                const dup = findLocalTreeWithSameHash(store.userStore.state.trees, hash);
                if (dup) {
                    store.notify(ui.sourcesDuplicateTreeLocal || 'You already have a tree with the same branches.', true);
                    return false;
                }
                const entry = store.userStore.createTree(String(name).trim(), branchRefs);
                if (entry && hash) store.userStore.updateTree(entry.id, { branchSetHash: hash });
                if (entry) store.notify(ui.sourcesBranchAddedToTree || 'Branch added to tree.');
                return !!entry;
            }
            return addRefsToTree(target);

}

export function syncTreeContextFromMobilePathAction() {
    const store = shell();
    if (!store) return undefined;

            const ctx = store.state.treeContext;
            if (!ctx || ctx.kind !== 'composed-tree' || ctx.singleBranch) return;
            const path = getMobilePath();
            if (path.length <= 1) {
                if (ctx.activeBranchRefId) {
                    store.update({ treeContext: { ...ctx, activeBranchRefId: null } });
                }
                return;
            }
            const refId = resolveComposedRefIdFromMobilePath(store.state.data, path);
            if (refId && refId !== ctx.activeBranchRefId) {
                store.update({ treeContext: { ...ctx, activeBranchRefId: refId } });
            } else if (!refId && ctx.activeBranchRefId) {
                store.update({ treeContext: { ...ctx, activeBranchRefId: null } });
            }

}

/** Store.prototype — explicit actions (no bindStoreContext). */
export const storeTreesMethods = {
    loadComposedTree: loadComposedTreeAction,
    installComposedTreeFromNostrBundle: installComposedTreeFromNostrBundleAction,
    pickBranchesForTree: pickBranchesForTreeAction,
    saveComposedTreeFromDraft: saveComposedTreeFromDraftAction,
    createComposedTreeInteractive: createComposedTreeInteractiveAction,
    editComposedTreeInteractive: editComposedTreeInteractiveAction,
    renameComposedTreeInteractive: renameComposedTreeInteractiveAction,
    remixComposedTree: remixComposedTreeAction,
    addBranchToActiveComposedTree: addBranchToActiveComposedTreeAction,
    addInstalledBranchToActiveComposedTree: addInstalledBranchToActiveComposedTreeAction,
    addBranchToTreeInteractive: addBranchToTreeInteractiveAction,
    syncTreeContextFromMobilePath: syncTreeContextFromMobilePathAction,
};
