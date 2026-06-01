import { NostrUniverseService } from '../features/nostr/nostr-universe.js';
import { getWindowConfiguredNostrRelays, normalizeNostrRelayUrls } from '../features/nostr/nostr-relays-runtime.js';
import { storeNostrSyncProgressMethods } from '../features/garden-progress/store-mixins/store-nostr-sync-progress-methods.js';
import { storeNostrForumMethods } from '../features/forum/store-mixins/store-nostr-forum-methods.js';
import { storeNostrCommunityMethods } from '../features/nostr/store-mixins/store-nostr-community-methods.js';
import { nostrAdminGovernanceMethods } from '../features/nostr/store-mixins/store-nostr-admin-governance-methods.js';
import { publishRevokeMethods } from '../features/publishing/store-mixins/store-publish-revoke-methods.js';
import { nostrGraphCurriculumMethods } from '../features/tree-graph/store-mixins/store-nostr-graph-curriculum-methods.js';
import { webtorrentPublishMethods } from '../features/p2p-webtorrent/store-mixins/store-webtorrent-publish-methods.js';
import { mountBundleMethods } from '../features/sources/store-mixins/store-mount-bundle-methods.js';
import { userProgressBundleMethods } from '../features/garden-progress/store-mixins/store-user-progress-bundle-methods.js';
import { gardenGamificationMethods } from '../features/garden-progress/store-mixins/store-garden-gamification-methods.js';
import { storeConstructionUndoMethods } from '../features/editor/store-mixins/store-construction-undo-methods.js';
import { storePresenceMethods } from '../features/identity-auth/store-mixins/store-presence-methods.js';
import { storeReportsMethods } from '../features/publishing/store-mixins/store-reports-methods.js';
import { storeLicenseMethods } from '../features/publishing/store-mixins/store-license-methods.js';
import { storeSourceResolveMethods } from '../features/sources/store-mixins/store-source-resolve-methods.js';
import { storeNavigationSearchMethods } from '../features/search/store-mixins/store-navigation-search-methods.js';
import { storeIdentityAuthMethods } from '../features/identity-auth/store-mixins/store-identity-auth-methods.js';
import { storeSyncLoginMethods } from '../features/identity-auth/store-mixins/store-sync-login-methods.js';
import { storeAccountRestoreMethods } from '../features/identity-auth/store-mixins/store-account-restore-methods.js';
import { storeAccountEscrowClientMethods } from '../features/identity-auth/store-mixins/store-account-escrow-client-methods.js';
import { storeImportExportMethods } from '../features/publishing/store-mixins/store-import-export-methods.js';
import { storeProgressCertificatesMethods } from '../features/garden-progress/store-mixins/store-progress-certificates-methods.js';
import { storeGdprConsentMethods } from '../features/privacy-gdpr/store-mixins/store-gdpr-consent-methods.js';
import { UserStore } from './user-store/index.js';
import { ForumStore } from '../features/forum/forum-store.js';
import { SourceManager } from '../features/sources/source-manager.js';
import { storageManager } from '../features/backup-export/storage-manager.js';
import { GraphLogic } from '../features/tree-graph/graph-logic.js';
import { AILogic } from '../features/learning/ai-logic.js';
import { UIStore } from './ui-store.js';
import { fileSystem } from '../features/backup-export/filesystem.js';
import { WebTorrentService } from '../features/p2p-webtorrent/webtorrent-service.js';
import {
    hasGdprNetworkConsent,
    onGdprNetworkConsentGranted
} from '../features/privacy-gdpr/gdpr-network-consent.js';

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
        /**
         * Active sign-in session. Populated after a successful sync-login flow
         * (typed secret, scanned QR or register). `null` means "local only".
         * @type {{ v: number, username: string, authMode: string, authenticatedAt: string, syncSecretPlain?: string, syncQrDataUrl?: string } | null}
         */
        this._authSession = null;
        // Graph Logic Delegator
        this.graphLogic = new GraphLogic(this);
        
        // AI Logic Delegator
        this.aiLogic = new AILogic(this);

        // 2. Initialization
        this.initialize().then(async () => {
             this.checkStreak();

             /* GDPR gate: only do source resolution (which may resolve `?source=`
              * / `?code=` via Nostr or auto-load the last community tree) once
              * the user has accepted the privacy policy. Brand-new visitors hit
              * onboarding step 1 first; `app-entry.js` already migrated implied
              * consent for returning users so they fall through immediately. */
             const runSourceBoot = async () => {
                 const source = await this.sourceManager.init();
                 const loader = document.getElementById('arborito-initial-loader');
                 if (loader) {
                     loader.style.opacity = '0';
                     setTimeout(() => loader.remove(), 500);
                 }
                 if (source) {
                     /* Fire-and-forget so the spinner does not block on slow Nostr
                      * relays, but still observe the result: when the boot mount
                      * fails (e.g. relays unreachable on F5), `mountCurriculum`'s
                      * `isInitialMount` branch already cleared the loading state
                      * and kept the saved source pointer in localStorage. We
                      * just need to make sure the Trees picker opens so the user
                      * can retry instead of staring at a blank canvas. */
                     this.loadData(source).then((ok) => {
                         if (!ok) queueMicrotask(() => this.maybePromptNoTree());
                     });
                 } else {
                     this.update({ loading: false });
                     setTimeout(() => this.maybePromptNoTree(), 400);
                 }
             };

             if (hasGdprNetworkConsent()) {
                 await runSourceBoot();
             } else {
                 /* Hide the spinner so the user clearly sees the onboarding /
                  * privacy gate instead of a blank loading screen. Keep
                  * `loading: false` so the welcome state renders cleanly. */
                 this.update({ loading: false });
                 const loader = document.getElementById('arborito-initial-loader');
                 if (loader) {
                     loader.style.opacity = '0';
                     setTimeout(() => loader.remove(), 500);
                 }
                 onGdprNetworkConsentGranted(() => {
                     void runSourceBoot();
                 });
             }
        });

        document.documentElement.classList.toggle('dark', this.state.theme === 'dark');
        /** Debounce local garden persistence after `update({ rawGraphData })` (no Save button in the dock). */
        this._localTreeAutosaveTimer = null;
        /** Light `rawGraphData` history in construction mode (Undo button in the dock). */
        this._constructionUndoStack = [];
        this._constructionRedoStack = [];
        this._constructionUndoMax = 32;
        this._constructionUndoApplying = false;
    }

    update(partialState) {
        if (!partialState || typeof partialState !== 'object') {
            super.update(partialState);
            return;
        }

        if ('rawGraphData' in partialState && partialState.rawGraphData == null && !this._constructionUndoApplying) {
            this._constructionUndoStack = [];
            this._constructionRedoStack = [];
            this.dispatchEvent(new CustomEvent('construction-undo-changed'));
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
                const prev =
                    this._constructionUndoStack.length > 0
                        ? this._normalizeConstructionHistoryEntry(
                              this._constructionUndoStack[this._constructionUndoStack.length - 1]
                          ).snap
                        : null;
                const before = JSON.parse(JSON.stringify(this.state.rawGraphData));
                const summary = this._constructionHistorySummary(prev, partialState.rawGraphData || before);
                this._constructionUndoStack.push(this._makeConstructionHistoryEntry(before, summary));
                // Clear redo stack on new action
                this._constructionRedoStack = [];
                while (this._constructionUndoStack.length > this._constructionUndoMax) {
                    this._constructionUndoStack.shift();
                }
            } catch {
                /* ignore */
            }
            // Notify UI that undo history changed
            this.dispatchEvent(new CustomEvent('construction-undo-changed'));
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

        /* Onboarding wizard routing:
         *
         * - First-ever visit (`!seen`): full wizard from step 1 (welcome + language).
         * - Returning visit, but the user previously picked "Continue without an
         *   account" AND still has no curriculum / local tree / active source
         *   pointer: reopen the wizard at step 2 (session choice). The user
         *   explicitly asked for this — a "skip + reload with no tree" loop
         *   keeps surfacing the choice so they don't end up stranded with no
         *   identity AND no content. Signing in, registering, or actually
         *   loading a tree all satisfy "made progress" and stop the loop.
         */
        let seen = true;
        try {
            seen = localStorage.getItem('arborito-onboarding-seen-v1') === 'true';
        } catch {
            /* ignore */
        }
        if (!this.state.modal) {
            if (!seen) {
                setTimeout(() => this.setModal({ type: 'onboarding' }), 60);
                return;
            }
            const signedIn = !!(this.isSignedIn && this.isSignedIn());
            const localTrees = (this.userStore?.state?.localTrees) || [];
            let hasActiveSourcePointer = false;
            try {
                hasActiveSourcePointer = !!localStorage.getItem('arborito-active-source-id');
            } catch {
                /* ignore */
            }
            const needsSessionStep =
                !signedIn && localTrees.length === 0 && !hasActiveSourcePointer;
            if (needsSessionStep) {
                setTimeout(() => this.setModal({ type: 'onboarding', step: 2 }), 60);
                return;
            }
        }
        this._scheduleDeferredProductTour();
    }

    get value() { 
        return { 
            ...this.state,
            completedNodes: this.userStore.state.completedNodes,
            bookmarks: this.userStore.state.bookmarks,
            gamification: this.userStore.state.gamification
        }; 
    }

    get dailyXpGoal() { return this.userStore.dailyXpGoal; }
    get storage() { return storageManager; }

    /** Active sign-in session. Plaintext sync secret stays in-memory only. */
    get authSession() {
        return this._authSession;
    }
}

Object.assign(Store.prototype, mountBundleMethods);
Object.assign(Store.prototype, nostrGraphCurriculumMethods);
Object.assign(Store.prototype, storeNostrSyncProgressMethods);
Object.assign(Store.prototype, storeNostrForumMethods);
Object.assign(Store.prototype, storeNostrCommunityMethods);
Object.assign(Store.prototype, nostrAdminGovernanceMethods);
Object.assign(Store.prototype, publishRevokeMethods);
Object.assign(Store.prototype, webtorrentPublishMethods);
Object.assign(Store.prototype, userProgressBundleMethods);
Object.assign(Store.prototype, gardenGamificationMethods);
Object.assign(Store.prototype, storeConstructionUndoMethods);
Object.assign(Store.prototype, storePresenceMethods);
Object.assign(Store.prototype, storeReportsMethods);
Object.assign(Store.prototype, storeLicenseMethods);
Object.assign(Store.prototype, storeSourceResolveMethods);
Object.assign(Store.prototype, storeNavigationSearchMethods);
Object.assign(Store.prototype, storeIdentityAuthMethods);
Object.assign(Store.prototype, storeSyncLoginMethods);
Object.assign(Store.prototype, storeAccountRestoreMethods);
Object.assign(Store.prototype, storeAccountEscrowClientMethods);
Object.assign(Store.prototype, storeImportExportMethods);
Object.assign(Store.prototype, storeProgressCertificatesMethods);
Object.assign(Store.prototype, storeGdprConsentMethods);

export const store = new Store();
