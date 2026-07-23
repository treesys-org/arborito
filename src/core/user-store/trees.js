import { randomUUIDSafe } from '../../shared/lib/secure-web-crypto.js';
import { persistTreeEntry, removeTreeFromCatalog } from '../../shared/lib/arborito-catalog-store.js';

/**
 * Composed trees (árboles): named playlists of branch references.
 * Branches hold curriculum data; trees only store refs + metadata.
 */
export const treesMixin = {
    createTree(title, branchRefs = []) {
        const id = `tree-${randomUUIDSafe()}`;
        const name = String(title || '').trim() || 'My tree';
        const refs = Array.isArray(branchRefs) ? branchRefs.map((r) => ({ ...r })) : [];
        const entry = {
            id,
            name,
            updated: Date.now(),
            branchRefs: refs,
            forkOf: null,
            publishedNetworkUrl: null,
            presentation: null,
        };
        this.state.trees.push(entry);
        this.markTreeDirty(id);
        this.notifyCatalogChanged?.();
        this.persist();
        return entry;
    },

    remixTree(sourceTreeId, newTitle) {
        const src = this.state.trees.find((t) => t.id === sourceTreeId);
        if (!src) return null;
        const id = `tree-${randomUUIDSafe()}`;
        const name = String(newTitle || '').trim() || `${src.name} (remix)`;
        const entry = {
            id,
            name,
            updated: Date.now(),
            branchRefs: (src.branchRefs || []).map((r) => ({ ...r })),
            forkOf: src.publishedNetworkUrl
                ? { treeUrl: src.publishedNetworkUrl, treeId: src.id, name: src.name }
                : { treeId: src.id, name: src.name },
            publishedNetworkUrl: null,
        };
        this.state.trees.push(entry);
        this.markTreeDirty(id);
        this.notifyCatalogChanged?.();
        this.persist();
        return entry;
    },

    updateTree(treeId, patch) {
        const entry = this.state.trees.find((t) => t.id === treeId);
        if (!entry) return false;
        if (patch.name != null) entry.name = String(patch.name).trim() || entry.name;
        if (Array.isArray(patch.branchRefs)) entry.branchRefs = patch.branchRefs.map((r) => ({ ...r }));
        if (patch.forkOf !== undefined) entry.forkOf = patch.forkOf;
        if (patch.presentation !== undefined) entry.presentation = patch.presentation;
        if (patch.branchSetHash != null) entry.branchSetHash = String(patch.branchSetHash);
        if (patch.publishedBranchSetHash != null) entry.publishedBranchSetHash = String(patch.publishedBranchSetHash);
        entry.updated = Date.now();
        this.state.trees = [...this.state.trees];
        this.markTreeDirty(treeId);
        this.persist();
        return true;
    },

    deleteTree(treeId) {
        const id = String(treeId || '').trim();
        if (!id) return Promise.resolve(false);
        this.state.trees = this.state.trees.filter((t) => String(t.id) !== id);
        this._treesDirty?.delete(id);
        this._rememberCatalogTombstone('trees', id);
        this.notifyCatalogChanged?.();
        this.persist();
        return removeTreeFromCatalog(id).catch((e) => {
            console.warn('[Arborito] removeTreeFromCatalog failed', id, e);
            return false;
        });
    },

    getTree(treeId) {
        return this.state.trees.find((t) => t.id === treeId) || null;
    },

    /** Composed trees whose playlist includes this local branch id. */
    treesReferencingBranch(branchId) {
        const bid = String(branchId || '').trim();
        if (!bid) return [];
        return (this.state.trees || []).filter((t) =>
            (t.branchRefs || []).some(
                (r) =>
                    String(r?.branchId || '') === bid ||
                    String(r?.refId || '') === bid ||
                    String(r?.sourceUrl || '') === `branch://${bid}`
            )
        );
    },

    /** Drop a branch from every composed-tree playlist. Returns affected trees. */
    unlinkBranchFromTrees(branchId) {
        const bid = String(branchId || '').trim();
        if (!bid) return [];
        const affected = this.treesReferencingBranch(bid);
        for (const t of affected) {
            const next = (t.branchRefs || []).filter(
                (r) =>
                    String(r?.branchId || '') !== bid &&
                    String(r?.refId || '') !== bid &&
                    String(r?.sourceUrl || '') !== `branch://${bid}`
            );
            this.updateTree(t.id, { branchRefs: next });
        }
        return affected;
    },

    setTreePublishedNetworkUrl(treeId, treeUrl, shareCode = null) {
        const id = String(treeId || '').trim();
        const url = String(treeUrl || '').trim();
        if (!id || !url) return false;
        const entry = this.state.trees.find((t) => t.id === id);
        if (!entry) return false;
        entry.publishedNetworkUrl = url;
        entry.publishedAt = Date.now();
        if (shareCode != null && String(shareCode).trim()) {
            entry.publishedShareCode = String(shareCode).trim();
        }
        if (entry.branchSetHash) {
            entry.publishedBranchSetHash = String(entry.branchSetHash);
        }
        this.state.trees = [...this.state.trees];
        this.markTreeDirty(id);
        this.persist();
        return true;
    },

    getTreePublishedShareCode(treeId) {
        const entry = this.state.trees.find((t) => t.id === treeId);
        if (!entry?.publishedNetworkUrl) return null;
        return entry?.publishedShareCode ? String(entry.publishedShareCode) : null;
    },

    getTreePublishedNetworkUrl(treeId) {
        const entry = this.state.trees.find((t) => t.id === treeId);
        return entry?.publishedNetworkUrl ? String(entry.publishedNetworkUrl) : null;
    },

    clearTreePublishedNetworkUrl(treeId) {
        const id = String(treeId || '').trim();
        if (!id) return false;
        const entry = this.state.trees.find((t) => t.id === id);
        if (!entry || !entry.publishedNetworkUrl) return false;
        delete entry.publishedNetworkUrl;
        delete entry.publishedAt;
        delete entry.publishedShareCode;
        delete entry.publishedBranchSetHash;
        if (entry.data?.meta && typeof entry.data.meta === 'object') {
            delete entry.data.meta.shareCode;
        }
        this.state.trees = [...this.state.trees];
        this.markTreeDirty(id);
        this.persist();
        return true;
    },
};
