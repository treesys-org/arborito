import { NostrUniverseService, createNostrPair, isNostrNetworkAvailable } from './services/nostr-universe.js';
import { parseNostrTreeUrl, formatNostrTreeUrl, isNostrTreeUrl } from './services/nostr-refs.js';
import { getWindowConfiguredNostrRelays, normalizeNostrRelayUrls } from './config/nostr-relays-runtime.js';
import { isNostrTreeMaintainerBlocked as isNostrTreeOnMaintainerBlocklist } from './config/maintainer-nostr-tree-blocklist.js';
import { nostrSyncForumCommunityMethods } from './store/store-nostr-sync-forum-community-methods.js';
import { nostrAdminGovernanceMethods } from './store/store-nostr-admin-governance-methods.js';
import { publishRevokeMethods } from './store/store-publish-revoke-methods.js';
import { nostrGraphCurriculumMethods } from './store/store-nostr-graph-curriculum-methods.js';
import { webtorrentPublishMethods } from './store/store-webtorrent-publish-methods.js';
import { mountBundleMethods } from './store/store-mount-bundle-methods.js';
import { userProgressBundleMethods } from './store/store-user-progress-bundle-methods.js';
import { UserStore } from './stores/user-store.js';
import { ForumStore } from './stores/forum-store.js';
import { SourceManager } from './stores/source-manager.js';
import { TreeUtils } from './utils/tree-utils.js';
import { storageManager } from './stores/storage-manager.js';
import { DataProcessor } from './utils/data-processor.js';
import { GraphLogic } from './stores/graph-logic.js';
import { AILogic } from './stores/ai-logic.js';
import { UIStore } from './ui-store.js';
import { fileSystem } from './services/filesystem.js';
import { WebTorrentService } from './services/webtorrent-service.js';
import {
    isWebAuthnAvailable,
    normalizeUsername,
    newChallengeB64u,
    createPasskeyCredential,
    verifyAssertionAndGetSession
} from './services/webauthn.js';
import {
    ensureLocalEd25519Identity,
    buildSignedIdentityClaim,
    verifyIdentityClaimRecord,
    buildIdentityShareJson,
    parseIdentityShareJson,
    saveIdentityContact,
    loadIdentityContacts,
    removeIdentityContact,
    getCachedLocalIdentitySync
} from './services/arborito-identity.js';
import {
    clearAllArboritoBrowserStorage,
    clearOptionalConsentKeys,
    clearWllamaCaches
} from './utils/clear-arborito-browser-storage.js';
import {
    generateRecoveryCodeBatch,
    hashRecoveryCode,
    buildRecoveryEntryQrPayload,
    parseRecoveryEntryFromText
} from './services/passkey-recovery.js';
import {
    generatePlainSyncSecret,
    formatSyncSecretForDisplay,
    normalizeSyncSecret,
    hashSyncSecret,
    syncSecretMatchesStored,
    buildSyncLoginQrPayload,
    parseSyncLoginFromText
} from './services/sync-login-secret.js';
import {
    QrSignalingManager,
    buildQrSignalingPayload,
    parseQrSignalingPayload,
    QR_TOKEN_EXPIRY_MS
} from './services/qr-signaling.js';
import { encryptRecoveryKit, decryptRecoveryKit } from './services/recovery-kit-crypto.js';

/** Bumps when author-facing legal text changes; users must accept again. */
const AUTHOR_LICENSE_VERSION = 'cc-by-sa-4.0-arborito-v1';
const AUTHOR_LICENSE_STORAGE_KEY = 'arborito-author-license-accepted';

class Store extends UIStore {
    constructor() {
        super();
        
        // 1. Sub-Stores & Managers
        this.userStore = new UserStore(
            () => this.ui,
            (payload) => this.maybeSyncNetworkProgress(payload)
        );

        this.sourceManager = new SourceManager(
            (updates) => this.update(updates),
            () => this.ui
        );

        this.forumStore = new ForumStore();
        /** @type {string|null} — Network forum: first open loads chunks.forum + live; later opens load live only. */
        this._treeForumHydratedForSourceId = null;
        this._treeForumLoadedPlaces = new Set();
        this._treeForumLoadedThreads = new Set();
        /** @type {Map<string, Set<string>>} threadId -> loaded week keys */
        this._treeForumLoadedThreadWeeks = new Map();
        this.nostr = new NostrUniverseService();
        this.webtorrent = new WebTorrentService();
        try {
            const rawPeers = localStorage.getItem('arborito-nostr-relays-v1');
            if (rawPeers) {
                const parsed = JSON.parse(rawPeers);
                if (Array.isArray(parsed) && parsed.length) {
                    const normalized = normalizeNostrRelayUrls(parsed);
                    if (normalized.length) this.nostr.setPeers(normalized);
                }
            }
        } catch {
            /* ignore */
        }
        if (!this.nostr.peers.length) {
            const fromPage = getWindowConfiguredNostrRelays();
            if (fromPage.length) this.nostr.setPeers(fromPage);
        }
        this._nostrProgressSyncTimer = null;
        this._nostrProgressSyncInFlight = false;
        this._linkedLocalMirrorAutosaveTimer = null;
        /** @type {{ threadId?: string|null, placeId?: string|null, mobilePanel?: string, draft?: string }|null} */
        this._forumShellSnapshot = null;
        /** Network loads only: prevents an older request's `finally` from clearing a newer load's spinner. */
        this._networkLoadTicket = 0;
        /** `mountCurriculum`: `finally` clears `treeHydrating` only if this mount epoch is still current. */
        this._curriculumMountEpoch = 0;
        /** @type {{ stop: () => void, ping: () => void } | null} */
        this._nostrPresenceSession = null;
        /** @type {{ v: number, username: string, credentialId: string, authenticatedAt: string } | null} */
        this._passkeySession = null;
        /** @type {string} base64url challenge for current auth attempt */
        this._passkeyChallenge = '';
        /** After backup code or recovery file unlock: allows registering a new passkey on this device. */
        /** @type {{ username: string, expiresAt: number } | null} */
        this._recoveryBootstrap = null;
        // Graph Logic Delegator
        this.graphLogic = new GraphLogic(this);
        
        // AI Logic Delegator
        this.aiLogic = new AILogic(this);
        
        // URL Router for tree codes in URL
        this._initUrlRouter();
        
        // 2. Initialization
        this.initialize().then(async () => {
             const streakMsg = this.userStore.settings.checkStreak();
             if (streakMsg) this.notify(streakMsg);

             const source = await this.sourceManager.init();
             if (source && (source._fromUrl || source._fromShareParam)) {
             }
             if (source) {
                 this.loadData(source);
             } else {
                 // No default tree: do not leave loading stuck true.
                 this.update({ loading: false });
                 setTimeout(() => this.maybePromptNoTree(), 400);
             }
        });

        document.documentElement.classList.toggle('dark', this.state.theme === 'dark');
        /** Debounce local garden persistence after `update({ rawGraphData })` (no Save button in the dock). */
        this._localTreeAutosaveTimer = null;
        /** Light `rawGraphData` history in construction mode (Undo button in the dock). */
        this._constructionUndoStack = [];
        this._constructionUndoMax = 28;
        this._constructionUndoApplying = false;
    }

    /** Curated blocklist in `maintainer-nostr-tree-blocklist.js` (not automatic report-based blocking). */
    isNostrTreeMaintainerBlocked(ownerPub, universeId) {
        return isNostrTreeOnMaintainerBlocklist(ownerPub, universeId);
    }

    async startWebTorrentSeeder() {
        try {
            const raw = this.state.rawGraphData;
            const wt = raw?.meta?.webtorrent;
            if (!wt || typeof wt !== 'object' || wt.mode !== 'buckets-v1') {
                this.notify(this.ui.webtorrentSeederNoMeta || 'This tree has no WebTorrent metadata to seed.', true);
                return false;
            }
            if (!this.webtorrent?.available?.()) {
                this.notify(this.ui.webtorrentSeederUnavailable || 'WebTorrent is not available in this environment.', true);
                return false;
            }
            const nodes = wt.nodesBuckets && typeof wt.nodesBuckets === 'object' ? wt.nodesBuckets : {};
            const content = wt.contentBuckets && typeof wt.contentBuckets === 'object' ? wt.contentBuckets : {};
            const magnets = [
                ...Object.values(nodes).map((s) => String(s || '').trim()).filter(Boolean),
                ...Object.values(content).map((s) => String(s || '').trim()).filter(Boolean)
            ];
            const uniq = [...new Set(magnets)];
            if (!uniq.length) return false;
            this.update({
                webtorrentSeeder: {
                    running: true,
                    total: uniq.length,
                    done: 0,
                    peers: 0,
                    startedAt: Date.now()
                }
            });
            // Add torrents one by one (keeps memory stable). This will download as needed and then seed.
            for (let i = 0; i < uniq.length; i++) {
                const m = uniq[i];
                try {
                    await this.webtorrent.ensureAdded({ magnet: m });
                } catch {
                    /* ignore */
                }
                if (i % 3 === 0) {
                    let peers = 0;
                    for (const mm of uniq.slice(0, i + 1)) {
                        try {
                            const st = await this.webtorrent.getStats({ magnet: mm });
                            peers += st?.numPeers || 0;
                        } catch {
                            /* ignore */
                        }
                    }
                    this.update({
                        webtorrentSeeder: {
                            ...this.state.webtorrentSeeder,
                            done: i + 1,
                            peers
                        }
                    });
                } else {
                    this.update({
                        webtorrentSeeder: {
                            ...this.state.webtorrentSeeder,
                            done: i + 1
                        }
                    });
                }
            }
            return true;
        } catch (e) {
            console.warn('startWebTorrentSeeder', e);
            this.update({ webtorrentSeeder: { running: false, error: String(e?.message || e) } });
            return false;
        }
    }

    stopWebTorrentSeeder() {
        try {
            this.webtorrent?.stopAll?.();
        } catch {
            /* ignore */
        }
        this.update({ webtorrentSeeder: { running: false, total: 0, done: 0, peers: 0, stoppedAt: Date.now() } });
    }

    /**
     * Best-effort local notification for creators.
     * Reports live in the global directory; there is no OS push — we check when a tree loads on this device.
     * Legal (copyright) path: matches the brainstorming “notify owner + 48h window” idea: we nudge once per newest legal `at`.
     */
    async maybeNotifyOwnerAboutNewDirectoryReports(source) {
        let notified = false;
        try {
            if (!source || typeof source !== 'object') return false;
            if (String(source.origin || '') !== 'nostr') return false;
            const url = String(source.url || '');
            const ref = parseNostrTreeUrl(url);
            const pub = String(ref?.pub || '');
            const universeId = String(ref?.universeId || '');
            if (!pub || !universeId) return false;
            const pair = this.getNostrPublisherPair?.(pub);
            if (!pair?.priv) return false; // not the creator on this device
            const net = this.nostr;
            if (!net) return false;

            // 1) Legal dispute — needs owner response (newer than last signed defense, if any)
            if (typeof net.listTreeLegalReportsOnce === 'function' && typeof net.loadTreeLegalOwnerDefenseOnce === 'function') {
                try {
                    const legalRows = await net.listTreeLegalReportsOnce({ ownerPub: pub, universeId, max: 40 });
                    const latestLegalAt = String(legalRows?.[0]?.at || '');
                    if (latestLegalAt) {
                        const def = await net.loadTreeLegalOwnerDefenseOnce({ ownerPub: pub, universeId });
                        const defAt = String(def?.latestLegalReportAt || '');
                        const needsOwner = !defAt || defAt < latestLegalAt;
                        if (needsOwner) {
                            const lk = `arborito-dir-legal-dispute-last-toast-v1:${pub}/${universeId}`;
                            let lastL = '';
                            try {
                                lastL = String(localStorage.getItem(lk) || '');
                            } catch {
                                lastL = '';
                            }
                            if (!lastL || String(latestLegalAt) > String(lastL)) {
                                try {
                                    localStorage.setItem(lk, latestLegalAt);
                                } catch {
                                    /* ignore */
                                }
                                this.notify(
                                    this.ui.creatorLegalDisputeToast ||
                                        'Legal notice on your tree: the public directory no longer shows this listing to others until you respond. From Trees, open your row ⋯ → owner response (signed). You have about 48 hours to act.',
                                    false
                                );
                                notified = true;
                            }
                        }
                    }
                } catch {
                    /* ignore */
                }
            }

            // 2) Community reports (non-legal)
            if (typeof net.listTreeReportsOnce === 'function') {
                const key = `arborito-dir-reports-last-notified-v1:${pub}/${universeId}`;
                let last = '';
                try {
                    last = String(localStorage.getItem(key) || '');
                } catch {
                    last = '';
                }

                const rows = await net.listTreeReportsOnce({ ownerPub: pub, universeId, max: 80 });
                const latestAt = String(rows?.[0]?.at || '');
                if (latestAt && (!last || String(latestAt) > String(last))) {
                    try {
                        localStorage.setItem(key, latestAt);
                    } catch {
                        /* ignore */
                    }

                    const n = Array.isArray(rows) ? rows.length : 1;
                    const reportsMsg =
                        n === 1
                            ? this.ui.creatorReportsToastOne ||
                              'Your tree received a recent directory report. Check Trees / reports if relevant.'
                            : (this.ui.creatorReportsToastMany || 'Your tree received {n} recent directory reports. Check Trees / reports if relevant.').replace(
                                  '{n}',
                                  String(n)
                              );
                    this.notify(this.ui.creatorReportsToast || reportsMsg, false);
                    notified = true;
                }
            }

            return notified;
        } catch {
            return notified;
        }
    }

    /**
     * Local notice to owner: “urgent” user message (`urgentUserReports` on Nostr), separate from community report.
     */
    async maybeNotifyOwnerAboutUrgentUserInbox(source) {
        try {
            if (!source || typeof source !== 'object') return false;
            if (String(source.origin || '') !== 'nostr') return false;
            const url = String(source.url || '');
            const ref = parseNostrTreeUrl(url);
            const pub = String(ref?.pub || '');
            const universeId = String(ref?.universeId || '');
            if (!pub || !universeId) return false;
            const pair = this.getNostrPublisherPair?.(pub);
            if (!pair?.priv) return false;
            const net = this.nostr;
            if (!net || typeof net.listTreeUrgentUserMessagesOnce !== 'function') return false;
            const rows = await net.listTreeUrgentUserMessagesOnce({ ownerPub: pub, universeId, max: 40 });
            const latestAt = String(rows?.[0]?.at || '');
            if (!latestAt) return false;
            const key = `arborito-dir-urgent-user-last-toast-v1:${pub}/${universeId}`;
            let last = '';
            try {
                last = String(localStorage.getItem(key) || '');
            } catch {
                last = '';
            }
            if (last && String(latestAt) <= String(last)) return false;
            try {
                localStorage.setItem(key, latestAt);
            } catch {
                /* ignore */
            }
            this.notify(
                this.ui.creatorUrgentUserMessageToast ||
                    'A visitor left an urgent signed message for you on the network (not the app operator). Open “Report this tree” from the readme or sources context to review network metadata if needed.',
                false
            );
            return true;
        } catch {
            return false;
        }
    }

    /** Persist + apply Nostr relay URLs (global). */
    setNostrRelayUrls(peers) {
        try {
            this.nostr.setPeers(peers);
            try {
                localStorage.setItem('arborito-nostr-relays-v1', JSON.stringify(this.nostr.peers || []));
            } catch {
                /* ignore */
            }
            // Restart presence on new peers.
            this.syncNostrPresenceFromActiveSource(this.state.activeSource);
            this.update({});
        } catch (e) {
            console.warn('setNostrRelayUrls failed', e);
        }
    }

    clearConstructionUndoStack() {
        if (this._constructionUndoStack?.length) this._constructionUndoStack.length = 0;
    }

    getConstructionUndoDepth() {
        return this._constructionUndoStack?.length ?? 0;
    }

    /**
     * Restaura el snapshot anterior de `rawGraphData` (solo mapa / metadatos del JSON, no deshace lecciones guardadas aparte).
     * @returns {boolean} true si hubo algo que deshacer
     */
    undoConstructionEdit() {
        const snap = this._constructionUndoStack?.pop();
        if (!snap) return false;
        this._constructionUndoApplying = true;
        try {
            const next = JSON.parse(JSON.stringify(snap));
            DataProcessor.process(this, next, this.state.activeSource, { suppressReadmeAutoOpen: true });
            return true;
        } finally {
            this._constructionUndoApplying = false;
        }
    }

    update(partialState) {
        if (!partialState || typeof partialState !== 'object') {
            super.update(partialState);
            return;
        }

        if ('rawGraphData' in partialState && partialState.rawGraphData == null && !this._constructionUndoApplying) {
            this.clearConstructionUndoStack();
        }

        const shouldRecordUndo =
            !this._constructionUndoApplying &&
            'rawGraphData' in partialState &&
            partialState.rawGraphData != null &&
            this.state.constructionMode &&
            !this.state.treeHydrating &&
            fileSystem.features.canWrite &&
            (fileSystem.isLocal || fileSystem.isNostrTreeSource()) &&
            this.state.rawGraphData;

        if (shouldRecordUndo) {
            try {
                this._constructionUndoStack.push(JSON.parse(JSON.stringify(this.state.rawGraphData)));
                while (this._constructionUndoStack.length > this._constructionUndoMax) {
                    this._constructionUndoStack.shift();
                }
            } catch {
                /* ignore */
            }
        }

        super.update(partialState);

        if (
            'rawGraphData' in partialState &&
            fileSystem.features.canWrite &&
            fileSystem.isLocal &&
            this.state.activeSource?.url?.startsWith('local://')
        ) {
            if (this._localTreeAutosaveTimer) clearTimeout(this._localTreeAutosaveTimer);
            this._localTreeAutosaveTimer = setTimeout(() => {
                this._localTreeAutosaveTimer = null;
                this.persistActiveLocalTreeIfNeeded();
            }, 350);
        }

        if ('rawGraphData' in partialState && fileSystem.features.canWrite && fileSystem.isNostrTreeSource?.()) {
            if (this._linkedLocalMirrorAutosaveTimer) clearTimeout(this._linkedLocalMirrorAutosaveTimer);
            this._linkedLocalMirrorAutosaveTimer = setTimeout(() => {
                this._linkedLocalMirrorAutosaveTimer = null;
                this.persistLinkedLocalMirrorIfNeeded();
            }, 350);
        }
    }

    async initialize() {
        await this.loadLanguage(this.state.lang);
        const recoveryDeepLink = this._peekRecoveryQueryParam();
        // First-run onboarding: brief intro + language picker + start button.
        if (!recoveryDeepLink) {
            let seen = true;
            try {
                seen = localStorage.getItem('arborito-onboarding-seen-v1') === 'true';
            } catch {
                /* ignore */
            }
            if (!seen && !this.state.modal) {
                setTimeout(() => this.setModal({ type: 'onboarding' }), 60);
            } else {
                this._scheduleDeferredProductTour();
            }
        }
    }

    /**
     * Open recovery assistant when landing with `?recover=1` (QR deep link).
     * @returns {boolean} true if this load was a recovery deep link (skip competing first-run modals).
     */
    _peekRecoveryQueryParam() {
        try {
            if (typeof window === 'undefined' || window.location.protocol === 'file:') return false;
            const u = new URL(window.location.href);
            if (u.searchParams.get('recover') !== '1') return false;
            u.searchParams.delete('recover');
            const qs = u.searchParams.toString();
            const next = `${u.pathname}${qs ? `?${qs}` : ''}${u.hash || ''}`;
            window.history.replaceState({}, '', next);
            queueMicrotask(() => {
                this.setModal({ type: 'recovery-assistant' });
            });
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Users who already dismissed welcome never got `arborito-start-tour`; we retry until
     * no modal blocks (e.g. “no trees”).
     */
    _scheduleDeferredProductTour() {
        try {
            if (localStorage.getItem('arborito-ui-tour-done')) return;
        } catch {
            return;
        }
        // Construction mode should never show the UI tour.
        if (this.state.constructionMode) return;
        let tries = 0;
        const attempt = () => {
            tries += 1;
            try {
                if (localStorage.getItem('arborito-ui-tour-done')) return;
            } catch {
                return;
            }
            if (this.state.constructionMode) return;
            const blocked =
                !!this.state.modal || !!this.state.previewNode || !!this.state.modalOverlay;
            if (blocked) {
                /* After first tree readme often opens ~500 ms; without slack the tour never starts. */
                if (tries < 160) setTimeout(attempt, 400);
                return;
            }
            window.dispatchEvent(new CustomEvent('arborito-start-tour', { detail: { source: 'deferred-init' } }));
        };
        setTimeout(attempt, 650);
    }

    /**
     * After Sources-only onboarding tour, dock/graph tour stays pending until a tree loads.
     * Must match `SHELL_TOUR_PENDING_KEY` in `product-tour.js`.
     */
    maybeScheduleShellProductTourAfterTree() {
        const shellPendingKey = 'arborito-ui-tour-shell-pending-v1';
        try {
            if (localStorage.getItem('arborito-ui-tour-done')) return;
            if (localStorage.getItem(shellPendingKey) !== 'true') return;
        } catch {
            return;
        }
        if (this.state.constructionMode) return;
        if (!this.state.rawGraphData || !this.state.activeSource) return;
        try {
            localStorage.removeItem(shellPendingKey);
        } catch {
            /* ignore */
        }
        this._scheduleDeferredProductTour();
    }

    /** Initialize URL Router for tree codes in URL */
    _initUrlRouter() {
        // Dynamic import to avoid circular dependencies
        import('./utils/url-router.js').then(({ initUrlRouter, restoreTreeFromUrl }) => {
            // Try to restore tree from URL on startup
            const restored = restoreTreeFromUrl();
            if (restored) {
                console.log('[Arborito] Restoring tree from URL:', restored);
                // Will be picked up by sourceManager.init() later
                this._urlRestoredSource = restored;
            }
            // Initialize the router to listen for changes
            initUrlRouter(this);
        }).catch(e => console.warn('URL Router not available:', e));
    }

    /** Start or stop the Nostr presence counter for the active tree. */
    syncNostrPresenceFromActiveSource(source) {
        if (this._nostrPresenceSession) {
            try {
                this._nostrPresenceSession.stop();
            } catch {
                /* ignore */
            }
            this._nostrPresenceSession = null;
        }
        if (!source?.url) {
            this.update({ nostrLiveSeeds: null });
            return;
        }
        const ref = parseNostrTreeUrl(String(source.url));
        if (!ref || !isNostrNetworkAvailable()) {
            this.update({ nostrLiveSeeds: null });
            return;
        }
        const url = String(source.url);
        this._nostrPresenceSession = this.nostr.startUniversePresence({
            pub: ref.pub,
            universeId: ref.universeId,
            onCount: (total) => {
                if (String(this.state.activeSource?.url || '') !== url) return;
                const t = typeof total === 'number' && total >= 0 ? total : 0;
                if (this.state.nostrLiveSeeds === t) return;
                this.update({ nostrLiveSeeds: t });
            }
        });
    }

    get value() { 
        return { 
            ...this.state,
            completedNodes: this.userStore.state.completedNodes,
            bookmarks: this.userStore.state.bookmarks,
            gamification: this.userStore.state.gamification
        }; 
    }

    /** Texto legal CC encima del modal actual (Fuentes, bienvenida, …). */
    openAuthorLicenseOverlay(extra = {}) {
        this.update({ modalOverlay: { type: 'author-license', ...extra } });
    }

    /** Cierra el overlay de licencia; el modal principal (bienvenida, Fuentes, …) sigue igual debajo. */
    closeAuthorLicenseOverlay() {
        this.update({ modalOverlay: null });
    }
    
    get dailyXpGoal() { return this.userStore.dailyXpGoal; }
    get storage() { return storageManager; }

    /** Export display name + garden stats for backup / sync (JSON file). */
    exportProfileJson() {
        const g = { ...this.userStore.state.gamification };
        const payload = {
            format: 'arborito-profile',
            version: 1,
            exportedAt: new Date().toISOString(),
            gamification: g
        };
        return JSON.stringify(payload, null, 2);
    }

    downloadProfileFile() {
        const json = this.exportProfileJson();
        const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const ts = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        a.download = `arborito-profile-${ts}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this.notify(this.ui.profileExportOk || 'Profile saved.');
    }

    /** Merge gamification from an exported profile JSON (higher XP wins for numeric fields). */
    importProfileJson(text) {
        const data = JSON.parse(text);
        if (!data || typeof data !== 'object' || !data.gamification) {
            throw new Error('Invalid profile file');
        }
        const bg = data.gamification;
        const g = this.userStore.state.gamification;
        if ((bg.xp || 0) > (g.xp || 0)) g.xp = bg.xp;
        g.dailyXP = Math.max(g.dailyXP || 0, bg.dailyXP || 0);
        g.streak = Math.max(g.streak || 0, bg.streak || 0);
        if (bg.username) g.username = bg.username;
        if (bg.avatar) g.avatar = bg.avatar;
        if (Array.isArray(bg.seeds) && bg.seeds.length >= (g.seeds?.length || 0)) {
            g.seeds = [...bg.seeds];
        }
        if (bg.lastLoginDate) {
            g.lastLoginDate = bg.lastLoginDate;
        }
        this.userStore.persist();
        this.update({});
    }

    addCommunitySource(url, opts) {
        return this.sourceManager.addCommunitySource(url, opts || {});
    }

    removeCommunitySource(id) {
        const prevActive = this.state.activeSource;
        this.sourceManager.removeCommunitySource(id);
        // GDPR/local: if user deletes a tree link, also clear derived local caches for that source.
        try {
            import('./utils/search-index-service.js')
                .then((m) => m.clearSearchIndexForTreeId(id))
                .catch(() => {});
            import('./utils/lesson-content-cache.js')
                .then((m) => m.clearLessonCacheForSource(id))
                .catch(() => {});
        } catch {
            /* ignore */
        }
        if (prevActive?.id === id) {
            void this.clearCanvasAndShowLoadTreeWelcome();
        }
    }
    
    loadAndSmartMerge(sourceId) {
        const sid = String(sourceId || '').trim();
        if (!sid) return Promise.resolve();
        /* Preferir enlace guardado (Internet) frente a filas de versiones por si el id colisionara. */
        let source =
            this.state.communitySources.find((s) => String(s.id) === sid) ||
            this.state.availableReleases.find((s) => String(s.id) === sid);
        if (!source) return Promise.resolve();
        return this.loadData(source, true);
    }

    // --- GRAPH & NAVIGATION DELEGATION ---

    findNode(id) { return this.graphLogic.findNode(id); }
    async navigateTo(nodeId, nodeData = null) { return this.graphLogic.navigateTo(nodeId, nodeData); }
    async navigateToNextLeaf() { return this.graphLogic.navigateToNextLeaf(); }
    async toggleNode(nodeId) { return this.graphLogic.toggleNode(nodeId); }
    async loadNodeChildren(node, opts) { return this.graphLogic.loadNodeChildren(node, opts); }
    async loadNodeContent(node) { return this.graphLogic.loadNodeContent(node); }
    async moveNode(node, newParentId) { return this.graphLogic.moveNode(node, newParentId); }

    enterLesson() {
        const node = this.state.previewNode;
        if (!node) return;
        if (
            !node.content &&
            (node.contentPath ||
                (node.treeLazyContent && node.treeContentKey))
        ) {
            this.loadNodeContent(node).then(() => {
                this.update({ selectedNode: node, previewNode: null });
                this.afterLessonOpened(node);
            });
        } else {
            this.update({ selectedNode: node, previewNode: null });
            this.afterLessonOpened(node);
        }
    }

    goHome() {
        this.update({
            viewMode: 'explore',
            selectedNode: null,
            previewNode: null,
            modal: null,
            certificatesFromMobileMore: false
        });
        this.dispatchEvent(new CustomEvent('reset-zoom'));
    }
    closePreview() { this.update({ previewNode: null }); }
    closeContent() { this.update({ selectedNode: null }); }
    /**
     * Opens lesson/exam editing in the content shell (never the Arborito Studio modal).
     * @param {object} node
     * @param {{ forceOverlay?: boolean }} [opts] - If true, after ensuring the lesson is open fires `arborito-lesson-magic-open` (magic draft in shell).
     */
    openEditor(node, opts = {}) {
        if (!node) return;
        const isLesson = node.type === 'leaf' || node.type === 'exam';
        if (isLesson) {
            const sel = this.state.selectedNode;
            const already = sel && String(sel.id) === String(node.id);
            if (!already) {
                void this.navigateTo(node.id, node);
            }
            if (opts.forceOverlay) {
                queueMicrotask(() => this.dispatchEvent(new CustomEvent('arborito-lesson-magic-open')));
            }
            return;
        }
        if (node.type === 'branch' || node.type === 'root') {
            this.update({ modal: { type: 'node-properties', node } });
        }
    }

    /** In construction mode editing happens in the lesson shell (content); do not auto-open the editor overlay. */
    maybeOpenEditorInConstruction(_node) {}

    /**
     * Single entry when opening a lesson (leaf/exam) from any path.
     * Delegates to maybeOpenEditorInConstruction.
     */
    afterLessonOpened(node) {
        this.maybeOpenEditorInConstruction(node);
    }
    
    async search(query) {
        if (!this.state.activeSource?.url) return [];
        const getLocalOverlay = (langU, prefix) =>
            import('./utils/search-index-service.js').then((m) =>
                m.getLocalShardOverlay(this.state.activeSource, this.state.rawGraphData, langU, prefix)
            );
        return TreeUtils.search(
            query,
            this.state.activeSource,
            this.state.lang,
            this.state.searchCache,
            getLocalOverlay
        );
    }

    async searchBroad(char) {
        if (!this.state.activeSource?.url) return [];
        const getLocalOverlay = (langU, prefix) =>
            import('./utils/search-index-service.js').then((m) =>
                m.getLocalShardOverlay(this.state.activeSource, this.state.rawGraphData, langU, prefix)
            );
        return TreeUtils.searchBroad(
            char,
            this.state.activeSource,
            this.state.lang,
            this.state.searchCache,
            getLocalOverlay
        );
    }

    // --- INTEGRATIONS (AI, Cloud, User) ---

    async initSage() { return this.aiLogic.initSage(); }
    abortSage() { return this.aiLogic.abortSage(); }
    clearSageChat() { return this.aiLogic.clearSageChat(); }
    async chatWithSage(userText) { return this.aiLogic.chatWithSage(userText); }

    // --- PASSKEYS (WebAuthn) ---

    get passkeysAvailable() {
        return isWebAuthnAvailable();
    }

    get passkeySession() {
        return this._passkeySession;
    }

    isPasskeyAuthed() {
        return !!(this._passkeySession && this._passkeySession.username);
    }

    normalizePasskeyUsername(input) {
        return normalizeUsername(input);
    }

    async signInOrCreatePasskey({ username, createIfMissing = true } = {}) {
        const ui = this.ui;
        const name = normalizeUsername(username);
        if (!name) {
            throw new Error(ui.passkeyUsernameRequired || 'Enter a username first.');
        }
        if (!this.passkeysAvailable) {
            throw new Error(ui.passkeyUnavailable || 'Passkeys are not available in this environment.');
        }
        if (!isNostrNetworkAvailable()) {
            throw new Error(ui.nostrNotLoadedHint || 'Nostr relays unavailable. Passkey login needs Nostr relays.');
        }

        let creds = [];
        try {
            creds = await this.nostr.listAuthCredentialsOnce(name);
        } catch (e) {
            throw new Error(
                (ui.passkeyLoadFailed || 'Could not load passkey records.').replace(
                    '{message}',
                    String(e?.message || e)
                )
            );
        }

        if (!creds.length) {
            if (!createIfMissing) {
                throw new Error(
                    (ui.passkeyNoAccountInline || 'No passkey exists for “{username}” yet.').replace(
                        '{username}',
                        name
                    )
                );
            }
            return await this.createPasskeyForUsername(name);
        }

        return await this.signInWithPasskeyUsername(name, creds);
    }

    async signInWithPasskeyUsername(username, credentials = null) {
        const ui = this.ui;
        const name = normalizeUsername(username);
        if (!name) {
            throw new Error(ui.passkeyUsernameRequired || 'Enter a username first.');
        }
        if (!this.passkeysAvailable) {
            throw new Error(ui.passkeyUnavailable || 'Passkeys are not available in this environment.');
        }
        if (!isNostrNetworkAvailable()) {
            throw new Error(ui.nostrNotLoadedHint || 'Nostr relays unavailable. Passkey login needs Nostr relays.');
        }

        const creds = Array.isArray(credentials)
            ? credentials
            : await this.nostr.listAuthCredentialsOnce(name);
        if (!creds.length) {
            throw new Error(
                (ui.passkeyNoAccountInline || 'No passkey exists for “{username}” yet.').replace(
                    '{username}',
                    name
                )
            );
        }

        this._passkeyChallenge = newChallengeB64u();
        try {
            const session = await verifyAssertionAndGetSession({
                username: name,
                allowCredentials: creds,
                expectedChallengeB64u: this._passkeyChallenge
            });
            this._passkeySession = session;
            this._passkeyChallenge = '';
            this.userStore.settings.updateGamification({
                ...this.userStore.state.gamification,
                username: name
            });
            this.update({});
            this._schedulePublishIdentityClaimAfterPasskey();
            this.notify(ui.passkeyLoginOk || 'Signed in.', false);
            return session;
        } catch (e) {
            this._passkeyChallenge = '';
            throw new Error(
                (ui.passkeyLoginFailed || 'Passkey sign-in failed. {message}').replace(
                    '{message}',
                    String(e?.message || e)
                )
            );
        }
    }

    async createPasskeyForUsername(username) {
        const ui = this.ui;
        const name = normalizeUsername(username);
        if (!name) {
            throw new Error(ui.passkeyUsernameRequired || 'Enter a username first.');
        }
        if (!this.passkeysAvailable) {
            throw new Error(ui.passkeyUnavailable || 'Passkeys are not available in this environment.');
        }
        if (!isNostrNetworkAvailable()) {
            throw new Error(ui.nostrNotLoadedHint || 'Nostr relays unavailable. Passkey registration needs Nostr relays.');
        }

        try {
            const rec = await createPasskeyCredential({ username: name, rpName: ui.appTitle || 'Arborito' });
            this.nostr.putAuthCredential({ username: name, credential: rec });
            this._passkeySession = {
                v: 1,
                username: name,
                credentialId: rec.id,
                authenticatedAt: new Date().toISOString()
            };
            this.userStore.settings.updateGamification({
                ...this.userStore.state.gamification,
                username: name
            });
            this.update({});
            this._schedulePublishIdentityClaimAfterPasskey();
            this.notify(ui.passkeyRegisterOk || 'Passkey created.', false);
            return this._passkeySession;
        } catch (e) {
            throw new Error(
                (ui.passkeyRegisterFailed || 'Could not create passkey. {message}').replace(
                    '{message}',
                    String(e?.message || e)
                )
            );
        }
    }

    async ensurePasskeyLoginInteractive(opts = {}) {
        const ui = this.ui;
        if (!this.passkeysAvailable) {
            this.notify(ui.passkeyUnavailable || 'Passkeys are not available in this environment.', true);
            return null;
        }
        if (!isNostrNetworkAvailable()) {
            this.notify(ui.nostrNotLoadedHint || 'Nostr relays unavailable. Passkey login needs Nostr relays.', true);
            return null;
        }
        const existing = this.passkeySession;
        if (existing?.username && !opts.force) return existing;

        const typed = await this.prompt(
            ui.passkeyPromptUsername || 'Choose your username (no email).',
            ui.passkeyUsernamePlaceholder || 'username',
            ui.passkeyLoginTitle || 'Sign in with passkey'
        );
        const username = normalizeUsername(typed);
        if (!username) return null;

        let creds = [];
        try {
            creds = await this.nostr.listAuthCredentialsOnce(username);
        } catch (e) {
            this.notify((ui.passkeyLoadFailed || 'Could not load passkey records.').replace('{message}', String(e?.message || e)), true);
            return null;
        }
        if (!creds.length) {
            const ok = await this.confirm(
                (ui.passkeyNoAccountBody || 'No passkey is registered for this username yet. Create one now?').replace('{username}', username),
                ui.passkeyNoAccountTitle || 'Create passkey?',
                false
            );
            if (!ok) return null;
            return await this.registerPasskeyInteractive({ username });
        }

        this._passkeyChallenge = newChallengeB64u();
        try {
            const session = await verifyAssertionAndGetSession({
                username,
                allowCredentials: creds,
                expectedChallengeB64u: this._passkeyChallenge
            });
            this._passkeySession = session;
            this._passkeyChallenge = '';
            this.update({}); // re-render UIs that gate posting
            this._schedulePublishIdentityClaimAfterPasskey();
            this.notify(ui.passkeyLoginOk || 'Signed in.', false);
            return session;
        } catch (e) {
            this._passkeyChallenge = '';
            this.notify((ui.passkeyLoginFailed || 'Passkey sign-in failed. {message}').replace('{message}', String(e?.message || e)), true);
            return null;
        }
    }

    async registerPasskeyInteractive(opts = {}) {
        const ui = this.ui;
        if (!this.passkeysAvailable) {
            this.notify(ui.passkeyUnavailable || 'Passkeys are not available in this environment.', true);
            return null;
        }
        if (!isNostrNetworkAvailable()) {
            this.notify(ui.nostrNotLoadedHint || 'Nostr relays unavailable. Passkey registration needs Nostr relays.', true);
            return null;
        }
        let username = normalizeUsername(opts.username);
        if (!username) {
            const typed = await this.prompt(
                ui.passkeyPromptUsername || 'Choose your username (no email).',
                ui.passkeyUsernamePlaceholder || 'username',
                ui.passkeyRegisterTitle || 'Create passkey'
            );
            username = normalizeUsername(typed);
        }
        if (!username) return null;

        try {
            const rec = await createPasskeyCredential({ username, rpName: ui.appTitle || 'Arborito' });
            this.nostr.putAuthCredential({ username, credential: rec });
            // Immediately sign in with the same username (user just verified biometrics).
            this._passkeySession = {
                v: 1,
                username,
                credentialId: rec.id,
                authenticatedAt: new Date().toISOString()
            };
            this.update({});
            this._schedulePublishIdentityClaimAfterPasskey();
            this.notify(ui.passkeyRegisterOk || 'Passkey created.', false);
            return this._passkeySession;
        } catch (e) {
            this.notify((ui.passkeyRegisterFailed || 'Could not create passkey. {message}').replace('{message}', String(e?.message || e)), true);
            return null;
        }
    }

    logoutPasskey() {
        this._passkeySession = null;
        this._passkeyChallenge = '';
        this._recoveryBootstrap = null;
        this.update({});
    }

    // --- Sync login (QR / code; optional secret file — no WebAuthn required) ---

    /**
     * @returns {{ username: string, plainSecret: string, qrDataUrl: string }}
     */
    async registerSyncLoginAccount(username) {
        const ui = this.ui;
        const name = normalizeUsername(username);
        if (!name) {
            throw new Error(ui.passkeyUsernameRequired || 'Choose a username first.');
        }
        if (!isNostrNetworkAvailable()) {
            throw new Error(ui.nostrNotLoadedHint || 'Nostr relays unavailable. Online account needs Nostr relays.');
        }
        const existing = await this.nostr.loadSyncLoginRecordOnce(name);
        if (existing?.hash) {
            throw new Error(
                ui.syncLoginUsernameTaken ||
                    'That username is already taken. Choose another or sign in with your code.'
            );
        }
        const plainRaw = generatePlainSyncSecret();
        const plain = formatSyncSecretForDisplay(normalizeSyncSecret(plainRaw));
        const hash = await hashSyncSecret(plain);
        this.nostr.putSyncLoginHash({ username: name, hash });
        const { qrTextToDataUrl } = await import('./utils/identity-qr.js');
        const qrPayload = buildSyncLoginQrPayload(name, plain);
        const qrDataUrl = qrPayload ? await qrTextToDataUrl(qrPayload, { size: 220 }) : '';
        this._passkeySession = {
            v: 1,
            username: name,
            authMode: 'sync',
            credentialId: 'sync-login',
            authenticatedAt: new Date().toISOString(),
            syncSecretPlain: plain,
            syncQrDataUrl: qrDataUrl
        };
        this.userStore.settings.updateGamification({
            ...this.userStore.state.gamification,
            username: name
        });
        this.update({});
        this._schedulePublishIdentityClaimAfterPasskey();
        this.notify(ui.syncLoginCreatedOk || 'Account ready. Save your code or download the file.', false);
        return { username: name, plainSecret: plain, qrDataUrl };
    }

    /**
     * Replace sync secret on the network (invalidates previous QR/code/file). Must be signed in with sync account.
     * @returns {Promise<{ username: string, plainSecret: string, qrDataUrl: string }>}
     */
    async rotateSyncLoginSecret() {
        const ui = this.ui;
        const sess = this._passkeySession;
        const name = sess?.username ? normalizeUsername(sess.username) : '';
        if (!name) {
            throw new Error(ui.passkeyUsernameRequired || 'Sign in first.');
        }
        if (sess?.credentialId !== 'sync-login' && sess?.authMode !== 'sync') {
            throw new Error(
                ui.syncLoginRotateOnlySync || 'Only accounts that use a sync code can rotate it here.'
            );
        }
        if (!isNostrNetworkAvailable()) {
            throw new Error(ui.nostrNotLoadedHint || 'Nostr relays unavailable.');
        }
        const plainRaw = generatePlainSyncSecret();
        const plain = formatSyncSecretForDisplay(normalizeSyncSecret(plainRaw));
        const hash = await hashSyncSecret(plain);
        this.nostr.putSyncLoginHash({ username: name, hash });
        const { qrTextToDataUrl } = await import('./utils/identity-qr.js');
        const qrPayload = buildSyncLoginQrPayload(name, plain);
        const qrDataUrl = qrPayload ? await qrTextToDataUrl(qrPayload, { size: 220 }) : '';
        this._passkeySession = {
            ...sess,
            syncSecretPlain: plain,
            syncQrDataUrl: qrDataUrl
        };
        this.update({});
        this.notify(
            ui.syncLoginRotatedOk || 'New secret generated. The old QR, code, and file no longer work.',
            false
        );
        return { username: name, plainSecret: plain, qrDataUrl };
    }

    /**
     * Move sync-login hash to another username (same secret). Other devices keep working until you rotate.
     * @param {string} newUsernameRaw
     */
    async renameSyncLoginUsername(newUsernameRaw) {
        const ui = this.ui;
        const sess = this._passkeySession;
        const oldName = sess?.username ? normalizeUsername(sess.username) : '';
        const newName = normalizeUsername(newUsernameRaw);
        if (!oldName) {
            throw new Error(ui.passkeyUsernameRequired || 'Sign in first.');
        }
        if (sess?.credentialId !== 'sync-login' && sess?.authMode !== 'sync') {
            throw new Error(ui.syncLoginRenameOnlySync || 'Only sync accounts can change the online username here.');
        }
        if (!newName) {
            throw new Error(ui.passkeyUsernameRequired || 'Enter a username.');
        }
        if (newName === oldName) {
            throw new Error(ui.syncLoginRenameSame || 'That is already your online username.');
        }
        if (!isNostrNetworkAvailable()) {
            throw new Error(ui.nostrNotLoadedHint || 'Nostr relays unavailable.');
        }
        const taken = await this.nostr.loadSyncLoginRecordOnce(newName);
        if (taken?.hash) {
            throw new Error(ui.syncLoginUsernameTaken || 'That name is already taken.');
        }
        const rec = await this.nostr.loadSyncLoginRecordOnce(oldName);
        if (!rec?.hash) {
            throw new Error(ui.syncLoginNoAccount || 'Could not load your online account.');
        }
        this.nostr.putSyncLoginHash({ username: newName, hash: rec.hash });
        this.nostr.clearSyncLoginRecord(oldName);
        const plain = sess?.syncSecretPlain ? String(sess.syncSecretPlain).trim() : '';
        let nextQr = plain ? '' : String(sess?.syncQrDataUrl || '');
        if (plain) {
            const { qrTextToDataUrl } = await import('./utils/identity-qr.js');
            const qrPayload = buildSyncLoginQrPayload(newName, plain);
            nextQr = qrPayload ? await qrTextToDataUrl(qrPayload, { size: 220 }) : '';
        }
        this._passkeySession = {
            ...sess,
            username: newName,
            ...(plain ? { syncSecretPlain: plain, syncQrDataUrl: nextQr } : {})
        };
        this.userStore.settings.updateGamification({
            ...this.userStore.state.gamification,
            username: newName
        });
        this.update({});
        this._schedulePublishIdentityClaimAfterPasskey();
        this.notify(ui.syncLoginRenamedOk || 'Online username updated.', false);
    }

    /** Removes sync hash from the network and signs out (local progress stays). */
    async deleteSyncLoginOnlineAccount() {
        const ui = this.ui;
        const sess = this._passkeySession;
        const name = sess?.username ? normalizeUsername(sess.username) : '';
        if (!name) {
            throw new Error(ui.passkeyUsernameRequired || 'Sign in first.');
        }
        if (sess?.credentialId !== 'sync-login' && sess?.authMode !== 'sync') {
            throw new Error(ui.syncLoginDeleteOnlySync || 'Only sync accounts can be removed here.');
        }
        if (!isNostrNetworkAvailable()) {
            throw new Error(ui.nostrNotLoadedHint || 'Nostr relays unavailable.');
        }
        this.nostr.clearSyncLoginRecord(name);
        this.userStore.state.cloudProgressSync = false;
        this.userStore.persist();
        this.logoutPasskey();
        this.notify(ui.syncLoginDeletedOk || 'Online account removed from this device.', false);
    }

    async signInWithSyncSecret(username, secretPlain) {
        const ui = this.ui;
        const name = normalizeUsername(username);
        if (!name) {
            throw new Error(ui.passkeyUsernameRequired || 'Enter your username.');
        }
        if (!isNostrNetworkAvailable()) {
            throw new Error(ui.nostrNotLoadedHint || 'Nostr relays unavailable.');
        }
        const rec = await this.nostr.loadSyncLoginRecordOnce(name);
        if (!rec?.hash) {
            throw new Error(
                ui.syncLoginNoAccount ||
                    'No account found for that name. Check the spelling or create a new code.'
            );
        }
        const ok = await syncSecretMatchesStored(rec.hash, secretPlain);
        if (!ok) {
            throw new Error(ui.syncLoginWrongSecret || 'Wrong username or secret code.');
        }
        const plain = formatSyncSecretForDisplay(normalizeSyncSecret(secretPlain));
        const { qrTextToDataUrl } = await import('./utils/identity-qr.js');
        const qrPayload = buildSyncLoginQrPayload(name, plain);
        const qrDataUrl = qrPayload ? await qrTextToDataUrl(qrPayload, { size: 220 }) : '';
        this._passkeySession = {
            v: 1,
            username: name,
            authMode: 'sync',
            credentialId: 'sync-login',
            authenticatedAt: new Date().toISOString(),
            syncSecretPlain: plain,
            syncQrDataUrl: qrDataUrl
        };
        this.userStore.settings.updateGamification({
            ...this.userStore.state.gamification,
            username: name
        });
        this.update({});
        this._schedulePublishIdentityClaimAfterPasskey();
        this.notify(ui.syncLoginOk || 'Signed in.', false);
        return this._passkeySession;
    }

    /**
     * @param {string} text — QR JSON or pasted payload
     * @returns {Promise<boolean>}
     */
    async applySyncLoginQrPayload(text) {
        const parsed = parseSyncLoginFromText(text);
        if (!parsed) return false;
        await this.signInWithSyncSecret(parsed.username, parsed.secret);
        return true;
    }

    buildSyncLoginQrForSession(plainSecret) {
        const u = this._passkeySession?.username;
        if (!u || !plainSecret) return '';
        return buildSyncLoginQrPayload(u, plainSecret);
    }

    downloadSyncSecretFile(username, plainSecret) {
        const u = String(username || '').trim();
        const body =
            `Arborito sync code\nUsername: ${u}\nSecret: ${String(plainSecret || '').trim()}\n\n` +
            `Keep this file private. Anyone with this secret can use your online account.\n`;
        const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `arborito-sync-${u.replace(/[^\w.-]+/g, '_')}.txt`;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }

    // --- QR Signaling (WhatsApp Web flow: desktop displays QR, mobile authorizes) ---

    /**
     * Initializes the QR signaling manager (lazy init)
     * @returns {QrSignalingManager}
     */
    get qrSignaling() {
        if (!this._qrSignalingManager) {
            this._qrSignalingManager = new QrSignalingManager();
        }
        return this._qrSignalingManager;
    }

    /**
     * Desktop: starts QR session and returns the payload for QR generation
     * @param {string} [preferredUsername] - Preferred username if known
     * @returns {{ sessionId: string, pubkey: string, qrPayload: string, qrDataUrlPromise: Promise<string> }}
     */
    async startQrSignalingSession(preferredUsername = '') {
        const ui = this.ui;
        if (!isNostrNetworkAvailable()) {
            throw new Error(ui.nostrNotLoadedHint || 'Nostr relays unavailable.');
        }
        const { session, pair } = this.qrSignaling.createSession(preferredUsername);
        const relays = this.nostr.getPublishRelayUrls();

        // Publish signal on Nostr
        await this.nostr.publishQrSignalRequest({ tempPair: pair, sessionId: session.sessionId, relays });

        // Build payload for QR
        const qrPayload = buildQrSignalingPayload(session.sessionId, pair.pub, relays);

        // Prepare promise for QR image generation
        const { qrTextToDataUrl } = await import('./utils/identity-qr.js');
        const qrDataUrlPromise = qrTextToDataUrl(qrPayload, { size: 220 });

        return {
            sessionId: session.sessionId,
            pubkey: pair.pub,
            qrPayload,
            qrDataUrlPromise
        };
    }

    /**
     * Desktop: checks if mobile has already authorized the QR session
     * @param {string} sessionId
     * @returns {Promise<{ authorized: boolean, username?: string, secretHash?: string }>}
     */
    async checkQrSignalingAuth(sessionId) {
        const auth = await this.nostr.queryQrSignalAuth(sessionId);
        if (!auth) return { authorized: false };

        // Verify that the hash corresponds to a valid user
        const rec = await this.nostr.loadSyncLoginRecordOnce(auth.username);
        if (!rec?.hash || rec.hash !== auth.secretHash) {
            return { authorized: false };
        }

        return {
            authorized: true,
            username: auth.username,
            secretHash: auth.secretHash
        };
    }

    /**
     * Desktop: completes login after receiving authorization from mobile
     * @param {string} sessionId
     * @returns {Promise<boolean>}
     */
    async completeQrSignalingLogin(sessionId) {
        const ui = this.ui;
        const check = await this.checkQrSignalingAuth(sessionId);
        if (!check.authorized || !check.username) {
            throw new Error(ui.syncLoginQrAuthFailed || 'QR authorization failed or expired.');
        }

        // Desktop does NOT know the plaintext secret, only the hash.
        // User must enter the code or we use the "trust this device" flow
        // For now, mark as "authorized by mobile" and wait for user
        // to enter their code manually or use an "approve this device" flow

        // Option A: "Semi-authenticated" login - requires code for sensitive operations
        this._passkeySession = {
            v: 1,
            username: check.username,
            authMode: 'qr-signal-pending',
            credentialId: 'qr-signal-login',
            authenticatedAt: new Date().toISOString(),
            qrSignalSessionId: sessionId,
            qrSignalAuthorized: true
        };

        this.userStore.settings.updateGamification({
            ...this.userStore.state.gamification,
            username: check.username
        });
        this.update({});
        this._schedulePublishIdentityClaimAfterPasskey();
        this.notify(ui.syncLoginQrAuthorized || 'Device authorized. Welcome!', false);

        // Clean up QR session
        this.qrSignaling.authorize(sessionId, check.username);

        return true;
    }

    /**
     * Desktop: cancels active QR session
     * @param {string} sessionId
     */
    async cancelQrSignalingSession(sessionId) {
        const session = this.qrSignaling.get(sessionId);
        if (session) {
            const pair = { pub: session.pubkey, priv: session.privkey };
            await this.nostr.revokeQrSignalRequest({ tempPair: pair });
        }
    }

    /**
     * Mobile: scans desktop QR and publishes authorization
     * @param {string} qrText - Scanned QR text
     * @returns {Promise<boolean>}
     */
    async scanQrSignalingAndAuthorize(qrText) {
        const ui = this.ui;
        const parsed = parseQrSignalingPayload(qrText);
        if (!parsed) {
            throw new Error(ui.syncLoginQrUnreadable || 'Invalid QR code.');
        }

        // Verify that mobile is authenticated with sync-login
        const sess = this._passkeySession;
        const isSyncAuthed = sess?.credentialId === 'sync-login' && sess?.authMode === 'sync';
        if (!isSyncAuthed || !sess?.username || !sess?.syncSecretPlain) {
            throw new Error(ui.syncLoginQrAuthRequired || 'Sign in with your sync code first to authorize other devices.');
        }

        // Get secret hash
        const secretHash = await hashSyncSecret(sess.syncSecretPlain);

        // Create temporary keypair to publish authorization
        const { createQrSignalingPair } = await import('./services/qr-signaling.js');
        const mobilePair = createQrSignalingPair();

        // Publish authorization
        await this.nostr.publishQrSignalAuth({
            mobilePair,
            sessionId: parsed.sessionId,
            desktopPubkey: parsed.pubkey,
            username: sess.username,
            secretHash
        });

        this.notify(ui.syncLoginQrDeviceAuthorized || 'Device authorized successfully.', false);
        return true;
    }

    openRecoveryAssistant() {
        this.setModal({ type: 'recovery-assistant' });
    }

    /** JSON string for QR: opens this app with `?recover=1` (not a secret). */
    getRecoveryEntryQrPayload() {
        return buildRecoveryEntryQrPayload();
    }

    clearRecoveryBootstrap() {
        this._recoveryBootstrap = null;
        this.update({});
    }

    /** @returns {{ username: string, expiresAt: number } | null} */
    getRecoveryBootstrap() {
        return this._recoveryBootstrap;
    }

    _assertRecoveryBootstrap(username) {
        const ui = this.ui;
        const name = normalizeUsername(username);
        const b = this._recoveryBootstrap;
        if (!b || !name || b.username !== name) {
            throw new Error(ui.recoveryBootstrapMissing || 'Unlock recovery with a code or file first.');
        }
        if (Date.now() > b.expiresAt) {
            this._recoveryBootstrap = null;
            throw new Error(ui.recoveryBootstrapExpired || 'Recovery session expired. Start again.');
        }
        return b;
    }

    /**
     * After backup code or recovery-kit unlock, register an additional passkey for that username.
     */
    async registerPasskeyAfterRecovery(username) {
        this._assertRecoveryBootstrap(username);
        const name = normalizeUsername(username);
        const session = await this.createPasskeyForUsername(name);
        this._recoveryBootstrap = null;
        this.update({});
        return session;
    }

    async verifyRecoveryBackupCodeAndUnlock(username, codePlain) {
        const ui = this.ui;
        const name = normalizeUsername(username);
        if (!name) throw new Error(ui.passkeyUsernameRequired || 'Enter your username.');
        if (!isNostrNetworkAvailable()) {
            throw new Error(ui.nostrNotLoadedHint || 'Nostr relays unavailable. Recovery needs Nostr relays.');
        }
        const hash = await hashRecoveryCode(codePlain);
        const consumed = await this.nostr.consumeRecoveryCodeIfHashMatches(name, hash);
        if (!consumed) {
            throw new Error(ui.recoveryCodeInvalid || 'That code is not valid or was already used.');
        }
        this._recoveryBootstrap = {
            username: name,
            expiresAt: Date.now() + 15 * 60 * 1000
        };
        this.update({});
        return true;
    }

    async unlockRecoveryFromKitFile(jsonText, passphrase) {
        const ui = this.ui;
        if (!isNostrNetworkAvailable()) {
            throw new Error(ui.nostrNotLoadedHint || 'Nostr relays unavailable.');
        }
        const inner = await decryptRecoveryKit(jsonText, passphrase);
        const name = normalizeUsername(inner.username);
        if (!name) throw new Error(ui.recoveryKitBadUsername || 'Invalid recovery file.');
        const idPair = inner.identityPair || inner.nostrPair;
        if (idPair?.pub && (idPair.priv || idPair.epriv)) {
            try {
                localStorage.setItem('arborito-nostr-user-pair', JSON.stringify(idPair));
            } catch {
                /* ignore */
            }
        }
        this._recoveryBootstrap = {
            username: name,
            expiresAt: Date.now() + 15 * 60 * 1000
        };
        this.userStore.settings.updateGamification({
            ...this.userStore.state.gamification,
            username: name
        });
        this.update({});
        return { username: name };
    }

    /**
     * Replace all backup codes on the network (invalidates previous). Returns plaintext codes once — caller must show/store them.
     * @returns {Promise<string[]>}
     */
    async generateRecoveryBackupCodesForAuthedUser() {
        const ui = this.ui;
        const u = this._passkeySession?.username;
        if (!u) throw new Error(ui.recoveryNeedPasskey || 'Sign in with your passkey first.');
        if (!isNostrNetworkAvailable()) {
            throw new Error(ui.nostrNotLoadedHint || 'Nostr relays unavailable.');
        }
        const batch = await generateRecoveryCodeBatch(10);
        const forNostr = batch.map(({ id, hash, createdAt }) => ({
            id,
            hash,
            createdAt,
            usedAt: null
        }));
        await this.nostr.replaceRecoveryCodeRecords({ username: u, records: forNostr });
        return batch.map((b) => b.plain);
    }

    /**
     * @param {string} passphrase
     * @returns {Promise<string>} JSON file body
     */
    async createRecoveryKitEncryptedJson(passphrase) {
        const ui = this.ui;
        const u = this._passkeySession?.username;
        if (!u) throw new Error(ui.recoveryNeedPasskey || 'Sign in with your passkey first.');
        const identityPair = this.getNetworkUserPair?.() || null;
        return encryptRecoveryKit({ username: u, identityPair }, passphrase);
    }

    /** Same-origin: set `recover=1` in the URL and open assistant; otherwise full navigation. */
    navigateToRecoveryEntryFromScan(url) {
        const u = String(url || '').trim();
        if (!u || typeof window === 'undefined') return;
        try {
            const target = new URL(u, window.location.href);
            if (target.origin === window.location.origin) {
                target.searchParams.set('recover', '1');
                const path = `${target.pathname}${target.search}${target.hash || ''}`;
                window.history.replaceState({}, '', path);
                this.setModal({ type: 'recovery-assistant' });
                return;
            }
        } catch {
            /* fall through */
        }
        window.location.href = u;
    }

    /** Ensures a local Ed25519 keypair and returns `did:key:…` (no server). */
    async ensureLocalDidIdentity() {
        return ensureLocalEd25519Identity();
    }

    getCachedLocalDid() {
        return getCachedLocalIdentitySync()?.did || '';
    }

    buildProfileIdentityQrPayload(nick) {
        const cached = getCachedLocalIdentitySync();
        const did = cached?.did || '';
        if (!did) return '';
        return buildIdentityShareJson({ did, nick });
    }

    async importIdentityFromScannedText(text) {
        const recovery = parseRecoveryEntryFromText(text);
        if (recovery?.url) {
            this.navigateToRecoveryEntryFromScan(recovery.url);
            return { kind: 'recovery-entry', url: recovery.url };
        }
        const parsed = parseIdentityShareJson(text);
        if (!parsed?.did) {
            throw new Error(this.ui.identityQrInvalid || 'This QR is not a valid Arborito identity card.');
        }
        saveIdentityContact(parsed);
        this.update({});
        return parsed;
    }

    getIdentityContacts() {
        return loadIdentityContacts();
    }

    removeIdentityContactByDid(did) {
        removeIdentityContact(did);
        this.update({});
    }

    /**
     * When signed in with a passkey username, publish a signed DID claim to Nostr
     * so others can verify username ↔ public key binding.
     */
    async publishIdentityClaimAfterPasskey() {
        const username = this._passkeySession?.username;
        if (!username || !isNostrNetworkAvailable()) return false;
        const { did, publicJwk, privateJwk } = await ensureLocalEd25519Identity();
        const record = await buildSignedIdentityClaim({ username, did, publicJwk, privateJwk });
        if (!(await verifyIdentityClaimRecord(record))) return false;
        return this.nostr.putIdentityClaim({ username, record });
    }

    _schedulePublishIdentityClaimAfterPasskey() {
        queueMicrotask(() => {
            void this.publishIdentityClaimAfterPasskey().catch(() => {});
        });
    }

    /** @returns {Promise<{ state: 'none'|'ok'|'bad'|'mismatch', did?: string }>} */
    async fetchMyNostrIdentityCard() {
        const u = this._passkeySession?.username;
        if (!u || !isNostrNetworkAvailable()) return { state: 'none' };
        const rec = await this.nostr.loadIdentityClaimOnce(u);
        if (!rec) return { state: 'none' };
        const ok = await verifyIdentityClaimRecord(rec);
        if (!ok) return { state: 'bad', did: String(rec.did || '') };
        const local = getCachedLocalIdentitySync();
        const match = !!(local?.did && rec.did === local.did);
        return { state: match ? 'ok' : 'mismatch', did: String(rec.did || '') };
    }

    // --- USER STORE PROXIES ---

    computeHash(str) { return this.userStore.settings.computeHash(str); }

    loadBookmarks() { this.userStore.settings.loadBookmarks(); }
    saveBookmark(nodeId, contentRaw, index, visitedSet) { this.userStore.settings.saveBookmark(nodeId, contentRaw, index, visitedSet); }
    removeBookmark(nodeId) { this.userStore.settings.removeBookmark(nodeId); this.update({}); }
    getBookmark(nodeId, contentRaw) { return this.userStore.settings.getBookmark(nodeId, contentRaw); }
    loadProgress() { this.userStore.loadProgress(); }
    


    /** Enter construction mode: local always; public tree: owner, editor, or proposer (proposer read-only until proposals flow). */
    canOpenConstruction() {
        if (fileSystem.isLocal) return true;
        if (!fileSystem.isNostrTreeSource()) return false;
        const r = this.getMyTreeNetworkRole();
        return r === 'owner' || r === 'editor' || r === 'proposer';
    }

    /** True if the active source is a public universe and this device holds the publisher key. */
    canRetractActivePublicUniverse() {
        const treeRef = this.getActivePublicTreeRef();
        if (!treeRef) return false;
        return !!this.getNostrPublisherPair(treeRef.pub);
    }

    /**
     * If the active source is local:// and it was previously published, return its public tree ref.
     * This is used to prevent "infinite publish" loops when the UI remains on the local editor.
     * @returns {{ pub: string, universeId: string } | null}
     */
    getPublishedTreeRefForActiveLocalSource() {
        try {
            const srcUrl = String(this.state.activeSource?.url || '');
            if (!srcUrl.startsWith('local://')) return null;
            const localId = srcUrl.slice('local://'.length);
            const published = this.userStore?.getLocalTreePublishedNetworkUrl?.(localId);
            if (!published) return null;
            return parseNostrTreeUrl(published);
        } catch {
            return null;
        }
    }


    downloadProgressFile() {
        const data = this.getExportJson();
        const blob = new Blob([data], {type: 'application/json;charset=utf-8'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        a.download = `arborito-progress-${timestamp}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    importProgress(input) {
        try {
            let data;
            const cleaned = input.trim();
            if (cleaned.startsWith('{')) data = JSON.parse(cleaned);
            else data = JSON.parse(decodeURIComponent(escape(atob(cleaned))));

            let newProgress = [];
            if (Array.isArray(data)) newProgress = data;
            if (data.progress) newProgress = data.progress;
            if (data.p) newProgress = data.p;

            if (data.g || data.gamification) {
                this.userStore.state.gamification = { ...this.userStore.state.gamification, ...(data.g || data.gamification) };
                if (this.userStore.state.gamification.fruits && !this.userStore.state.gamification.seeds) {
                    this.userStore.state.gamification.seeds = this.userStore.state.gamification.fruits;
                }
            }
            
            if (data.b || data.bookmarks) {
                this.userStore.state.bookmarks = { ...this.userStore.state.bookmarks, ...(data.b || data.bookmarks) };
                localStorage.setItem('arborito-bookmarks', JSON.stringify(this.state.bookmarks));
            }
            
            if (data.d || data.gameData) {
                this.userStore.state.gameData = { ...this.userStore.state.gameData, ...(data.d || data.gameData) };
            }

            // Restore Nostr writer keypair (needed to decrypt synced progress).
            const importedPair =
                data.nostrPair && typeof data.nostrPair === 'object' ? data.nostrPair : null;
            if (importedPair && importedPair.pub && (importedPair.priv || importedPair.epriv)) {
                localStorage.setItem('arborito-nostr-user-pair', JSON.stringify(importedPair));
            }

            if (!Array.isArray(newProgress)) throw new Error("Invalid Format");

            const merged = new Set([...this.userStore.state.completedNodes, ...newProgress]);
            this.userStore.state.completedNodes = merged;
            this.userStore.persist();
            
            if (this.state.data) DataProcessor.hydrateCompletionState(this, this.state.data);
            
            this.update({});
            // If a public tree is mounted, push the imported progress back (encrypted).
            try {
                this.maybeSyncNetworkProgress(this.userStore.getPersistenceData());
            } catch {
                /* ignore */
            }
            return true;
        } catch (e) {
            console.error(e);
            return false;
        }
    }

    /** GDPR: optional consents only (external media, Sage AI, inline-game warning). */
    async resetOptionalConsentsInteractive() {
        const ui = this.ui;
        const ok = await this.confirm(
            ui.privacyResetConsentConfirmBody,
            ui.privacyResetConsentConfirmTitle,
            false
        );
        if (!ok) return;
        clearOptionalConsentKeys();
        this.notify(ui.privacyResetConsentDone, false);
    }

    /** GDPR: erase all Arborito browser storage on this device and reload. */
    async wipeAllLocalDataOnThisDeviceInteractive() {
        const ui = this.ui;
        const word = (ui.privacyWipeLocalPromptWord || 'deletetree').trim();
        const typed = await this.showDialog({
            type: 'prompt',
            title: ui.privacyWipeLocalTitle || 'Wipe local data?',
            body:
                ui.privacyWipeLocalPromptBody ||
                `Type ${word} to confirm. This cannot be undone.`,
            placeholder: ui.privacyWipeLocalPromptPlaceholder || word,
            danger: true,
            confirmText: ui.privacyWipeLocalConfirmButton || ui.privacyWipeLocalButton || 'Delete',
            cancelText: ui.cancel || 'Cancel'
        });
        if (String(typed || '').trim().toLowerCase() !== word.toLowerCase()) {
            this.notify(ui.privacyWipeLocalPromptMismatch || 'Confirmation did not match.', true);
            return;
        }
        await this.wipeAllLocalDataOnThisDevice();
    }

    /** Erase all Arborito browser storage on this device and reload. */
    async wipeAllLocalDataOnThisDevice() {
        clearAllArboritoBrowserStorage();
        await clearWllamaCaches();
        window.location.reload();
    }

    isCompleted(id) { return this.userStore.isCompleted(id); }

    getAvailableCertificates() {
        if (this.state.data && this.state.data.certificates) {
            return this.state.data.certificates.map(c => {
                const isComplete = this.userStore.state.completedNodes.has(c.id);
                return { ...c, isComplete };
            });
        }
        return this.getModulesStatus().filter(m => m.isCertifiable);
    }

    getModulesStatus() {
        return TreeUtils.getModulesStatus(this.state.data, this.userStore.state.completedNodes);
    }

    // --- Author license (CC) & empty-tree prompt ---

    hasAcceptedAuthorLicense() {
        try {
            return localStorage.getItem(AUTHOR_LICENSE_STORAGE_KEY) === AUTHOR_LICENSE_VERSION;
        } catch {
            return false;
        }
    }

    acceptAuthorLicense() {
        try {
            localStorage.setItem(AUTHOR_LICENSE_STORAGE_KEY, AUTHOR_LICENSE_VERSION);
        } catch {
            /* ignore */
        }
    }

    cancelAuthorLicenseModal() {
        if (this.state.modalOverlay?.type === 'author-license') {
            this.closeAuthorLicenseOverlay();
            return;
        }
        this.dismissModal();
    }

    maybePromptNoTree(opts = {}) {
        if (this.state.treeHydrating) return;
        if (this.state.loading) return;
        if (this.state.data) return;

        const m = this.state.modal;
        const t = typeof m === 'string' ? m : m?.type;
        const localCount = this.userStore?.state?.localTrees?.length ?? 0;
        const emptyGarden = localCount === 0;

        /** Empty garden and no curriculum: always open Trees (sources). */
        if (emptyGarden) {
            if (t === 'language') return;
            if (t === 'onboarding') return;
            if (this.state.modalOverlay?.type === 'author-license') return;
            if (t === 'recovery-assistant') return;
            if (t === 'author-license' || t === 'load-warning') return;
            if (t === 'dialog') return;
            this.setModal({ type: 'sources' });
            return;
        }

        if (t === 'language') return;
        if (t === 'onboarding') return;
        if (this.state.modalOverlay?.type === 'author-license') return;
        if (t === 'author-license' || t === 'load-warning') return;
        if (t === 'dialog') return;
        // No tree: open Trees (sources) directly.
        this.setModal({ type: 'sources' });
    }

    /**
     * Called by the forum modal before await store.confirm / prompt so remount restores scroll/thread.
     * @param {{ threadId?: string|null, placeId?: string|null, mobilePanel?: string, draft?: string, replyParentId?: string|null }} snap
     */
    stashForumShellBeforeDialog(snap) {
        this._forumShellSnapshot = snap;
    }

    consumeForumShellSnapshot() {
        const s = this._forumShellSnapshot;
        this._forumShellSnapshot = null;
        return s || null;
    }

    dismissModal(opts = {}) {
        super.dismissModal(opts);
    }

    toggleConstructionMode() {
        const willEnable = !this.state.constructionMode;
        if (willEnable) {
            const role = typeof this.getMyTreeNetworkRole === 'function' ? this.getMyTreeNetworkRole() : null;
            if (
                fileSystem.isNostrTreeSource() &&
                !fileSystem.features.canWrite &&
                role !== 'owner' &&
                role !== 'editor' &&
                this.state.rawGraphData
            ) {
                void this.offerLocalCopyFromNetworkTreeForEditing();
                return;
            }
        }
        if (willEnable && !this.hasAcceptedAuthorLicense()) {
            this.acceptAuthorLicense();
        }
        if (willEnable && !this.canOpenConstruction()) {
            const ui = this.ui;
            this.notify(ui.constructionRequiresWritable || ui.treeReadOnlyHint || 'This tree is read-only.', true);
            return;
        }
        const enabling = willEnable;
        this.update({ constructionMode: enabling });
        if (!enabling) {
            // Construction ended: if we are on a public tree and cloud sync is off,
            // we may want to show a post-load banner now (non-blocking).
            try {
                this.maybeShowCloudSyncBannerForSource?.(this.state.activeSource);
            } catch {
                /* ignore */
            }
            const m = this.state.modal;
            const t = typeof m === 'object' && m ? m.type : m;
            if (
                t === 'construction-curriculum-lang' ||
                (t === 'pick-curriculum-lang' && m && typeof m === 'object' && m.fromConstructionLangModal)
            ) {
                this.setModal(null);
            }
            this.update({ curriculumEditLang: null });
            if (this.state.rawGraphData?.languages && this.state.activeSource) {
                DataProcessor.process(this, this.state.rawGraphData, this.state.activeSource, {
                    suppressReadmeAutoOpen: true
                });
            }
        } else {
            if (!this.state.data && this.state.rawGraphData?.languages && this.state.activeSource) {
                try {
                    DataProcessor.process(this, this.state.rawGraphData, this.state.activeSource, {
                        suppressReadmeAutoOpen: true
                    });
                } catch (e) {
                    console.error('toggleConstructionMode: rehydrate graph', e);
                    this.update({ loading: false });
                }
            }
            const n = this.state.selectedNode;
            if (n && (n.type === 'leaf' || n.type === 'exam')) {
                this.afterLessonOpened(n);
            }
            // Start construction tour once (separate from the default UI tour).
            queueMicrotask(() => {
                try {
                    if (localStorage.getItem('arborito-ui-tour-done-construction')) return;
                } catch {
                    /* ignore */
                }
                if (this.state.modal || this.state.previewNode || this.state.modalOverlay) return;
                window.dispatchEvent(
                    new CustomEvent('arborito-start-tour', { detail: { source: 'construction-enter', mode: 'construction' } })
                );
            });
        }
    }
}

Object.assign(Store.prototype, mountBundleMethods);
Object.assign(Store.prototype, nostrGraphCurriculumMethods);
Object.assign(Store.prototype, nostrSyncForumCommunityMethods);
Object.assign(Store.prototype, nostrAdminGovernanceMethods);
Object.assign(Store.prototype, publishRevokeMethods);
Object.assign(Store.prototype, webtorrentPublishMethods);
Object.assign(Store.prototype, userProgressBundleMethods);

export const store = new Store();