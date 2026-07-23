import { getPanelRef } from '../app/panel-refs.js';
import { shouldShowMobileUI, isDesktopForestShell } from '../shared/ui/breakpoints.js';
import { closeProgressWidgetIfOpenOnStore } from './shell-sage-lifecycle.js';

const MODAL_KEEP_WHEN_MOCHILA = new Set(['game-player', 'onboarding']);

/** @param {import('./shell-store.js').ShellStore | null | undefined} store */
function closeTreeSwitcherIfOpen(store) {
    if (!store || typeof store.closeUnifiedCurriculumSwitcher !== 'function') return;
    const g = store.state?.graphUi;
    if (g?.treeSwitcherOpen) store.closeUnifiedCurriculumSwitcher();
}

/**
 * Close transient shell overlays (mochila, More menu, tree switcher).
 * @param {import('./shell-store.js').ShellStore | null | undefined} store
 * @param {{ except?: Set<string> }} [opts]
 */
export function closeEphemeralShellOverlays(store, opts = {}) {
    if (typeof document === 'undefined') return;
    const except = opts.except || new Set();

    if (!except.has('progress-widget')) {
        closeProgressWidgetIfOpenOnStore(store);
    }
    if (!except.has('mobile-more')) {
        getPanelRef('sidebar')?.closeMobileMenuIfOpen?.();
    }
    if (!except.has('tree-switcher')) {
        closeTreeSwitcherIfOpen(store);
    }
}

/**
 * Before opening a store modal, close competing overlays.
 * @param {import('./shell-store.js').ShellStore} store
 * @param {unknown} modal
 */
export function prepareShellForModalOpen(store, modal) {
    if (!modal || typeof document === 'undefined') return;
    closeProgressWidgetIfOpenOnStore(store);

    const modalObj = typeof modal === 'object' ? modal : null;
    const fromMobileMore = modalObj && modalObj.fromMobileMore;
    if (!fromMobileMore) {
        getPanelRef('sidebar')?.closeMobileMenuIfOpen?.();
    }
    closeTreeSwitcherIfOpen(store);
}

/**
 * Before opening mochila, close competing modals and menus.
 * @param {import('./shell-store.js').ShellStore | null | undefined} store
 */
export function prepareShellForMochilaOpen(store) {
    if (typeof document === 'undefined' || !store) return;

    const m = store.state?.modal;
    const t = m && (typeof m === 'string' ? m : m.type);
    if (t && !MODAL_KEEP_WHEN_MOCHILA.has(t)) {
        store.update({ modal: null });
    }

    getPanelRef('sidebar')?.closeMobileMenuIfOpen?.();
    closeTreeSwitcherIfOpen(store);
}

let _lastMobile = null;
let _lastDesktopForest = null;

/**
 * After viewport breakpoint change, close ephemeral overlays so layers do not stack.
 * @param {import('./shell-store.js').ShellStore | null | undefined} store
 */
export function resetOverlaysIfBreakpointCrossed(store) {
    const mobile = shouldShowMobileUI();
    const desktopForest = isDesktopForestShell();
    const crossed =
        _lastMobile !== null &&
        (_lastMobile !== mobile || _lastDesktopForest !== desktopForest);
    _lastMobile = mobile;
    _lastDesktopForest = desktopForest;
    if (crossed) closeEphemeralShellOverlays(store);
}

/** Seed breakpoint tracking without closing overlays (boot). */
export function initOverlayBreakpointTracking() {
    _lastMobile = shouldShowMobileUI();
    _lastDesktopForest = isDesktopForestShell();
}
