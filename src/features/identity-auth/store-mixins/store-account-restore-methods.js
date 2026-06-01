import { isNostrNetworkAvailable } from '../../nostr/nostr-universe.js';
import { formatNostrTreeUrl } from '../../nostr/nostr-refs.js';

/** After-sign-in restore flows: owned trees, installed sources, private trees, owned progress. */
export const storeAccountRestoreMethods = {
    /**
     * Phase 2: pull encrypted progress for every directory tree owned by this
     * user. Runs in the background so the UI does not block on it. Only the
     * tree-list and the per-user pair are required; the active source does
     * not need to match (progress for non-active trees is still hydrated so
     * gamification/seeds counts reflect the network state).
     */
    _scheduleLoadOwnedProgressAfterSignIn(username) {
        const name = String(username || '').trim();
        if (!name) return;
        queueMicrotask(async () => {
            try {
                await this._loadProgressForOwnedTrees(name);
            } catch (e) {
                console.warn('Owned-progress pull failed', e);
            }
        });
    },

    async _loadProgressForOwnedTrees(username) {
        if (!isNostrNetworkAvailable()) return;
        if (typeof this.nostr.listGlobalTreeDirectoryEntriesOnce !== 'function') return;
        const pair = await this.ensureNetworkUserPair();
        if (!(pair && pair.pub)) return;
        const rows = await this.nostr.listGlobalTreeDirectoryEntriesOnce({ limit: 200, query: username });
        const wanted = String(username || '').trim().toLowerCase();
        const matches = (Array.isArray(rows) ? rows : []).filter(
            (r) => String(r && r.authorName || '').trim().toLowerCase() === wanted
        );
        const seen = new Set();
        for (const meta of matches) {
            const pub = String(meta.ownerPub || '');
            const universeId = String(meta.universeId || '');
            if (!pub || !universeId) continue;
            const key = `${pub}:${universeId}`;
            if (seen.has(key)) continue;
            seen.add(key);
            try {
                await this.loadNetworkProgressIntoUserStore({ pub, universeId });
            } catch { /* per-tree best-effort */ }
        }
    },

    /**
     * Phase 3: pull the user's encrypted installed-sources blob and merge with
     * the local sources list. Newly seen entries are added; existing ones are
     * preserved (the local list is the canonical state of THIS device, the
     * blob is a "what other devices installed" hint).
     */
    _scheduleLoadInstalledSourcesAfterSignIn(username) {
        const name = String(username || '').trim();
        if (!name) return;
        queueMicrotask(async () => {
            try {
                await this.loadInstalledSourcesFromAccount(name);
            } catch (e) {
                console.warn('Installed sources pull failed', e);
            }
        });
    },

    async loadInstalledSourcesFromAccount(username) {
        if (!isNostrNetworkAvailable()) return 0;
        const ct = await this.nostr.loadUserSourcesEncryptedOnce(username);
        if (!ct) return 0;
        const pair = await this.ensureNetworkUserPair();
        if (!(pair && pair.pub)) return 0;
        let body;
        try {
            body = await this.nostr.decryptForSelf({ pair, encrypted: ct });
        } catch (e) {
            console.warn('Installed sources decrypt failed', e);
            return 0;
        }
        const list = Array.isArray(body?.sources) ? body.sources : [];
        let added = 0;
        for (const src of list) {
            if (!src || typeof src !== 'object') continue;
            const url = String(src.url || '').trim();
            if (!url || url.startsWith('local://') || url.startsWith('privtree://')) continue;
            try {
                const res = this.sourceManager.addCommunitySource(null, {
                    resolvedNostrTreeUrl: url,
                    listMeta: { title: src.name || src.title || '', authorName: src.authorName || '' },
                    recommendedRelays: Array.isArray(src.recommendedRelays) ? src.recommendedRelays : []
                });
                if (res && res.ok) added += 1;
            } catch { /* ignore one bad entry */ }
        }
        if (added) this.update({});
        return added;
    },

    /**
     * Phase 3: publish the user's current community sources list (after any
     * add/remove) encrypted to the user pair. Best-effort, debounced so a
     * burst of UI changes does not flood relays.
     */
    publishInstalledSourcesForAccount() {
        if (!this.isSignedIn() || !isNostrNetworkAvailable()) return;
        const name = String(this._authSession?.username || '').trim();
        if (!name) return;
        if (this._installedSourcesPublishTimer) clearTimeout(this._installedSourcesPublishTimer);
        this._installedSourcesPublishTimer = setTimeout(async () => {
            this._installedSourcesPublishTimer = null;
            try {
                const pair = await this.ensureNetworkUserPair();
                if (!(pair && pair.pub)) return;
                const sources = (this.state.communitySources || [])
                    .filter((s) => s && s.url && !String(s.url).startsWith('local://') && !String(s.url).startsWith('privtree://'))
                    .map((s) => ({
                        id: s.id,
                        name: s.name || '',
                        url: s.url,
                        authorName: s.authorName || '',
                        recommendedRelays: Array.isArray(s.recommendedRelays) ? s.recommendedRelays : []
                    }));
                const body = { v: 1, sources, updatedAt: new Date().toISOString() };
                const encryptedContent = await this.nostr.encryptForSelf({ pair, data: body });
                this.nostr.putUserSourcesEncrypted({ username: name, encryptedContent });
            } catch (e) {
                console.warn('Installed sources publish failed', e);
            }
        }, 800);
    },

    /**
     * Phase 4: load encrypted private-tree blobs published under this username
     * and add them as in-memory `privtree://` community sources backed by the
     * user-store's localTrees entries.
     */
    _scheduleLoadPrivateTreesAfterSignIn(username) {
        const name = String(username || '').trim();
        if (!name) return;
        queueMicrotask(async () => {
            try {
                await this.loadPrivateTreesFromAccount(name);
            } catch (e) {
                console.warn('Private trees pull failed', e);
            }
        });
    },

    async loadPrivateTreesFromAccount(username) {
        if (!isNostrNetworkAvailable()) return 0;
        const list = await this.nostr.listPrivateTreeBlobsOnce(username);
        if (!Array.isArray(list) || !list.length) return 0;
        const pair = await this.ensureNetworkUserPair();
        if (!(pair && pair.pub)) return 0;
        let added = 0;
        for (const row of list) {
            try {
                const body = await this.nostr.decryptForSelf({ pair, encrypted: row.encryptedContent });
                if (!body || typeof body !== 'object') continue;
                const treeId = String(row.treeId || body.id || '').trim();
                if (!treeId) continue;
                const data = body.data && typeof body.data === 'object' ? body.data : null;
                if (!data) continue;
                const ok = this.userStore.upsertPrivateLocalTreeFromAccount({
                    id: treeId,
                    name: String(body.name || data.universeName || treeId),
                    data,
                    updatedAt: row.updatedAt
                });
                if (ok) added += 1;
            } catch { /* one tree failure is non-fatal */ }
        }
        if (added) {
            this.sourceManager.refreshPrivateAccountSources?.();
            this.update({});
        }
        return added;
    },

    /**
     * Phase 4: publish a local tree as a private synced blob under the user
     * account so other devices that sign in with the same sync secret get it.
     * The tree continues to live in `localTrees`; this only mirrors it to
     * Nostr (encrypted to the user pair).
     */
    async publishActiveLocalTreeAsPrivate() {
        const ui = this.ui;
        if (!this.isSignedIn()) {
            throw new Error(ui.syncLoginNoAccount || 'Sign in with your account first.');
        }
        const sess = this._authSession;
        const name = String(sess?.username || '').trim();
        if (!name) {
            throw new Error(ui.syncLoginNoAccount || 'Sign in with your account first.');
        }
        if (!isNostrNetworkAvailable()) {
            throw new Error(ui.nostrNotLoadedHint || 'Nostr relays unavailable.');
        }
        const srcUrl = String(this.state.activeSource?.url || '');
        if (!srcUrl.startsWith('local://')) {
            throw new Error(ui.privateTreesOnlyLocalSource || 'Open a local tree first.');
        }
        const localId = srcUrl.slice('local://'.length);
        const entry = (this.userStore.state.localTrees || []).find((t) => t.id === localId);
        if (!entry) {
            throw new Error(ui.privateTreesLocalMissing || 'That local tree is missing.');
        }
        const pair = await this.ensureNetworkUserPair();
        if (!(pair && pair.pub)) {
            throw new Error(ui.nostrNotLoadedHint || 'Could not derive your user key.');
        }
        const body = {
            v: 1,
            id: localId,
            name: entry.name || entry.data?.universeName || localId,
            data: entry.data,
            updatedAt: new Date().toISOString()
        };
        const encryptedContent = await this.nostr.encryptForSelf({ pair, data: body });
        this.nostr.putPrivateTreeBlob({ username: name, treeId: localId, encryptedContent });
        this.userStore.markLocalTreeAsPrivateSyncedFromAccount?.(localId);
        this.sourceManager.refreshPrivateAccountSources?.();
        this.update({});
        this.notify(ui.privateTreesPublishedOk || 'Private tree synced to your account.', false);
    },

    /**
     * Phase 4: take a private tree off the user account (other devices won't
     * see it after this). The local copy on this device is untouched.
     */
    async unpublishPrivateLocalTree(treeId) {
        const id = String(treeId || '').trim();
        if (!id) return;
        if (!this.isSignedIn()) return;
        const name = String(this._authSession?.username || '').trim();
        if (!name || !isNostrNetworkAvailable()) return;
        this.nostr.clearPrivateTreeBlob({ username: name, treeId: id });
        this.userStore.unmarkLocalTreePrivateSyncedFromAccount?.(id);
        this.sourceManager.refreshPrivateAccountSources?.();
        this.update({});
    },

    /**
     * Scan the global tree directory for entries published under this username and
     * append them to community sources, so a fresh device gets the user's trees
     * back automatically. Best-effort; relies on `authorName` matching the session
     * username (which the publish path now auto-populates from the local identity).
     */
    _scheduleLoadOwnedTreesAfterSignIn(username) {
        const name = String(username || '').trim();
        if (!name) return;
        queueMicrotask(async () => {
            try {
                await this.loadOwnedTreesFromDirectory(name);
            } catch { /* best-effort */ }
        });
    },

    /**
     * @param {string} username
     * @returns {Promise<number>} number of trees newly added as community sources
     */
    async loadOwnedTreesFromDirectory(username) {
        const name = String(username || '').trim();
        if (!name || !isNostrNetworkAvailable()) return 0;
        if (typeof this.nostr.listGlobalTreeDirectoryEntriesOnce !== 'function') return 0;
        const rows = await this.nostr.listGlobalTreeDirectoryEntriesOnce({ limit: 200, query: name });
        const wanted = name.toLowerCase();
        const matches = (Array.isArray(rows) ? rows : []).filter(
            (r) => String(r && r.authorName || '').trim().toLowerCase() === wanted
        );
        let added = 0;
        for (const meta of matches) {
            const ownerPub = String(meta.ownerPub || '');
            const universeId = String(meta.universeId || '');
            if (!ownerPub || !universeId) continue;
            const url = formatNostrTreeUrl(ownerPub, universeId);
            const res = this.sourceManager.addCommunitySource(null, {
                resolvedNostrTreeUrl: url,
                listMeta: { title: meta.title, authorName: meta.authorName, description: meta.description },
                recommendedRelays: Array.isArray(meta.recommendedRelays) ? meta.recommendedRelays : []
            });
            if (res && res.ok) added += 1;
        }
        if (added) this.publishInstalledSourcesForAccount();
        return added;
    }
};
