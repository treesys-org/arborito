import { isNostrNetworkAvailable, parseNostrTreeUrl, formatNostrTreeUrl } from '../../nostr/nostr-refs.js';

/** Mixin applied to `Store.prototype` — extracted from `store.js` to reduce file size. */
export const storeNostrSyncProgressMethods = {
    // --- Encrypted progress sync (Nostr) ---
    getProgressPayloadForSync(persistencePayload) {
        const p = persistencePayload || this.userStore.getPersistenceData();
        return {
            v: 1,
            updatedAt: new Date().toISOString(),
            progress: Array.isArray(p.progress) ? p.progress : [],
            memory: p.memory && typeof p.memory === 'object' ? p.memory : {},
            bookmarks: p.bookmarks && typeof p.bookmarks === 'object' ? p.bookmarks : {},
            gamification: p.gamification && typeof p.gamification === 'object' ? p.gamification : {},
            gameData: p.gameData && typeof p.gameData === 'object' ? p.gameData : {}
        };
    },

    maybeSyncNetworkProgress(persistencePayload) {
        if (!(this.userStore && this.userStore.state && this.userStore.state.cloudProgressSync)) return;
        if (!isNostrNetworkAvailable()) return;
        const treeRef = this.getActivePublicTreeRef();
        if (!treeRef) return;
        clearTimeout(this._nostrProgressSyncTimer);
        this._nostrProgressSyncTimer = setTimeout(() => {
            void this.syncNetworkProgressNow(persistencePayload);
        }, 800);
    },

    async syncNetworkProgressNow(persistencePayload) {
        if (!isNostrNetworkAvailable()) return;
        const treeRef = this.getActivePublicTreeRef();
        if (!treeRef) return;
        if (this._nostrProgressSyncInFlight) return;
        this._nostrProgressSyncInFlight = true;
        try {
            const pair = await this.ensureNetworkUserPair();
            if (!(pair && pair.pub)) return;
            const payload = this.getProgressPayloadForSync(persistencePayload);
            const encrypted = await this.nostr.encryptForSelf({ pair, data: payload });
            // Replicate to a small set of relays (reduces “whole network” pressure; favors configured peers).
            const peers = Array.isArray((this.nostr && this.nostr.peers)) ? this.nostr.peers : [];
            const K = 3;
            const targets = peers.slice(0, K);
            this.nostr.putUserProgressReplicated({
                ...treeRef,
                userPub: pair.pub,
                record: { ct: encrypted, updatedAt: payload.updatedAt },
                peers: targets
            });
        } catch (e) {
            console.warn('Network progress sync failed', e);
        } finally {
            this._nostrProgressSyncInFlight = false;
        }
    },

    async loadNetworkProgressIntoUserStore(treeRef) {
        if (!(this.userStore && this.userStore.state && this.userStore.state.cloudProgressSync)) return false;
        if (!isNostrNetworkAvailable()) return false;
        try {
            const pair = await this.ensureNetworkUserPair();
            if (!(pair && pair.pub)) return false;
            const rec = await this.nostr.getUserProgress({ ...treeRef, userPub: pair.pub });
            if (!(rec && rec.ct)) return false;
            const data = await this.nostr.decryptForSelf({ pair, encrypted: rec.ct });
            if (!data || typeof data !== 'object') return false;

            // Public tree model: remote encrypted progress is the canonical source of truth.
            // We never prompt to overwrite. We hydrate deterministically and safely:
            // - completedNodes: monotonic union (never lose local progress)
            // - memory/bookmarks/gameData: prefer remote snapshot
            // - gamification: prefer max stats, never force identity fields

            if (Array.isArray(data.progress)) {
                this.userStore.state.completedNodes = new Set([
                    ...this.userStore.state.completedNodes,
                    ...data.progress
                ]);
            }
            if (data.memory && typeof data.memory === 'object') {
                this.userStore.state.memory = { ...data.memory };
            }
            if (data.bookmarks && typeof data.bookmarks === 'object') {
                this.userStore.state.bookmarks = { ...data.bookmarks };
            }
            if (data.gameData && typeof data.gameData === 'object') {
                this.userStore.state.gameData = { ...data.gameData };
            }
            if (data.gamification && typeof data.gamification === 'object') {
                const g = this.userStore.state.gamification;
                const bg = data.gamification;
                if ((bg.xp || 0) > (g.xp || 0)) g.xp = bg.xp;
                g.dailyXP = Math.max(g.dailyXP || 0, bg.dailyXP || 0);
                g.streak = Math.max(g.streak || 0, bg.streak || 0);
                if (!g.username && bg.username) g.username = bg.username;
                if ((!g.avatar || g.avatar === '👤' || g.avatar === '🌱') && bg.avatar) g.avatar = bg.avatar;
            }

            this.userStore.persist();
            this.update({});
            return true;
        } catch (e) {
            console.warn('Network progress load failed', e);
            return false;
        }
    },

    /**
     * Post-load, non-blocking nudge: show a banner (not a modal) on public trees
     * when cloud sync is disabled and the user already has local progress.
     */
    maybeShowCloudSyncBannerForSource(source) {
        try {
            if (this.value.constructionMode) return;
            if ((this.userStore && this.userStore.state && this.userStore.state.cloudProgressSync)) return;
            const treeRef = parseNostrTreeUrl(String((source && source.url) || ''));
            if (!treeRef) return;
            const hasLocalProgress = ((this.userStore?.state?.completedNodes?.size) || 0) > 0;
            // If user has no progress yet, the banner is not useful.
            if (!hasLocalProgress) return;
            const key = `arborito-cloudsync-banner-seen:${treeRef.pub}:${treeRef.universeId}`;
            if (sessionStorage.getItem(key)) return;
            this.update({
                cloudSyncBanner: {
                    pub: treeRef.pub,
                    universeId: treeRef.universeId,
                    sourceId: (source && source.id) || null,
                    url: formatNostrTreeUrl(treeRef.pub, treeRef.universeId)
                }
            });
        } catch {
            /* ignore */
        }
    },

    dismissCloudSyncBanner() {
        const b = this.value.cloudSyncBanner;
        if ((b && b.pub) && (b && b.universeId)) {
            try {
                sessionStorage.setItem(`arborito-cloudsync-banner-seen:${b.pub}:${b.universeId}`, '1');
            } catch {
                /* ignore */
            }
        }
        this.update({ cloudSyncBanner: null });
    },

    enableCloudSyncFromBanner() {
        this.userStore.state.cloudProgressSync = true;
        this.userStore.persist();
        this.dismissCloudSyncBanner();
        try {
            this.maybeSyncNetworkProgress(this.userStore.getPersistenceData());
        } catch {
            /* ignore */
        }
        this.notify(this.ui.profileExportOk || 'Saved.', false);
    }

};
