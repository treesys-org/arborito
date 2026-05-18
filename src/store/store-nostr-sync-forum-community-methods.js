import { fileSystem } from '../services/filesystem.js';
import { isNostrNetworkAvailable, parseNostrTreeUrl, formatNostrTreeUrl, createNostrPair } from '../services/nostr-refs.js';
import { resolveTreeInput } from '../config/tree-aliases.js';

/** Mixin applied to `Store.prototype` — extracted from `store.js` to reduce file size. */
export const nostrSyncForumCommunityMethods = {
    /**
     * Forum moderation: construction mode + local owner, or Tree publisher key on device.
     */
    canModerateForum() {
        const treeRef = this.getActivePublicTreeRef();
        if (treeRef) {
            // Network forums are live; allow owner + invited editors to moderate without requiring construction mode.
            const r = typeof this.getMyTreeNetworkRole === 'function' ? this.getMyTreeNetworkRole() : null;
            return r === 'owner' || r === 'editor';
        }
        if (!this.state.constructionMode) return false;
        if (!this.state.activeSource || !this.state.rawGraphData) return false;
        return fileSystem.isLocal;
    },
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

    /**
     * Resolve a Nostr version snapshot: if it is a `{ treeSnapshotRef }` placeholder, load the graph from chunks.snapshots.
     * @param {string} snapId
     * @returns {Promise<object|null>}
     */
    async materializeNetworkReleaseSnapshot(snapId) {
        const raw = this.state.rawGraphData;
        if (!(raw && raw.releaseSnapshots)) return null;
        const sid = String(snapId);
        const slot = raw.releaseSnapshots[sid];
        if (!slot || typeof slot !== 'object') return null;
        const snapshotKey = slot.treeSnapshotRef;
        if (!snapshotKey) return slot;
        const treeRef = this.getActivePublicTreeRef();
        if (!treeRef) return null;
        try {
            const data = await this.nostr.loadNostrSnapshotChunk({
                pub: treeRef.pub,
                universeId: treeRef.universeId,
                snapshotKey
            });
            if (!data || typeof data !== 'object') return null;
            const nextRaw = JSON.parse(JSON.stringify(raw));
            nextRaw.releaseSnapshots[sid] = data;
            this.update({ rawGraphData: nextRaw });
            return data;
        } catch (e) {
            console.warn('materializeNetworkReleaseSnapshot', e);
            return null;
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
    },

    /**
     * Nostr tree: first forum open loads chunked `chunks.forum` + live `forum.*` and merges with local.
     * Later opens only refresh the live map (the chunk pack is not re-downloaded).
     */
    async hydrateTreeForumIfNeeded() {
        const src = this.state.activeSource;
        const ref = (src && src.url) ? parseNostrTreeUrl(String(src.url)) : null;
        if (!ref || !isNostrNetworkAvailable()) return;
        const sid = String(src.id || '');
        if (!sid) return;

        try {
            // v2 forum: do not do a global census. Threads/messages are loaded lazily per place/thread.
            if (this._treeForumHydratedForSourceId !== sid) {
                this._treeForumLoadedPlaces = new Set();
                this._treeForumLoadedThreads = new Set();
                this._treeForumLoadedThreadWeeks = new Map();
                this._treeForumHydratedForSourceId = sid;
            }
            this.update({});
        } catch (e) {
            console.warn('hydrateTreeForumIfNeeded', e);
        }
    },

    _treeForumPlaceKey(placeId) {
        return placeId == null || placeId === '' ? '_general' : String(placeId);
    },

    _isoWeekKey(isoString) {
        const d = isoString ? new Date(isoString) : new Date();
        // ISO week in UTC
        const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
        const dayNum = date.getUTCDay() || 7;
        date.setUTCDate(date.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
        const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
        const yyyy = date.getUTCFullYear();
        const ww = String(weekNo).padStart(2, '0');
        return `${yyyy}-W${ww}`;
    },

    async ensureTreeForumPlaceLoaded(placeId) {
        const src = this.state.activeSource;
        const ref = (src && src.url) ? parseNostrTreeUrl(String(src.url)) : null;
        if (!ref || !isNostrNetworkAvailable()) return false;
        const sid = String(src.id || '');
        if (!sid) return false;
        const key = this._treeForumPlaceKey(placeId);
        if (this._treeForumLoadedPlaces.has(key)) return true;
        try {
            const threads = await this.nostr.loadThreadsByPlaceV3({ ...ref, placeId });
            this.forumStore.mergeThreads(sid, threads);
            this._treeForumLoadedPlaces.add(key);
            this.update({});
            return true;
        } catch (e) {
            console.warn('ensureTreeForumPlaceLoaded', e);
            return false;
        }
    },

    async ensureTreeForumThreadLoaded(threadId, opts = {}) {
        const src = this.state.activeSource;
        const ref = (src && src.url) ? parseNostrTreeUrl(String(src.url)) : null;
        if (!ref || !isNostrNetworkAvailable()) return false;
        const sid = String(src.id || '');
        if (!sid) return false;
        const tid = String(threadId || '');
        if (!tid) return false;
        if (this._treeForumLoadedThreads.has(tid)) return true;
        try {
            const wk = this._isoWeekKey(new Date().toISOString());
            await this.ensureTreeForumThreadWeekLoaded(tid, wk);
            this._treeForumLoadedThreads.add(tid);
            this.update({});
            return true;
        } catch (e) {
            console.warn('ensureTreeForumThreadLoaded', e);
            return false;
        }
    },

    async ensureTreeForumThreadWeekLoaded(threadId, weekKey) {
        const src = this.state.activeSource;
        const ref = (src && src.url) ? parseNostrTreeUrl(String(src.url)) : null;
        if (!ref || !isNostrNetworkAvailable()) return false;
        const sid = String(src.id || '');
        if (!sid) return false;
        const tid = String(threadId || '');
        const wk = String(weekKey || '');
        if (!tid || !wk) return false;
        const loaded = this._treeForumLoadedThreadWeeks.get(tid) || new Set();
        if (loaded.has(wk)) return true;
        try {
            const pageRef = await this.nostr.loadThreadPageRefV3({ ...ref, threadId: tid, pageKey: wk });
            if ((pageRef && pageRef.magnet) && (pageRef && pageRef.path) && (this.webtorrent && this.webtorrent.available ? this.webtorrent.available() : false)) {
                const text = await this.webtorrent.readTextFile({
                    magnet: String(pageRef.magnet),
                    path: String(pageRef.path)
                });
                const page = JSON.parse(String(text || '').trim());
                // TTL: keep only recent posts (best-effort, client-side).
                const ttlMs = 30 * 24 * 60 * 60 * 1000;
                const cutoff = Date.now() - ttlMs;
                const msgs = Array.isArray((page && page.messages))
                    ? page.messages.filter((m) => {
                          try {
                              const t = new Date(String((m && m.createdAt) || '')).getTime();
                              return Number.isFinite(t) && t >= cutoff;
                          } catch {
                              return false;
                          }
                      })
                    : [];
                this.forumStore.mergeMessages(sid, msgs);
            }
            loaded.add(wk);
            this._treeForumLoadedThreadWeeks.set(tid, loaded);
            this.update({});
            return true;
        } catch (e) {
            console.warn('ensureTreeForumThreadWeekLoaded', e);
            return false;
        }
    },

    getLoadedForumThreadWeeks(threadId) {
        const tid = String(threadId || '');
        const s = this._treeForumLoadedThreadWeeks.get(tid);
        return s ? [...s.values()] : [];
    },

    async getTreeForumThreadWeeks(threadId) {
        const src = this.state.activeSource;
        const ref = (src && src.url) ? parseNostrTreeUrl(String(src.url)) : null;
        if (!ref || !isNostrNetworkAvailable()) return [];
        const tid = String(threadId || '');
        if (!tid) return [];
        try {
            const map = await this.nostr.loadThreadPageRefsV3({ ...ref, threadId: tid });
            const keys = [...map.keys()].filter((k) => k && k !== '_');
            keys.sort((a, b) => String(b).localeCompare(String(a)));
            return keys;
        } catch (e) {
            console.warn('getTreeForumThreadWeeks', e);
            return [];
        }
    },

    async searchTreeForumV3(query, opts = {}) {
        const q = String(query || '').trim().toLowerCase();
        if (!q) return [];
        const src = this.state.activeSource;
        const ref = (src && src.url) ? parseNostrTreeUrl(String(src.url)) : null;
        if (!ref || !isNostrNetworkAvailable()) return [];
        const maxWeeks = Math.max(1, Math.min(80, Number(opts.maxWeeks) || 16));
        const maxResults = Math.max(1, Math.min(200, Number(opts.maxResults) || 60));
        const ttlMs = 30 * 24 * 60 * 60 * 1000;
        const cutoff = Date.now() - ttlMs;
        try {
            const refs = await this.nostr.loadForumSearchRefsV3(ref);
            const keys = [...refs.keys()].filter(Boolean).sort((a, b) => String(b).localeCompare(String(a)));
            const out = [];
            for (const wk of keys.slice(0, maxWeeks)) {
                const r = refs.get(wk);
                if (!(r && r.magnet) || !(r && r.path) || !(this.webtorrent && this.webtorrent.available ? this.webtorrent.available() : false)) continue;
                let pack;
                try {
                    const text = await this.webtorrent.readTextFile({ magnet: String(r.magnet), path: String(r.path) });
                    pack = JSON.parse(String(text || '').trim());
                } catch {
                    continue;
                }
                const entries = Array.isArray((pack && pack.entries)) ? pack.entries : [];
                for (const e of entries) {
                    const body = String((e && e.body) || '');
                    if (!body) continue;
                    try {
                        const t = new Date(String((e && e.createdAt) || '')).getTime();
                        if (!Number.isFinite(t) || t < cutoff) continue;
                    } catch {
                        continue;
                    }
                    if (body.includes(q)) {
                        out.push({
                            weekKey: wk,
                            threadId: String(e.threadId || ''),
                            placeId: e.placeId != null && e.placeId !== '' ? String(e.placeId) : null,
                            createdAt: String(e.createdAt || ''),
                            msgId: String(e.id || ''),
                            snippet: body.length > 140 ? `${body.slice(0, 140)}…` : body
                        });
                        if (out.length >= maxResults) return out;
                    }
                }
            }
            return out;
        } catch (e) {
            console.warn('searchTreeForumV3', e);
            return [];
        }
    },

    _forumModerationCacheKey(treeRef) {
        return treeRef ? `${String(treeRef.pub)}:${String(treeRef.universeId)}` : '';
    },

    /** @returns {Promise<'free'|'strict'>} */
    async getForumModerationModeForActiveTree(treeRef) {
        if (!treeRef || !isNostrNetworkAvailable()) return 'free';
        const k = this._forumModerationCacheKey(treeRef);
        const now = Date.now();
        if ((this._forumModCache && this._forumModCache.key) === k && now - (this._forumModCache.t || 0) < 90_000) {
            return this._forumModCache.mode === 'strict' ? 'strict' : 'free';
        }
        let mode = 'free';
        try {
            mode = await this.nostr.loadForumModerationPolicyV3({ ...treeRef });
        } catch (e) {
            console.warn('getForumModerationModeForActiveTree', e);
        }
        this._forumModCache = { key: k, mode, t: now };
        return mode === 'strict' ? 'strict' : 'free';
    },

    invalidateForumModerationCache() {
        this._forumModCache = null;
    },

    /**
     * Publish an already-signed forum message to WebTorrent + Nostr v3 pointers (live path).
     */
    async publishSignedForumMessageV3(sourceId, treeRef, signed, threadForPlace) {
        try {
            const pageKey = this._isoWeekKey(signed.createdAt);
            const pagePath = `forum-pages/${String(signed.threadId)}/${pageKey}.json`;
            let existing = { version: 1, threadId: String(signed.threadId), pageKey, messages: [] };
            try {
                const prevRef = await this.nostr.loadThreadPageRefV3({ ...treeRef, threadId: signed.threadId, pageKey });
                if ((prevRef && prevRef.magnet) && (prevRef && prevRef.path) && (this.webtorrent && this.webtorrent.available ? this.webtorrent.available() : false)) {
                    const text = await this.webtorrent.readTextFile({
                        magnet: String(prevRef.magnet),
                        path: String(prevRef.path)
                    });
                    const parsed = JSON.parse(String(text || '').trim());
                    if (parsed && Array.isArray(parsed.messages)) existing = parsed;
                }
            } catch {
                /* ignore */
            }
            existing.messages = Array.isArray(existing.messages) ? existing.messages : [];
            const sid = String(sourceId || '');
            const already = existing.messages.some((m) => m && String(m.id) === String(signed.id));
            if (!already) existing.messages.push(signed);
            if ((this.webtorrent && this.webtorrent.available ? this.webtorrent.available() : false)) {
                const blob = new Blob([JSON.stringify(existing)], { type: 'application/json' });
                const file = new File([blob], pagePath, { type: 'application/json' });
                const magnet = await this.webtorrent.seedFiles({
                    key: `forum-${signed.threadId}-${pageKey}`,
                    files: [file]
                });
                this.nostr.putThreadPageRefV3({
                    ...treeRef,
                    threadId: signed.threadId,
                    pageKey,
                    ref: { version: 1, magnet, path: pagePath, updatedAt: new Date().toISOString() }
                });
                const searchPath = `forum-search/${pageKey}.json`;
                let searchPack = { version: 1, pageKey, entries: [] };
                try {
                    const refs = await this.nostr.loadForumSearchRefsV3(treeRef);
                    const sref = refs.get(pageKey);
                    if ((sref && sref.magnet) && (sref && sref.path) && (this.webtorrent && this.webtorrent.available ? this.webtorrent.available() : false)) {
                        const text = await this.webtorrent.readTextFile({
                            magnet: String(sref.magnet),
                            path: String(sref.path)
                        });
                        const parsed = JSON.parse(String(text || '').trim());
                        if (parsed && Array.isArray(parsed.entries)) searchPack = parsed;
                    }
                } catch {
                    /* ignore */
                }
                const norm = String(signed.body || '')
                    .toLowerCase()
                    .replace(/\s+/g, ' ')
                    .slice(0, 400);
                searchPack.entries = Array.isArray(searchPack.entries) ? searchPack.entries : [];
                const hasEntry = searchPack.entries.some((e) => e && String(e.id) === String(signed.id));
                if (!hasEntry) {
                    searchPack.entries.push({
                        id: signed.id,
                        threadId: signed.threadId,
                        placeId:
                            (threadForPlace && threadForPlace.nodeId) != null && threadForPlace.nodeId !== ''
                                ? String(threadForPlace.nodeId)
                                : null,
                        createdAt: signed.createdAt,
                        body: norm
                    });
                }
                const sblob = new Blob([JSON.stringify(searchPack)], { type: 'application/json' });
                const sfile = new File([sblob], searchPath, { type: 'application/json' });
                const smagnet = await this.webtorrent.seedFiles({ key: `forum-search-${pageKey}`, files: [sfile] });
                this.nostr.putForumSearchRefV3({
                    ...treeRef,
                    pageKey,
                    ref: { version: 1, magnet: smagnet, path: searchPath, updatedAt: new Date().toISOString() }
                });
            }
            return true;
        } catch (e) {
            console.warn('publishSignedForumMessageV3', e);
            return false;
        }
    },

    async setForumModerationPolicyMode(mode) {
        const ui = this.ui;
        const treeRef = this.getActivePublicTreeRef();
        if (!treeRef || !isNostrNetworkAvailable()) {
            this.notify(ui.governanceForumPolicyNeedNetwork || 'Open your published public tree to change forum settings.', true);
            return false;
        }
        if (!this.canModerateForum()) {
            this.notify(ui.governanceForumPolicyNoPermission || 'Only the tree owner (publisher key on this device) can change this.', true);
            return false;
        }
        const adminPair = this.getNostrPublisherPair(treeRef.pub);
        if (!(adminPair && adminPair.priv)) {
            this.notify(ui.governanceForumPolicyNoPermission || 'Only the tree owner can change this.', true);
            return false;
        }
        try {
            await this.nostr.putForumModerationPolicyV3({
                ...treeRef,
                adminPair,
                mode: mode === 'strict' ? 'strict' : 'free'
            });
            this.invalidateForumModerationCache();
            this.notify(ui.forumPolicySavedOk || 'Forum moderation setting saved.', false);
            this.update({});
            return true;
        } catch (e) {
            console.warn('setForumModerationPolicyMode', e);
            this.notify(ui.forumPolicySaveError || 'Could not save forum setting.', true);
            return false;
        }
    },

    /** @returns {Promise<{ id: string, threadId?: string, bodyPreview: string, createdAt?: string }[]>} */
    async listForumPendingSummariesForActiveTree() {
        const treeRef = this.getActivePublicTreeRef();
        if (!treeRef || !isNostrNetworkAvailable()) return [];
        try {
            const ids = await this.nostr.listPendingForumMessageIdsV3({ ...treeRef });
            const out = [];
            for (const id of ids) {
                const rec = await this.nostr.loadPendingForumMessageV3({ ...treeRef, messageId: id });
                if (!rec || typeof rec !== 'object' || !String(rec.body || '').trim()) continue;
                out.push({
                    id: String(rec.id || id),
                    threadId: String(rec.threadId || ''),
                    createdAt: String(rec.createdAt || ''),
                    bodyPreview:
                        String(rec.body || '').length > 140
                            ? `${String(rec.body || '').slice(0, 140)}…`
                            : String(rec.body || '')
                });
            }
            return out;
        } catch (e) {
            console.warn('listForumPendingSummariesForActiveTree', e);
            return [];
        }
    },

    async approveForumPendingMessage(sourceId, messageId) {
        if (!this.canModerateForum()) return false;
        const treeRef = this.getActivePublicTreeRef();
        if (!treeRef || !isNostrNetworkAvailable()) return false;
        const mid = String(messageId || '');
        if (!mid) return false;
        try {
            const signed = await this.nostr.loadPendingForumMessageV3({ ...treeRef, messageId: mid });
            if (!signed || typeof signed !== 'object' || !signed.sig) return false;
            const threadsSnap = (this.forumStore.bySourceId[String(sourceId)] ? this.forumStore.bySourceId[String(sourceId)].threads : undefined);
            const threadForPlace = Array.isArray(threadsSnap)
                ? threadsSnap.find((t) => t.id === signed.threadId)
                : null;
            const ok = await this.publishSignedForumMessageV3(sourceId, treeRef, signed, threadForPlace);
            if (!ok) {
                this.notify(this.ui.forumApproveFailed || 'Could not publish approved message.', true);
                return false;
            }
            this.nostr.clearPendingForumMessageV3({ ...treeRef, messageId: mid });
            this.forumStore.setMessagePendingApproval(sourceId, mid, false);
            this.update({});
            this.notify(this.ui.forumApprovedOk || 'Message approved and published.', false);
            return true;
        } catch (e) {
            console.warn('approveForumPendingMessage', e);
            this.notify(this.ui.forumApproveFailed || 'Could not approve message.', true);
            return false;
        }
    },

    async rejectForumPendingMessage(sourceId, messageId) {
        if (!this.canModerateForum()) return false;
        const treeRef = this.getActivePublicTreeRef();
        if (!treeRef || !isNostrNetworkAvailable()) return false;
        const mid = String(messageId || '');
        if (!mid) return false;
        try {
            this.nostr.clearPendingForumMessageV3({ ...treeRef, messageId: mid });
            this.forumStore.deleteMessage(sourceId, mid, {
                actor: (this.getNetworkUserPair() ? this.getNetworkUserPair().pub : undefined) || 'moderator'
            });
            this.update({});
            this.notify(this.ui.forumRejectedOk || 'Pending message removed.', false);
            return true;
        } catch (e) {
            console.warn('rejectForumPendingMessage', e);
            return false;
        }
    },

    addForumThread(sourceId, opts = {}) {
        const th = this.forumStore.addThread(sourceId, opts);
        const treeRef = this.getActivePublicTreeRef();
        if (treeRef && th && isNostrNetworkAvailable()) {
            try {
                this.nostr.addThreadV3({ ...treeRef, placeId: th.nodeId, thread: th });
            } catch (e) {
                console.warn('Network forum addThread failed', e);
            }
        }
        return th;
    },

    async addForumMessage(sourceId, payload) {
        const treeRef = this.getActivePublicTreeRef();
        if (!treeRef || !isNostrNetworkAvailable()) return this.forumStore.addMessage(sourceId, payload);

        // Require cloud account (sync code or legacy passkey session).
        if (typeof this.isPasskeyAuthed === 'function' && !this.isPasskeyAuthed()) {
            this.notify(
                this.ui.forumNeedSyncLogin || 'Open Profile and sign in with your sync code before posting.',
                true
            );
            return null;
        }

        // Minimal anti-spam / safety limits (client-side).
        const bodyRaw = String((payload && payload.body) || '');
        const body = bodyRaw.trim();
        if (!body) return null;
        if (body.length > 2000) {
            this.notify(this.ui.forumPostTooLong || 'Message is too long.', true);
            return null;
        }
        if (!this._forumRate) this._forumRate = { t: 0, n: 0 };
        const now = Date.now();
        if (now - this._forumRate.t > 60_000) {
            this._forumRate.t = now;
            this._forumRate.n = 0;
        }
        this._forumRate.n += 1;
        if (this._forumRate.n > 20) {
            this.notify(this.ui.forumRateLimited || 'Slow down a bit.', true);
            return null;
        }

        // Per-day rate limit (client-side; best-effort).
        try {
            const day = new Date().toISOString().slice(0, 10);
            const key = `arborito-forum-rate-day:${String(sourceId || '')}:${day}`;
            const prev = Number(localStorage.getItem(key) || '0') || 0;
            const next = prev + 1;
            const limit = 80;
            if (next > limit) {
                this.notify(this.ui.forumDailyLimit || 'Daily posting limit reached. Try again tomorrow.', true);
                return null;
            }
            localStorage.setItem(key, String(next));
        } catch {
            /* ignore */
        }

        const author = payload.author || {};
        const pair = await this.ensureNetworkUserPair();
        if (!(pair && pair.pub)) {
            return this.forumStore.addMessage(sourceId, payload);
        }

        // Forum bans (per tree): owner + invited editors can ban pubkeys.
        try {
            const bans = await this.nostr.loadForumBansV3({ ownerPub: treeRef.pub, universeId: treeRef.universeId });
            if (bans && typeof bans.has === 'function' && bans.has(String(pair.pub))) {
                this.notify(this.ui.forumBannedCannotPost || 'You cannot post in this forum.', true);
                return null;
            }
        } catch {
            /* ignore */
        }

        const modMode = await this.getForumModerationModeForActiveTree(treeRef);
        const holdForApproval = modMode === 'strict' && !this.canModerateForum();

        const msg = this.forumStore.addMessage(sourceId, {
            ...payload,
            ...(holdForApproval ? { pendingApproval: true } : {}),
            author: {
                ...author,
                pub: pair.pub,
                name: '',
                avatar: '💬'
            }
        });
        if (!msg) return msg;

        const threadsSnap = (this.forumStore.bySourceId[String(sourceId)] ? this.forumStore.bySourceId[String(sourceId)].threads : undefined);
        const threadForPlace = Array.isArray(threadsSnap)
            ? threadsSnap.find((t) => t.id === msg.threadId)
            : null;

        try {
            const signed = await this.nostr.signForumMessage({
                pair,
                message: {
                    ...msg,
                    author: { pub: pair.pub, name: '', avatar: '💬' }
                }
            });
            if (holdForApproval) {
                this.nostr.putPendingForumMessageV3({
                    ...treeRef,
                    messageId: signed.id,
                    record: signed
                });
                this.notify(
                    this.ui.forumPendingModerationToast ||
                        'Your message was sent for review. The tree owner will publish it when approved.',
                    false
                );
            } else {
                await this.publishSignedForumMessageV3(sourceId, treeRef, signed, threadForPlace);
            }
        } catch (e) {
            console.warn('Network forum addMessage failed', e);
        }
        return msg;
    },

    async setForumBanForActiveTree({ targetPub, banned }) {
        const ui = this.ui;
        const treeRef = this.getActivePublicTreeRef();
        if (!treeRef || !isNostrNetworkAvailable()) return false;
        if (!this.canModerateForum()) {
            this.notify(ui.governanceForumPolicyNoPermission || 'Only the tree owner or an invited editor can do this.', true);
            return false;
        }
        const actorPair = this.getNostrPublisherPair(treeRef.pub) || (await this.ensureNetworkUserPair());
        if (!(actorPair && actorPair.pub)) {
            this.notify(ui.nostrIdentityUnavailable || 'Online identity unavailable.', true);
            return false;
        }
        const tp = String(targetPub || '').trim();
        if (!tp) return false;
        try {
            await this.nostr.putForumBanV3({
                ownerPub: treeRef.pub,
                universeId: treeRef.universeId,
                pair: actorPair,
                targetPub: tp,
                action: banned ? 'ban' : 'unban'
            });
            this.notify(banned ? (ui.forumBanOk || 'User banned.') : (ui.forumUnbanOk || 'User unbanned.'), false);
            return true;
        } catch (e) {
            console.warn('setForumBanForActiveTree', e);
            this.notify(ui.forumBanFail || 'Could not change ban.', true);
            return false;
        }
    },

    /**
     * Remove this device’s forum identity + cloud progress for the active public universe (self-service GDPR).
     * Local study progress in the browser stays; a new keypair is issued for future posts.
     */
    async selfDeleteNostrForumAccount(sourceId) {
        const treeRef = this.getActivePublicTreeRef();
        if (!treeRef) {
            this.notify(this.ui.forumNoPublicUniverse || 'This tree is not an online public universe.', true);
            return false;
        }
        if (!isNostrNetworkAvailable()) {
            this.notify(
                this.ui.nostrNotLoadedHint ||
                    'Nostr relays unavailable (see index.html). Configure relays and reload for online identity actions.',
                true
            );
            return false;
        }
        const pair = await this.ensureNetworkUserPair();
        if (!(pair && pair.pub)) {
            this.notify(
                this.ui.nostrIdentityUnavailable || 'Online identity needs HTTPS or localhost on this browser.',
                true
            );
            return false;
        }
        const uid = String(pair.pub);
        try {
            await this.nostr.deleteAccountSelf({ ...treeRef, pair });
            this.nostr.clearUserProgress({ ...treeRef, userPub: uid });
            this.forumStore.deleteMessagesByAuthorPub(sourceId, uid);
            const newPair = await createNostrPair();
            this.saveNetworkUserPair(newPair);
            this.maybeSyncNetworkProgress(this.userStore.getPersistenceData());
            this.update({});
            await this.showDialog({
                type: 'alert',
                title: this.ui.forumSelfAccountRemovedTitle || 'Online presence removed',
                body: this.ui.forumSelfAccountRemovedBody || ''
            });
            return true;
        } catch (e) {
            console.warn('selfDeleteNostrForumAccount', e);
            this.notify(this.ui.forumAccountActionError || 'Could not complete the request.', true);
            return false;
        }
    },

    /**
     * Admin: remove a learner’s forum identity + encrypted progress on Nostr for this universe.
     */
    async moderateDeleteUserAccount(sourceId, targetUserPub) {
        const treeRef = this.getActivePublicTreeRef();
        if (!treeRef || !isNostrNetworkAvailable()) return false;
        if (!this.canModerateForum()) return false;
        const adminPair = this.getNostrPublisherPair(treeRef.pub);
        if (!adminPair) return false;
        const uid = String(targetUserPub || '');
        if (!uid) return false;
        try {
            await this.nostr.deleteAccountByAdmin({ ...treeRef, userPub: uid, adminPair });
            this.nostr.clearUserProgress({ ...treeRef, userPub: uid });
            this.forumStore.deleteMessagesByAuthorPub(sourceId, uid);
            this.update({});
            this.notify(this.ui.forumModUserRemovedOk || 'That account was removed from this tree online.', false);
            return true;
        } catch (e) {
            console.warn('moderateDeleteUserAccount', e);
            return false;
        }
    },

    /** After loading a public tree: if an admin removed this key from the network, explain once per session. */
    async maybeNotifyNetworkAccountRemoved(treeRef) {
        if (!treeRef || !isNostrNetworkAvailable()) return;
        try {
            const pair = await this.ensureNetworkUserPair();
            if (!(pair && pair.pub)) return;
            const userPub = pair.pub;
            const rec = await this.nostr.getDeletedAccountRecord({ ...treeRef, userPub });
            if (!rec) return;
            const by = String(rec.by || '');
            const adminPub = String(treeRef.pub);
            if (by === userPub) return;
            if (by !== adminPub) return;
            const legacyKey = `arborito-nostr-admin-removal-${adminPub}-${treeRef.universeId}-${userPub}`;
            const key = `arborito-nostr-admin-removal-${adminPub}-${treeRef.universeId}-${userPub}`;
            if (sessionStorage.getItem(key) || sessionStorage.getItem(legacyKey)) return;
            sessionStorage.setItem(key, '1');
            const ui = this.ui;
            await this.showDialog({
                type: 'alert',
                title: ui.nostrAccountRemovedByAdminTitle || 'Account removed on this tree',
                body: ui.nostrAccountRemovedByAdminBody || ''
            });
        } catch (e) {
            console.warn('maybeNotifyNetworkAccountRemoved', e);
        }
    },

    async selfDeleteForumMessage(sourceId, messageId) {
        const treeRef = this.getActivePublicTreeRef();
        const pair = await this.ensureNetworkUserPair();
        const ok = this.forumStore.deleteMessage(sourceId, messageId, {
            actor: (pair && pair.pub) || null
        });
        if (!treeRef || !ok) return ok;
        if (!(pair && pair.pub) || !isNostrNetworkAvailable()) return ok;
        try {
            const rec = await this.nostr.signDeletionBy({ pair, kind: 'delete_message', targetId: messageId });
            this.nostr.putDeletedMessage({ ...treeRef, messageId, record: rec });
        } catch (e) {
            console.warn('Network forum self delete failed', e);
        }
        return ok;
    },

    moderateDeleteForumMessage(sourceId, messageId, meta = {}) {
        const ok = this.forumStore.deleteMessage(sourceId, messageId, meta);
        const treeRef = this.getActivePublicTreeRef();
        if (treeRef && ok && isNostrNetworkAvailable()) {
            try {
                const adminPair = this.getNostrPublisherPair(treeRef.pub);
                if (adminPair) this.nostr.deleteMessage({ ...treeRef, messageId, adminPair });
            } catch (e) {
                console.warn('Network forum deleteMessage failed', e);
            }
        }
        return ok;
    },

    moderateDeleteForumThread(sourceId, threadId, meta = {}) {
        const ok = this.forumStore.deleteThread(sourceId, threadId, meta);
        const treeRef = this.getActivePublicTreeRef();
        if (treeRef && ok && isNostrNetworkAvailable()) {
            try {
                const adminPair = this.getNostrPublisherPair(treeRef.pub);
                if (adminPair) this.nostr.deleteThread({ ...treeRef, threadId, adminPair });
            } catch (e) {
                console.warn('Network forum deleteThread failed', e);
            }
        }
        return ok;
    },

    notifyCommunityAddResult(res) {
        if (!res) return;
        if (res.ok) {
            this.notify(this.ui.sourcesAddNewOk || 'Added to your tree list.', false);
            return;
        }
        if (res.reason === 'maintainer_blocklist') {
            this.notify(
                this.ui.maintainerBlocklistAddRefused ||
                    this.ui.maintainerBlocklistLoadRefused ||
                    'This tree is blocked in this app build (maintainer list).',
                true
            );
            return;
        }
        if (res.reason === 'duplicate') {
            const hint = (res.existing && res.existing.name)
                ? ` (${res.existing.name})`
                : '';
            const msg = this.ui.sourcesAddDuplicate || 'That tree is already in your list.{hint}';
            this.notify(msg.replace(/\{hint\}/g, hint), false);
        }
    },

    /** Add community tree: official short name, 8-char share code, nostr://…, or HTTPS URL. */
    async requestAddCommunitySource(rawInput) {
        const trimmed = String(rawInput || '').trim();
        if (!trimmed) return;
        const pre = resolveTreeInput(trimmed);
        if (pre.kind === 'unknown_alias') {
            const msg =
                this.ui.sourcesUnknownAlias ||
                'Unknown name “{name}”. Try “library”, an 8-character code, or paste a full link.';
            this.notify(msg.replace(/\{name\}/g, pre.tried), true);
            return;
        }
        if (pre.kind === 'code') {
            if (!isNostrNetworkAvailable()) {
                this.notify(
                    this.ui.nostrNotLoadedHint ||
                        'Nostr relays unavailable (see index.html). Configure relays and reload to use share codes.',
                    true
                );
                return;
            }
            let ref = null;
            try {
                ref = await this.nostr.resolveTreeShareCode(pre.code);
            } catch (e) {
                console.warn('Share code lookup failed', e);
            }
            if (!ref) {
                this.notify(this.ui.sourcesUnknownCode || 'Unknown or invalid code.', true);
                return;
            }
            if (this.isNostrTreeMaintainerBlocked(ref.pub, ref.universeId)) {
                this.notify(
                    this.ui.maintainerBlocklistLoadRefused ||
                        'This tree is blocked in this app build (maintainer list).',
                    true
                );
                return;
            }
            const effective = formatNostrTreeUrl(ref.pub, ref.universeId);
            const treeRef = parseNostrTreeUrl(effective);
            let ack = false;
            try {
                ack =
                    localStorage.getItem(`arborito-nostr-public-ack:${treeRef.pub}:${treeRef.universeId}`) ===
                        '1' ||
                    localStorage.getItem(`arborito-nostr-public-ack:${treeRef.pub}:${treeRef.universeId}`) ===
                        '1';
            } catch {
                /* ignore */
            }
            if (ack || this.sourceManager.isUrlTrusted(effective)) {
                const res = this.sourceManager.addCommunitySource(trimmed, {
                    resolvedNostrTreeUrl: effective,
                    codeLabel: pre.code
                });
                this.notifyCommunityAddResult(res);
                await this.maybeAutoLoadSoleCommunityAfterAdd(res);
            } else {
                this.update({ modal: { type: 'security-warning', url: effective } });
            }
            return;
        }
        const effective =
            pre.kind === 'resolved' ? pre.url : pre.kind === 'raw' ? pre.value : trimmed;
        const treeRef = parseNostrTreeUrl(effective);
        if (treeRef) {
            if (this.isNostrTreeMaintainerBlocked(treeRef.pub, treeRef.universeId)) {
                this.notify(
                    this.ui.maintainerBlocklistLoadRefused ||
                        'This tree is blocked in this app build (maintainer list).',
                    true
                );
                return;
            }
            if (!isNostrNetworkAvailable()) {
                this.notify(
                    this.ui.nostrNotLoadedHint ||
                        'Nostr relays unavailable (see index.html). Configure relays and reload to open nostr:// trees.',
                    true
                );
                return;
            }
            let ack = false;
            try {
                ack =
                    localStorage.getItem(`arborito-nostr-public-ack:${treeRef.pub}:${treeRef.universeId}`) ===
                        '1' ||
                    localStorage.getItem(`arborito-nostr-public-ack:${treeRef.pub}:${treeRef.universeId}`) ===
                        '1';
            } catch {
                /* ignore */
            }
            if (ack || this.sourceManager.isUrlTrusted(effective)) {
                const res = this.sourceManager.addCommunitySource(trimmed);
                this.notifyCommunityAddResult(res);
                await this.maybeAutoLoadSoleCommunityAfterAdd(res);
            } else {
                this.update({ modal: { type: 'security-warning', url: effective } });
            }
            return;
        }
        let candidate;
        try {
            candidate = new URL(effective, window.location.href).href;
        } catch {
            this.notify(this.ui.sourcesInvalidLink || 'Could not understand that link.', true);
            return;
        }
        if (this.sourceManager.isUrlTrusted(candidate)) {
            const res = this.sourceManager.addCommunitySource(trimmed);
            this.notifyCommunityAddResult(res);
            await this.maybeAutoLoadSoleCommunityAfterAdd(res);
        } else {
            this.update({ modal: { type: 'security-warning', url: candidate } });
        }
    }

};
