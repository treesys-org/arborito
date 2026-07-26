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

    /**
     * @param {string} treeId
     * @param {object} patch
     * @param {{ touchUpdated?: boolean }} [opts] - set touchUpdated:false for hash bookkeeping
     *   that must not flip dock/Biblioteca into a false “Update” state.
     */
    updateTree(treeId, patch, opts = {}) {
        const entry = this.state.trees.find((t) => t.id === treeId);
        if (!entry) return false;
        if (patch.name != null) entry.name = String(patch.name).trim() || entry.name;
        if (Array.isArray(patch.branchRefs)) entry.branchRefs = patch.branchRefs.map((r) => ({ ...r }));
        if (patch.forkOf !== undefined) entry.forkOf = patch.forkOf;
        if (patch.presentation !== undefined) entry.presentation = patch.presentation;
        if (patch.branchSetHash != null) entry.branchSetHash = String(patch.branchSetHash);
        if (patch.publishedBranchSetHash != null) entry.publishedBranchSetHash = String(patch.publishedBranchSetHash);
        if (opts.touchUpdated !== false) entry.updated = Date.now();
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

    /**
     * @param {string} treeId
     * @param {string} treeUrl
     * @param {string|null} [shareCode]
     * @param {{
     *   branchSetHash?: string|null,
     *   listInDiscover?: boolean,
     *   forumEnabled?: boolean,
     *   bindOnly?: boolean,
     * }} [opts]
     */
    setTreePublishedNetworkUrl(treeId, treeUrl, shareCode = null, opts = {}) {
        const id = String(treeId || '').trim();
        const url = String(treeUrl || '').trim();
        if (!id || !url) return false;
        const entry = this.state.trees.find((t) => t.id === id);
        if (!entry) return false;
        entry.publishedNetworkUrl = url;
        if (shareCode != null && String(shareCode).trim()) {
            entry.publishedShareCode = String(shareCode).trim();
        }
        if (opts.bindOnly) {
            entry.publishPending = true;
            delete entry.publishedAt;
            delete entry.publishedBranchSetHash;
        } else {
            entry.publishedAt = Date.now();
            delete entry.publishPending;
            const hashOpt = opts?.branchSetHash != null ? String(opts.branchSetHash).trim() : '';
            if (hashOpt) {
                entry.branchSetHash = hashOpt;
                entry.publishedBranchSetHash = hashOpt;
            } else if (entry.branchSetHash) {
                entry.publishedBranchSetHash = String(entry.branchSetHash);
            }
            if (typeof opts?.listInDiscover === 'boolean') {
                entry.publishedListInDiscover = opts.listInDiscover;
            }
            if (typeof opts?.forumEnabled === 'boolean') {
                entry.publishedForumEnabled = opts.forumEnabled;
            }
            if (opts.bundleGen != null && String(opts.bundleGen).trim()) {
                entry.publishedBundleGen = String(opts.bundleGen).trim();
            }
        }
        this.state.trees = [...this.state.trees];
        this.markTreeDirty(id);
        this.persist();
        this.notifyCatalogChanged?.();
        return true;
    },

    getTreePublishedShareCode(treeId) {
        const entry = this.state.trees.find((t) => t.id === treeId);
        if (!entry?.publishedNetworkUrl || entry.publishPending) return null;
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
        delete entry.publishedListInDiscover;
        delete entry.publishedForumEnabled;
        delete entry.publishPending;
        delete entry.publishedBundleGen;
        if (entry.data?.meta && typeof entry.data.meta === 'object') {
            delete entry.data.meta.shareCode;
        }
        this.state.trees = [...this.state.trees];
        this.markTreeDirty(id);
        this.persist();
        this.notifyCatalogChanged?.();
        return true;
    },

    markTreeAsPrivateSyncedFromAccount(treeId) {
        const id = String(treeId || '').trim();
        if (!id) return false;
        const entry = this.state.trees.find((t) => t.id === id);
        if (!entry) return false;
        entry.privateSyncedFromAccount = true;
        this.state.trees = [...this.state.trees];
        this.markTreeDirty(id);
        this.persist();
        this.notifyCatalogChanged?.();
        return true;
    },

    unmarkTreePrivateSyncedFromAccount(treeId) {
        const id = String(treeId || '').trim();
        if (!id) return false;
        const entry = this.state.trees.find((t) => t.id === id);
        if (!entry) return false;
        delete entry.privateSyncedFromAccount;
        this.state.trees = [...this.state.trees];
        this.markTreeDirty(id);
        this.persist();
        this.notifyCatalogChanged?.();
        return true;
    },

    isTreePrivateSyncedFromAccount(treeId) {
        const id = String(treeId || '').trim();
        if (!id) return false;
        const entry = this.state.trees.find((t) => t.id === id);
        return !!(entry && entry.privateSyncedFromAccount);
    },
};
