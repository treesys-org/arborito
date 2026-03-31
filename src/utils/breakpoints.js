export const BP_SM = 640;
export const BP_MD = 768;
export const BP_LG = 1024;

export const matchesSm = () => window.matchMedia(`(min-width: ${BP_SM}px)`).matches;
export const matchesMd = () => window.matchMedia(`(min-width: ${BP_MD}px)`).matches;
export const matchesLg = () => window.matchMedia(`(min-width: ${BP_LG}px)`).matches;

/**
 * True for touch-primary devices (phones) where the shorter viewport dimension
 * is below BP_MD. Stays true in landscape orientation for phones, so the mobile
 * UI is preserved when the user rotates the device.
 */
export const isMobileDevice = () => {
    const isTouch = window.matchMedia('(pointer: coarse)').matches;
    const shortDim = Math.min(window.innerWidth, window.innerHeight);
    return isTouch && shortDim < BP_MD;
};

/**
 * Compact / mobile shell: touch-primary phones, or viewports below md.
 * Wide desktop with a mouse uses centered modals, intro card layout, and the forest shell (html.arborito-desktop).
 * Dock remains the same bottom pill as mobile; no left sidebar rail.
 */
export const shouldShowMobileUI = () => {
    if (typeof window === 'undefined') return false;
    return isMobileDevice() || window.innerWidth < BP_MD;
};

/** Quita el flag de juego inmersivo en móvil (dock visible de nuevo); idempotente. */
export function clearArboritoGameImmersiveOpen() {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.remove('arborito-game-immersive-open');
}

/** Escritorio ancho y no-phone: bosque inmersivo, tronco amplio, nav tipo “frutos”. */
const isDesktopForestLayout = () =>
    typeof window !== 'undefined' &&
    window.matchMedia('(min-width: 900px)').matches &&
    !isMobileDevice();

export function onBreakpointChange(bp, callback) {
    const mq = window.matchMedia(`(min-width: ${bp}px)`);
    mq.addEventListener('change', callback);
    return () => mq.removeEventListener('change', callback);
}

/**
 * Keeps a `force-mobile` class on <html> in sync with isMobileDevice().
 * Components and CSS can use this class to override md: breakpoints for
 * phones in landscape orientation.
 */
let _viewportDetectionInitialized = false;

export function initMobileDetection() {
    if (_viewportDetectionInitialized) return () => {};
    _viewportDetectionInitialized = true;

    const update = () => {
        document.documentElement.classList.toggle('force-mobile', isMobileDevice());
        document.documentElement.classList.toggle('arborito-shell-mobile', shouldShowMobileUI());
        document.documentElement.classList.toggle('arborito-desktop', isDesktopForestLayout());
        window.dispatchEvent(new CustomEvent('arborito-viewport'));
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', () => setTimeout(update, 150));
    return update;
}

/**
 * Modal chrome tipo “dock” (panel anclado): móvil compacto o escritorio bosque (barra superior + dock visual).
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
