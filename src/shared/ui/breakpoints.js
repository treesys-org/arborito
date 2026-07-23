import { useSyncExternalStore } from 'react';

const BP_MD = 768;

/**
 * True for touch-primary devices (phones) where the shorter viewport dimension
 * is below BP_MD. Stays true in landscape orientation for phones, so the mobile
 * UI is preserved when the user rotates the device.
 *
 * Uses `(any-pointer: coarse)` and a `(hover: none)` + touch fallback because some
 * Android Chrome builds report `(pointer: coarse)` as false even on phones.
 */
const isMobileDevice = () => {
    if (typeof window === 'undefined') return false;
    const shortDim = Math.min(window.innerWidth, window.innerHeight);
    if (shortDim >= BP_MD) return false;

    const pointerCoarse =
        window.matchMedia('(pointer: coarse)').matches ||
        window.matchMedia('(any-pointer: coarse)').matches;
    if (pointerCoarse) return true;

    const noHover = window.matchMedia('(hover: none)').matches;
    const touchPoints =
        typeof navigator !== 'undefined' ? navigator.maxTouchPoints || 0 : 0;
    if (noHover && touchPoints > 0) return true;

    return false;
};

/**
 * Shorter layout edge (CSS `max-width: 767px` is tied to BP_MD − 1).
 * Using the minimum (not just `innerWidth`) avoids using the desktop shell in mobile landscape
 * (e.g. 844×390) because the width is already ≥ md, no iOS or UA sniffing needed.
 */
const shortViewportDim = () => {
    if (typeof window === 'undefined') return BP_MD;
    const vv = window.visualViewport;
    const w = ((vv && vv.width) != null ? vv.width : window.innerWidth);
    const h = ((vv && vv.height) != null ? vv.height : window.innerHeight);
    return Math.min(w, h);
};

/**
 * Compact / mobile shell: touch-primary “phone” or viewport short edge &lt; md.
 * Wide desktop with a mouse uses centered modals, intro card layout, and the forest shell (html.arborito-desktop).
 * Dock remains the same bottom pill as mobile; no left sidebar rail.
 */
export const shouldShowMobileUI = () => {
    if (typeof window === 'undefined') return false;
    return isMobileDevice() || shortViewportDim() < BP_MD;
};

/** Clears immersive mobile game flag (dock visible again); idempotent. */
export function clearArboritoGameImmersiveOpen() {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.remove('arborito-game-immersive-open');
}

/** Wide desktop, non-phone: immersive forest, wide trunk, “fruit” style nav. */
export const isDesktopForestLayout = () =>
    typeof window !== 'undefined' &&
    window.matchMedia('(min-width: 900px)').matches &&
    !isMobileDevice() &&
    shortViewportDim() >= BP_MD;

/** Imperative desktop-forest check (non-React callers). */
export function isDesktopForestShell() {
    return !shouldShowMobileUI() && isDesktopForestLayout();
}

/** Desktop forest shell (header + wide trunk), never infer from stale html classes. */
export function useDesktopForestShell() {
    return isDesktopForestShell();
}

/**
 * `force-mobile` and `arborito-shell-mobile` follow the same rule as `shouldShowMobileUI()`
 * so CSS that only checked `force-mobile` (wide landscape) stays aligned with JS using `shouldShowMobileUI()`.
 */
let _viewportDetectionInitialized = false;
let _applyViewportDetection = null;
let _viewportEpoch = 0;

function isElectronShell() {
    return typeof window !== 'undefined' && !!window.arboritoElectron;
}

function scheduleViewportRelayoutFromBreakpoints() {
    void import('./viewport-relayout.js').then(({ scheduleViewportRelayout }) => {
        scheduleViewportRelayout({
            source: 'breakpoints',
            withLoader: isElectronShell(),
        });
    });
}

function subscribeViewportShell(onStoreChange) {
    if (typeof window === 'undefined') return () => {};
    const handler = () => onStoreChange();
    window.addEventListener('arborito-viewport', handler);
    return () => window.removeEventListener('arborito-viewport', handler);
}

function getViewportShellSnapshot() {
    return _viewportEpoch;
}

/** Reactive mobile/desktop shell flags for React components. */
export function useViewportShell() {
    useSyncExternalStore(subscribeViewportShell, getViewportShellSnapshot, getViewportShellSnapshot);
    return {
        mobile: shouldShowMobileUI(),
        desktopForest: isDesktopForestShell(),
    };
}

export function initMobileDetection() {
    if (_viewportDetectionInitialized) return () => {};
    _viewportDetectionInitialized = true;

    const apply = () => {
        const shell = shouldShowMobileUI();
        const desktop = isDesktopForestLayout();
        const root = document.documentElement;
        root.classList.toggle('force-mobile', shell);
        root.classList.toggle('arborito-shell-mobile', shell);
        root.classList.toggle('arborito-desktop', desktop);
        root.classList.toggle('arborito-electron', isElectronShell());
        _viewportEpoch += 1;
        window.dispatchEvent(new CustomEvent('arborito-viewport'));
    };
    _applyViewportDetection = apply;
    const schedule = () => scheduleViewportRelayoutFromBreakpoints();
    apply();
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', () => {
        setTimeout(scheduleViewportRelayoutFromBreakpoints, isElectronShell() ? 0 : 150);
    });
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', schedule);
        window.visualViewport.addEventListener('scroll', schedule);
    }
    return apply;
}

/** Re-run mobile/desktop shell class toggles (Electron IPC). */
export function reapplyViewportDetection() {
    if (!_applyViewportDetection) return;
    if (isElectronShell()) {
        requestAnimationFrame(() => {
            requestAnimationFrame(_applyViewportDetection);
        });
        return;
    }
    _applyViewportDetection();
}

/**
 * Modal chrome as a “dock” (anchored panel): compact mobile or desktop forest (top bar + visual dock).
 */
export function useDockModalChrome() {
    if (typeof document === 'undefined') return false;
    return shouldShowMobileUI() || document.documentElement.classList.contains('arborito-desktop');
}

/** Desktop forest layout: search lives in the header bar, not a separate modal. */
export function isDesktopForestInlineSearch() {
    if (typeof document === 'undefined') return false;
    return document.documentElement.classList.contains('arborito-desktop') && !shouldShowMobileUI();
}
