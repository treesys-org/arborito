export const branchPublishMixin = {
    /**
     * Ingest a private-tree blob pulled from the user account on Nostr.
     * - If a local tree with the same id already exists and is marked as
     *   account-synced, its data is replaced when the incoming blob is newer.
     * - Otherwise a new `branches` entry is created with the account-synced
     *   flag set so the UI knows where it came from.
     *
     * Local-only trees that happen to share an id are left untouched (we never
     * silently overwrite a user's local-only work).
     *
     * @param {{ id: string, name: string, data: object, updatedAt?: string }} payload
     * @returns {boolean} true if a new entry was created or an existing one was updated
     */
    upsertPrivateBranchFromAccount(payload) {
        const id = String((payload && payload.id) || '').trim();
        if (!id) return false;
        const data = (payload && payload.data) || null;
        if (!data || typeof data !== 'object') return false;
        const name = String(payload.name || data.universeName || id);
        const updatedTs = (() => {
            const parsed = Date.parse(payload.updatedAt || '');
            return Number.isFinite(parsed) ? parsed : Date.now();
        })();
        const existing = this.state.branches.find((t) => t.id === id);
        if (existing) {
            if (!existing.privateSyncedFromAccount) return false;
            const sameOrOlder = (existing.updated || 0) >= updatedTs;
            if (sameOrOlder) return false;
            existing.data = data;
            existing.name = name;
            existing.updated = updatedTs;
            this.state.branches = [...this.state.branches];
            /* Pull/restore must not enqueue a quiet re-upload of the same blob. */
            this.markBranchDirty(id, { skipAccountSync: true });
            this.persist();
            return true;
        }
        this.state.branches = [
            ...this.state.branches,
            {
                id,
                name,
                data,
                updated: updatedTs,
                privateSyncedFromAccount: true
            }
        ];
        this.markBranchDirty(id, { skipAccountSync: true });
        this.persist();
        return true;
    },

    /** Mark an existing local tree as private-synced (after account draft publish). */
    markBranchAsPrivateSyncedFromAccount(id) {
        const treeId = String(id || '').trim();
        if (!treeId) return false;
        const entry = this.state.branches.find((t) => t.id === treeId);
        if (!entry) return false;
        entry.privateSyncedFromAccount = true;
        this.state.branches = [...this.state.branches];
        /* Flag-only: do not enqueue another account republish. */
        this.markBranchDirty(treeId, { skipAccountSync: true });
        this.persist();
        return true;
    },

    unmarkBranchPrivateSyncedFromAccount(id) {
        const treeId = String(id || '').trim();
        if (!treeId) return false;
        const entry = this.state.branches.find((t) => t.id === treeId);
        if (!entry) return false;
        delete entry.privateSyncedFromAccount;
        this.state.branches = [...this.state.branches];
        this._privateAccountSyncDirty?.delete(treeId);
        this.markBranchDirty(treeId, { skipAccountSync: true });
        this.persist();
        return true;
    },

    /** Soft sign-out: clear account-sync badges without deleting local branch data. */
    clearAllPrivateSyncedFromAccountFlags() {
        const branches = Array.isArray(this.state.branches) ? this.state.branches : [];
        let changed = 0;
        for (const entry of branches) {
            if (!entry?.privateSyncedFromAccount) continue;
            delete entry.privateSyncedFromAccount;
            changed += 1;
            if (entry.id) {
                this._privateAccountSyncDirty?.delete(entry.id);
                this.markBranchDirty(entry.id, { skipAccountSync: true });
            }
        }
        if (!changed) return 0;
        this.state.branches = [...branches];
        this.persist();
        return changed;
    },

    isBranchPrivateSyncedFromAccount(id) {
        const treeId = String(id || '').trim();
        if (!treeId) return false;
        const entry = this.state.branches.find((t) => t.id === treeId);
        return !!(entry && entry.privateSyncedFromAccount);
    },

    /**
     * After publishing a local garden to Nostr, the active source may stay `branch://…`;
     * we keep the public tree URL on the tree entry for governance copy and hints.
     */
    setBranchPublishedNetworkUrl(treeId, treeUrl, shareCode = null) {
        const id = String(treeId || '').trim();
        const url = String(treeUrl || '').trim();
        if (!id || !url) return false;
        const treeEntry = this.state.branches.find((t) => t.id === id);
        if (!treeEntry) return false;
        treeEntry.publishedNetworkUrl = url;
        treeEntry.publishedAt = Date.now();
        if (shareCode != null && String(shareCode).trim()) {
            treeEntry.publishedShareCode = String(shareCode).trim();
        }
        this.state.branches = [...this.state.branches];
        this.markBranchDirty(treeId);
        this.persist();
        return true;
    },

    getBranchPublishedShareCode(treeId) {
        const id = String(treeId || '').trim();
        if (!id) return null;
        const treeEntry = this.state.branches.find((t) => t.id === id);
        if (!treeEntry?.publishedNetworkUrl) return null;
        const code =
            treeEntry.publishedShareCode ||
            treeEntry?.data?.meta?.shareCode ||
            treeEntry?.publishedSnapshot?.meta?.shareCode ||
            null;
        return code ? String(code).trim() : null;
    },

    getBranchPublishedNetworkUrl(treeId) {
        const id = String(treeId || '').trim();
        if (!id) return null;
        const treeEntry = this.state.branches.find((t) => t.id === id);
        const url = (treeEntry && treeEntry.publishedNetworkUrl) || null;
        return url ? String(url) : null;
    },

    clearBranchPublishedNetworkUrl(treeId) {
        const id = String(treeId || '').trim();
        if (!id) return false;
        const treeEntry = this.state.branches.find((t) => t.id === id);
        if (!treeEntry || !treeEntry.publishedNetworkUrl) return false;
        delete treeEntry.publishedNetworkUrl;
        delete treeEntry.publishedAt;
        delete treeEntry.publishedShareCode;
        if (treeEntry.data?.meta && typeof treeEntry.data.meta === 'object') {
            delete treeEntry.data.meta.shareCode;
            delete treeEntry.data.meta.publishedNetworkUrl;
        }
        if (treeEntry.publishedSnapshot?.meta && typeof treeEntry.publishedSnapshot.meta === 'object') {
            delete treeEntry.publishedSnapshot.meta.shareCode;
        }
        this.state.branches = [...this.state.branches];
        this.markBranchDirty(treeId);
        this.persist();
        return true;
    },

    setBranchPublishedSnapshot(treeId, treeData) {
        const id = String(treeId || '').trim();
        if (!id) return false;
        const treeEntry = this.state.branches.find((t) => t.id === id);
        if (!treeEntry) return false;
        try {
            treeEntry.publishedSnapshot = JSON.parse(JSON.stringify(treeData || null));
        } catch {
            treeEntry.publishedSnapshot = treeData || null;
        }
        treeEntry.publishedSnapshotHash = this.hashJson(treeEntry.publishedSnapshot);
        treeEntry.publishedSnapshotAt = Date.now();
        this.state.branches = [...this.state.branches];
        this.markBranchDirty(treeId);
        this.persist();
        return true;
    }
};
