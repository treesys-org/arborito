/**
 * Single idle coordinator for non-critical shell modules (one schedule, no nested defer).
 */
import { getArboritoStore as store } from './core/store-singleton.js';
import { prefetchSecondaryServices } from './core/bootstrap.js';
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

let shellLazyStarted = false;

export { ensureDeferredConstructionStyles } from './shared/lib/lazy-stylesheet.js';

function preloadProductTour() {
    void import('./features/tour/components/ProductTour.jsx');
}

/** Wake sage panel after its module loads. */
export function preloadSageModal() {
    if (typeof window === 'undefined') return Promise.resolve();
    const done = () => {
        const el = getPanelRef('sage');
        if (el && typeof el.checkState === 'function') el.checkState();
    };
    return import('./features/learning/modals/SageOverlay.jsx').then(done);
}

/** TreePresentation lives in the publish hub modal — clear legacy mobile clearance. */
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
        preloadProductTour();
        void preloadConstructionPanel();
    };

    const runIdlePrefetch = () => {
        void import('./features/learning/modals/SageOverlay.jsx');
        void import('./features/garden-progress/components/ProgressWidget.jsx');
        void import('./features/tree-graph/components/TreeGrowingOverlay.jsx');
        void import('./app/components/ToastStack.jsx');
        void import('./app/components/ModalOverlayHost.jsx');
        void import('./features/garden-progress/api/garden-background.js').then(({ syncGardenBackground, getGardenBackgroundState }) => {
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
        });
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
