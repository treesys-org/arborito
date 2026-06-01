export const localTreePublishMixin = {
    /**
     * Phase 4: ingest a private-tree blob pulled from the user account on Nostr.
     * - If a local tree with the same id already exists and is marked as
     *   account-synced, its data is replaced when the incoming blob is newer.
     * - Otherwise a new `localTrees` entry is created with the account-synced
     *   flag set so the UI knows where it came from.
     *
     * Local-only trees that happen to share an id are left untouched (we never
     * silently overwrite a user's local-only work).
     *
     * @param {{ id: string, name: string, data: object, updatedAt?: string }} payload
     * @returns {boolean} true if a new entry was created or an existing one was updated
     */
    upsertPrivateLocalTreeFromAccount(payload) {
        const id = String((payload && payload.id) || '').trim();
        if (!id) return false;
        const data = (payload && payload.data) || null;
        if (!data || typeof data !== 'object') return false;
        const name = String(payload.name || data.universeName || id);
        const updatedTs = (() => {
            const parsed = Date.parse(payload.updatedAt || '');
            return Number.isFinite(parsed) ? parsed : Date.now();
        })();
        const existing = this.state.localTrees.find((t) => t.id === id);
        if (existing) {
            if (!existing.privateSyncedFromAccount) return false;
            const sameOrOlder = (existing.updated || 0) >= updatedTs;
            if (sameOrOlder) return false;
            existing.data = data;
            existing.name = name;
            existing.updated = updatedTs;
            this.state.localTrees = [...this.state.localTrees];
            this.persist();
            return true;
        }
        this.state.localTrees = [
            ...this.state.localTrees,
            {
                id,
                name,
                data,
                updated: updatedTs,
                privateSyncedFromAccount: true
            }
        ];
        this.persist();
        return true;
    },

    /** Phase 4: mark an existing local tree as private-synced (after the user
     * promotes it manually via "Publish as private"). */
    markLocalTreeAsPrivateSyncedFromAccount(id) {
        const treeId = String(id || '').trim();
        if (!treeId) return false;
        const entry = this.state.localTrees.find((t) => t.id === treeId);
        if (!entry) return false;
        entry.privateSyncedFromAccount = true;
        this.state.localTrees = [...this.state.localTrees];
        this.persist();
        return true;
    },

    unmarkLocalTreePrivateSyncedFromAccount(id) {
        const treeId = String(id || '').trim();
        if (!treeId) return false;
        const entry = this.state.localTrees.find((t) => t.id === treeId);
        if (!entry) return false;
        delete entry.privateSyncedFromAccount;
        this.state.localTrees = [...this.state.localTrees];
        this.persist();
        return true;
    },

    isLocalTreePrivateSyncedFromAccount(id) {
        const treeId = String(id || '').trim();
        if (!treeId) return false;
        const entry = this.state.localTrees.find((t) => t.id === treeId);
        return !!(entry && entry.privateSyncedFromAccount);
    },

    /**
     * After publishing a local garden to Nostr, the active source may stay `local://…`;
     * we keep the public tree URL on the tree entry for governance copy and hints.
     */
    setLocalTreePublishedNetworkUrl(treeId, treeUrl) {
        const id = String(treeId || '').trim();
        const url = String(treeUrl || '').trim();
        if (!id || !url) return false;
        const treeEntry = this.state.localTrees.find((t) => t.id === id);
        if (!treeEntry) return false;
        treeEntry.publishedNetworkUrl = url;
        treeEntry.publishedAt = Date.now();
        this.state.localTrees = [...this.state.localTrees];
        this.persist();
        return true;
    },

    getLocalTreePublishedNetworkUrl(treeId) {
        const id = String(treeId || '').trim();
        if (!id) return null;
        const treeEntry = this.state.localTrees.find((t) => t.id === id);
        const url = (treeEntry && treeEntry.publishedNetworkUrl) || null;
        return url ? String(url) : null;
    },

    clearLocalTreePublishedNetworkUrl(treeId) {
        const id = String(treeId || '').trim();
        if (!id) return false;
        const treeEntry = this.state.localTrees.find((t) => t.id === id);
        if (!treeEntry || !treeEntry.publishedNetworkUrl) return false;
        delete treeEntry.publishedNetworkUrl;
        delete treeEntry.publishedAt;
        this.state.localTrees = [...this.state.localTrees];
        this.persist();
        return true;
    },

    setLocalTreePublishedSnapshot(treeId, treeData) {
        const id = String(treeId || '').trim();
        if (!id) return false;
        const treeEntry = this.state.localTrees.find((t) => t.id === id);
        if (!treeEntry) return false;
        try {
            treeEntry.publishedSnapshot = JSON.parse(JSON.stringify(treeData || null));
        } catch {
            treeEntry.publishedSnapshot = treeData || null;
        }
        treeEntry.publishedSnapshotHash = this.hashJson(treeEntry.publishedSnapshot);
        treeEntry.publishedSnapshotAt = Date.now();
        this.state.localTrees = [...this.state.localTrees];
        this.persist();
        return true;
    }
};
