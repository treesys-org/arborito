/**
 * Single idle coordinator for non-critical shell modules (one schedule, no nested defer).
 */
import { getArboritoStore as store } from './core/store-singleton.js';
import { prefetchSecondaryServices } from './core/store-lazy-modules.js';
import {
    ensureDeferredConstructionStyles,
    SHELL_BOOT_STYLESHEET_ENTRIES,
    ensureLazyStylesheet,
} from './shared/lib/lazy-stylesheet.js';
import { runAfterPaint, scheduleIdle } from './shared/lib/yield-to-paint.js';
import { isFirstVisitOnboarding, isOnboardingWizardIncomplete } from './shared/lib/onboarding-boot-gate.js';
import { onGdprNetworkConsentGranted } from './shared/lib/connected-services/index.js';
import { syncTreePresentationSlot } from './features/tree-graph/api/graph-panel-api.js';
import { getPanelRef } from './app/panel-refs.js';
import {
    syncGardenBackground,
    getGardenBackgroundState,
} from './features/garden-progress/api/garden-background.js';

let shellLazyStarted = false;

export { ensureDeferredConstructionStyles } from './shared/lib/lazy-stylesheet.js';

/** Wake sage panel after its module loads. */
export async function preloadSageModal() {
    if (typeof window === 'undefined') return;
    const nudge = () => {
        const el = getPanelRef('sage');
        if (el && typeof el.checkState === 'function') el.checkState();
    };
    nudge();
    if (!getPanelRef('sage')) {
        // OverlayShell mounts Sage eagerly; wait for React to register the panel ref.
        await new Promise((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(resolve));
        });
        nudge();
    }
}

/** TreePresentation lives in the publish hub modal, clear legacy mobile clearance. */
export async function mountTreePresentationElement() {
    syncTreePresentationSlot();
}

/** Load construction panel; sync when ready. */
let constructionPanelPromise = null;

export function preloadConstructionPanel() {
    if (constructionPanelPromise) return constructionPanelPromise;
    ensureDeferredConstructionStyles();
    constructionPanelPromise = Promise.all([
        import('./features/editor/components/ConstructionPanel.jsx'),
        import('./features/tree-graph/components/TreePresentation.jsx'),
    ])
        .then(() => {
            getPanelRef('construction-panel')?.syncConstructionFromStore?.();
            return mountTreePresentationElement();
        })
        .catch((err) => {
            constructionPanelPromise = null;
            throw err;
        });
    return constructionPanelPromise;
}

/** Hover / intent on the construction nav control. */
export function prefetchConstructionOnIntent() {
    void preloadConstructionPanel();
}

export function scheduleDeferredShellComponents() {
    if (shellLazyStarted || typeof window === 'undefined') return;
    shellLazyStarted = true;

    const runPaintDeferred = () => {
        for (const [id] of SHELL_BOOT_STYLESHEET_ENTRIES) {
            ensureLazyStylesheet(id);
        }
        void preloadConstructionPanel();
    };

    const runIdlePrefetch = () => {
        void import('./features/garden-progress/components/ProgressWidget.jsx');
        let lastGardenSig = '';
        const onGardenMaybeSync = () => {
            const { visible } = getGardenBackgroundState(store);
            const sig = `${visible ? 1 : 0}|${store.state.constructionMode ? 1 : 0}|${store.state.data?.id ?? ''}`;
            if (sig === lastGardenSig) return;
            lastGardenSig = sig;
            syncGardenBackground(store);
        };
        onGardenMaybeSync();
        store.addEventListener('state-change', onGardenMaybeSync);
        void preloadSageModal();
        prefetchSecondaryServices();
    };

    if (isFirstVisitOnboarding()) {
        onGdprNetworkConsentGranted(() => {
            const runAfterWizard = () => {
                scheduleIdle(runPaintDeferred, 600);
                scheduleIdle(runIdlePrefetch, 1500);
            };
            if (isOnboardingWizardIncomplete() && typeof window !== 'undefined') {
                window.addEventListener('arborito-onboarding-complete', runAfterWizard, { once: true });
            } else {
                runAfterWizard();
            }
        });
    } else {
        runAfterPaint(() => {
            runPaintDeferred();
            scheduleIdle(runIdlePrefetch, 120);
        });
    }
}
