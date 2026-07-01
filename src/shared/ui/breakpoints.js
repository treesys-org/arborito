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
 * (e.g. 844×390) because the width is already ≥ md — no iOS or UA sniffing needed.
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

/** Desktop forest shell (header + wide trunk) — never infer from stale html classes. */
export function useDesktopForestShell() {
    return !shouldShowMobileUI() && isDesktopForestLayout();
}

/**
 * `force-mobile` and `arborito-shell-mobile` follow the same rule as `shouldShowMobileUI()`
 * so CSS that only checked `force-mobile` (wide landscape) stays aligned with JS using `shouldShowMobileUI()`.
 */
let _viewportDetectionInitialized = false;

function isElectronShell() {
    return typeof window !== 'undefined' && !!window.arboritoElectron;
}

export function initMobileDetection() {
    if (_viewportDetectionInitialized) return () => {};
    _viewportDetectionInitialized = true;

    let debounceTimer = null;
    const apply = () => {
        const shell = shouldShowMobileUI();
        /* `arborito-desktop` means the wide FOREST layout (≥900px), NOT merely
         * "not mobile". A large amount of construction CSS is scoped with
         * `:not(.arborito-desktop)` to supply the compact construction layout,
         * so forcing this class on at mid widths (768–899px) strips that layout
         * and leaves construction as a bare dark blueprint. The graph staying
         * visible across every width is handled by the (ungated) width:0 collapse
         * rules in app-flex-and-pointer-hosts.css, which now match both the legacy
         * custom-element hosts and the migrated `[data-arborito-panel]` hosts — so
         * the desktop class can stay forest-only without reintroducing a dead zone. */
        const desktop = isDesktopForestLayout();
        const root = document.documentElement;
        root.classList.toggle('force-mobile', shell);
        root.classList.toggle('arborito-shell-mobile', shell);
        root.classList.toggle('arborito-desktop', desktop);
        root.classList.toggle('arborito-electron', isElectronShell());
        window.dispatchEvent(new CustomEvent('arborito-viewport'));
    };
    const schedule = () => {
        if (isElectronShell()) {
            apply();
            return;
        }
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(apply, 120);
    };
    apply();
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', () => setTimeout(apply, isElectronShell() ? 0 : 150));
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', schedule);
        window.visualViewport.addEventListener('scroll', schedule);
    }
    return apply;
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
