import { hideInitialLoader } from '../boot-loader.js';
import { applyArboritoTheme } from '../shared/lib/boot-theme.js';
import { isOnboardingWizardIncomplete } from '../shared/lib/onboarding-boot-gate.js';
import { scheduleIdle } from '../shared/lib/yield-to-paint.js';
import {
    hasGdprNetworkConsent,
    onGdprNetworkConsentGranted,
    warmNostrRelayConnections,
} from '../shared/lib/connected-services/index.js';
import { ensureAppCoreReady, shouldDeferHeavyBoot } from './store-lazy-modules.js';

const BOOT_SOURCE_INIT_MS = 30000;
const BOOT_TREE_SLOW_MS = 60000;

/**
 * @param {import('./store.js').Store} store
 */
async function runSourceBoot(store) {
    await ensureAppCoreReady();
    store._restorePersistedAuthSession?.();
    store.checkStreak?.();
    try {
        await store.userStore.ensureBranchesHydrated();
        await store.ensureNostrReady();
        let source = null;
        try {
            source = await Promise.race([
                store.sourceManager.init(),
                new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Source boot timed out')), BOOT_SOURCE_INIT_MS);
                }),
            ]);
        } catch (e) {
            console.warn('[Arborito] source boot failed', e);
            hideInitialLoader();
            store.update({ loading: false, treeHydrating: false, treeGrowingOverlay: false });
            const ui = store.ui || {};
            store.notify(
                (ui.sourceBootFailed || 'Could not resolve tree source: {message}').replace(
                    /\{message\}/g,
                    String(e?.message || e)
                ),
                true
            );
            setTimeout(() => store.maybePromptNoTree(), 400);
            return;
        }

        const pendingUntrusted =
            store.state.pendingUntrustedSource ||
            (store.state.modal &&
                typeof store.state.modal === 'object' &&
                store.state.modal.type === 'load-warning');
        if (!source) {
            hideInitialLoader();
            store.update({ loading: false });
            if (!pendingUntrusted) {
                setTimeout(() => store.maybePromptNoTree(), 400);
            }
            return;
        }

        if (
            store.state.modal &&
            typeof store.state.modal === 'object' &&
            store.state.modal.fromOnboarding
        ) {
            hideInitialLoader();
            store.update({ loading: false });
            return;
        }

        const treeLoadPromise = store.loadData(source);
        const slowHintTimer = setTimeout(() => {
            if (!store.state.treeHydrating) return;
            const ui = store.ui || {};
            store.notify(ui.treeLoadSlowHint || 'Still loading tree from the network…', false);
        }, 45000);

        try {
            const raced = await Promise.race([
                treeLoadPromise,
                new Promise((resolve) => setTimeout(() => resolve('pending'), BOOT_TREE_SLOW_MS)),
            ]);
            if (raced === 'pending') {
                console.warn('[Arborito] tree load exceeded boot window, still loading');
                hideInitialLoader();
                treeLoadPromise
                    .then((ok) => {
                        if (!ok) queueMicrotask(() => store.maybePromptNoTree());
                    })
                    .catch(() => queueMicrotask(() => store.maybePromptNoTree()));
                return;
            }
            if (!raced) queueMicrotask(() => store.maybePromptNoTree());
            hideInitialLoader();
        } finally {
            clearTimeout(slowHintTimer);
        }
    } finally {
        store._sourceBootFinished = true;
        store._scheduleDeferredProductTourAfterBoot();
        scheduleIdle(() => {
            void store.checkPublishedInactivityAutoRetract?.();
            store.syncCreatorModerationAlertsFromStorage?.();
            void store.refreshCreatorModerationAlerts?.();
        }, 12000);
    }
}

/**
 * GDPR-gated source + tree boot after `initialize()` resolves.
 * @param {import('./store.js').Store} store
 * @param {() => void} clearBootSafetyTimer
 */
export function scheduleStoreSourceBoot(store, clearBootSafetyTimer) {
    store.initialize()
        .then(async () => {
            const scheduleBoot = () => {
                scheduleIdle(() => {
                    void runSourceBoot(store);
                }, 400);
            };
            /** Open relay WebSockets during the wizard so the first Forest/Nostr load is not cold. */
            const prewarmNostrDuringOnboarding = () => {
                if (!hasGdprNetworkConsent()) return;
                scheduleIdle(() => {
                    void warmNostrRelayConnections(store, { probe: true }).catch((e) => {
                        console.warn('[Arborito] onboarding nostr prewarm', e);
                    });
                }, 0);
            };
            if (hasGdprNetworkConsent()) {
                store.update({ loading: false });
                hideInitialLoader();
                if (isOnboardingWizardIncomplete()) {
                    prewarmNostrDuringOnboarding();
                    if (typeof window !== 'undefined') {
                        window.addEventListener('arborito-onboarding-complete', scheduleBoot, {
                            once: true,
                        });
                    }
                } else {
                    await runSourceBoot(store);
                }
            } else {
                /* Local-only / offline: boot must not wait for GDPR network grant. */
                store.update({ loading: false });
                hideInitialLoader();
                const scheduleLocalBoot = () => {
                    scheduleIdle(() => {
                        void runSourceBoot(store);
                    }, 400);
                };
                if (isOnboardingWizardIncomplete()) {
                    scheduleIdle(() => {
                        void ensureAppCoreReady();
                    }, 1200);
                    if (typeof window !== 'undefined') {
                        window.addEventListener('arborito-onboarding-complete', scheduleLocalBoot, {
                            once: true,
                        });
                    }
                } else {
                    scheduleLocalBoot();
                }
                onGdprNetworkConsentGranted(() => {
                    if (isOnboardingWizardIncomplete()) {
                        prewarmNostrDuringOnboarding();
                        return;
                    }
                    if (!store._sourceBootFinished) {
                        scheduleLocalBoot();
                    }
                });
            }
            clearBootSafetyTimer();
        })
        .catch((e) => {
            clearBootSafetyTimer();
            console.error('[Arborito] initialize failed', e);
            hideInitialLoader();
            store.update({ loading: false });
        });
}

/**
 * @param {import('./store.js').Store} store
 */
export function initStoreInstanceFields(store) {
    const bootSafetyTimer = setTimeout(() => {
        if (store.state.treeHydrating) return;
        console.warn('[Arborito] boot safety timeout, dismissing initial loader');
        hideInitialLoader();
        store.update({ loading: false, treeHydrating: false, treeGrowingOverlay: false });
    }, 65000);

    store._sourceManager = null;
    store._forumStore = null;
    store._graphLogic = null;
    store._webtorrent = null;
    store._treeForumHydratedForSourceId = null;
    store._treeForumLoadedPlaces = new Set();
    store._treeForumLoadedThreads = new Set();
    store._treeForumLoadedThreadWeeks = new Map();
    store._nostr = null;
    store._nostrInitPromise = null;
    store._nostrProgressSyncTimer = null;
    store._nostrProgressSyncInFlight = false;
    store._linkedLocalMirrorAutosaveTimer = null;
    store._forumShellSnapshot = null;
    store._networkLoadTicket = 0;
    store._curriculumMountEpoch = 0;
    store._nostrPresenceSession = null;
    store._authSession = null;
    /* Before initialize() decides onboarding step 2, restore persisted login. */
    store._restorePersistedAuthSession?.();
    store._ownedDirectoryRowsCache = null;
    store._treeHydrateStartedAt = 0;
    store._deferredTourScheduled = false;
    store._sourceBootFinished = false;
    store._aiLogic = null;
    store._aiLogicPromise = null;
    store._branchAutosaveTimer = null;
    store._constructionUndoStack = [];
    store._constructionRedoStack = [];
    store._constructionUndoMax = 32;
    store._constructionUndoApplying = false;

    store.syncCreatorModerationAlertsFromStorage?.();
    if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                void store.refreshCreatorModerationAlerts?.();
                store.maybeReconcileNetworkProgressOnResume?.();
            }
        });
    }
    if (typeof window !== 'undefined') {
        window.addEventListener('online', () => {
            store.maybeReconcileNetworkProgressOnResume?.();
        });
    }

    if (hasGdprNetworkConsent()) {
        void warmNostrRelayConnections(store, { probe: true }).catch((e) => {
            console.warn('[Arborito] boot nostr warm', e);
        });
    }

    if (!shouldDeferHeavyBoot()) {
        void ensureAppCoreReady();
    }

    scheduleStoreSourceBoot(store, () => clearTimeout(bootSafetyTimer));

    applyArboritoTheme(store.state.theme === 'dark' ? 'dark' : 'light');
}
