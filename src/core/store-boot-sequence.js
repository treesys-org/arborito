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

function remountDemoIfCanvasEmpty(store) {
    if (!store || store.state.data) return;
    if (
        store.state.treeHydrating &&
        (store._curriculumMountInFlight || store._autoloadMountInFlight || store._ensureDemoMountInFlight)
    ) {
        return;
    }
    void store.ensureMinimumDemoMounted?.();
}

const BOOT_TREE_SLOW_MS = 60000;

function tryOpenSharedCertificate(store) {
    try {
        void import('../features/garden-progress/api/share-certificate.js')
            .then((m) => {
                try {
                    m.consumeCertificateShareParam?.(store);
                } catch {
                    /* ignore */
                }
            })
            .catch(() => {});
    } catch {
        /* ignore */
    }
}

/**
 * @param {import('./store.js').Store} store
 */
async function runSourceBoot(store) {
    if (store._sourceBootStarted) return;
    store._sourceBootStarted = true;
    store.update({ sourceBootInProgress: true });
    try {
        await ensureAppCoreReady();
        store._restorePersistedAuthSession?.();
        store.checkStreak?.();
        /* Diploma share links open immediately — visitors should not wait for onboarding/tree. */
        tryOpenSharedCertificate(store);
        await store.userStore.ensureBranchesHydrated();
        await store.ensureNostrReady();
        let source = null;
        try {
            let bootTimer = 0;
            try {
                source = await Promise.race([
                    store.sourceManager.init(),
                    new Promise((_, reject) => {
                        bootTimer = setTimeout(
                            () => reject(new Error('Source boot timed out')),
                            BOOT_SOURCE_INIT_MS
                        );
                    }),
                ]);
            } finally {
                if (bootTimer) clearTimeout(bootTimer);
            }
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
            remountDemoIfCanvasEmpty(store);
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
            remountDemoIfCanvasEmpty(store);
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
            /*
             * Courses is open after onboarding/sign-in, but tree boot was deferred.
             * Seed the demo behind the modal so closing Courses never leaves empty sky
             * while account autoload catches up.
             */
            remountDemoIfCanvasEmpty(store);
            return;
        }

        /* Empty canvas: force hydrate so soft-open cannot leave a blank sky. */
        const treeLoadPromise = store.loadData(source, !store.state.data);
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
                        if (!ok) {
                            queueMicrotask(() => {
                                remountDemoIfCanvasEmpty(store);
                                store.maybePromptNoTree();
                            });
                        }
                    })
                    .catch(() =>
                        queueMicrotask(() => {
                            remountDemoIfCanvasEmpty(store);
                            store.maybePromptNoTree();
                        })
                    );
                return;
            }
            if (!raced) {
                queueMicrotask(() => {
                    remountDemoIfCanvasEmpty(store);
                    store.maybePromptNoTree();
                });
            }
            else if (source?._openTreeInfoAfterLoad) {
                queueMicrotask(() => {
                    try {
                        const shareKey = String(source?.id || source?.url || '').trim();
                        const lsKey = `arborito-tree-info-opened-from-share:${shareKey || 'unknown'}`;
                        try {
                            if (localStorage.getItem(lsKey) === '1') return;
                            localStorage.setItem(lsKey, '1');
                        } catch {
                            /* ignore localStorage failures */
                        }
                        store.openTreeInfoModal?.({ fromShare: true });
                    } catch {
                        /* ignore */
                    }
                });
            }
            hideInitialLoader();
        } finally {
            clearTimeout(slowHintTimer);
        }
    } catch (e) {
        console.warn('[Arborito] source boot aborted', e);
        hideInitialLoader();
        store.update({ loading: false, treeHydrating: false, treeGrowingOverlay: false });
        remountDemoIfCanvasEmpty(store);
    } finally {
        store._sourceBootFinished = true;
        store.update({ sourceBootInProgress: false });
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
            /** Open relay WebSockets after step-1 Continue (consent), not while the welcome is still open. */
            const prewarmNostrAfterOnboardingConsent = () => {
                if (!hasGdprNetworkConsent()) return;
                if (isOnboardingWizardIncomplete()) return;
                scheduleIdle(() => {
                    void warmNostrRelayConnections(store, { probe: true }).catch((e) => {
                        console.warn('[Arborito] onboarding nostr prewarm', e);
                    });
                }, 0);
            };
            if (hasGdprNetworkConsent()) {
                store.update({ loading: false });
                if (isOnboardingWizardIncomplete()) {
                    /* Welcome must be interactive — dismiss HTML spinner here. */
                    hideInitialLoader();
                    /* Shared diploma first; onboarding resumes when they close it.
                     * Do not warm Nostr here — wait for Continue / account on step 1. */
                    void ensureAppCoreReady().then(() => tryOpenSharedCertificate(store));
                    if (typeof window !== 'undefined') {
                        window.addEventListener('arborito-onboarding-complete', scheduleBoot, {
                            once: true,
                        });
                    }
                } else {
                    /*
                     * Keep the HTML boot spinner until the tree paints. Dismissing early
                     * leaves an empty sky then the green “Cargando árbol…” modal.
                     */
                    await runSourceBoot(store);
                }
            } else {
                /* Local-only / offline: boot must not wait for GDPR network grant. */
                store.update({ loading: false });
                const scheduleLocalBoot = () => {
                    scheduleIdle(() => {
                        void runSourceBoot(store);
                    }, 400);
                };
                if (isOnboardingWizardIncomplete()) {
                    hideInitialLoader();
                    void ensureAppCoreReady().then(() => tryOpenSharedCertificate(store));
                    if (typeof window !== 'undefined') {
                        window.addEventListener('arborito-onboarding-complete', scheduleLocalBoot, {
                            once: true,
                        });
                    }
                } else {
                    /* Same as consent path: hold HTML loader through first tree paint. */
                    await runSourceBoot(store);
                }
                onGdprNetworkConsentGranted(() => {
                    /* Consent during welcome (Continue / Sign in) is warmed by OnboardingModal
                     * via prewarmForestNetworkIndices — do not connect before that tap. */
                    if (isOnboardingWizardIncomplete()) return;
                    prewarmNostrAfterOnboardingConsent();
                    if (!store._sourceBootFinished && !store._sourceBootStarted) {
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
            remountDemoIfCanvasEmpty(store);
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
        remountDemoIfCanvasEmpty(store);
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
                store.maybeRefreshInstalledSourcesOnResume?.();
            }
        });
    }
    if (typeof window !== 'undefined') {
        window.addEventListener('online', () => {
            store.maybeReconcileNetworkProgressOnResume?.();
            store.maybeRefreshInstalledSourcesOnResume?.();
        });
    }

    if (hasGdprNetworkConsent() && !isOnboardingWizardIncomplete()) {
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
