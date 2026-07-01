/**
 * Mobile modal chrome tiers (one source of truth for dispatcher + shell classes).
 *
 * - **Dock hub** (Arcade, Foro, Logros…): sheet anchored above the dock pill — dock stays visible.
 * - **Dock takeover** (Perfil, Biblioteca, onboarding…): true edge-to-edge, dock hidden.
 */

/** HUB / FORUM tiers — `renderDockModalShell` family; NOT true fullscreen takeover. */
export const MOBILE_DOCK_HUB_MODAL_TYPES = new Set([
    'arcade',
    'forum',
    'tree-info',
]);

/** Takeover modals — hide dock + `arborito-modal--mobile-fullbleed` on the backdrop. */
export const MOBILE_DOCK_TAKEOVER_MODAL_TYPES = new Set([
    'about',
    'backup',
    'celebration-prefs',
    'dialog',
    'download-app',
    'accessibility-prefs',
    'construction-history',
    'load-warning',
    'onboarding',
    'privacy',
    'profile',
    'security-warning',
    'sources',
]);

/** @deprecated Use MOBILE_DOCK_TAKEOVER_MODAL_TYPES — kept for docs / grep. */
export const MOBILE_FULLBLEED_MODAL_TYPES = MOBILE_DOCK_TAKEOVER_MODAL_TYPES;

/** Fullbleed only while authoring on mobile construction. */
export const CONSTRUCTION_MOBILE_FULLBLEED_MODAL_TYPES = new Set([
    'dialog',
    'pick-curriculum-lang',
    'construction-curriculum-lang',
    'construction-edit-pick',
    'construction-about',
    'contributor',
    'sources',
    'tree-info',
]);

/** @param {{ modal: unknown, viewMode?: string }} state */
function modalType(state) {
    const m = state.modal;
    return typeof m === 'string' ? m : m?.type;
}

/** Logros dashboard (`viewMode === 'certificates'`) — dock hub, not takeover. */
export function isMobileCertificatesHubOpen(state, mobUi) {
    return !!mobUi && state.viewMode === 'certificates';
}

/** Arcade / Foro / tree-info / Logros hub — sheet above dock. */
export function isMobileDockHubOpen(state, mobUi) {
    if (!mobUi) return false;
    if (isMobileCertificatesHubOpen(state, mobUi)) return true;
    const t = modalType(state);
    return !!(t && MOBILE_DOCK_HUB_MODAL_TYPES.has(t));
}

/** `rootFlags` on dock hub sheets (Search, Arcade, Foro, Logros…) — mobile uses `layout="dock-bottom"`. */
export const MOBILE_DOCK_SHEET_ROOT_FLAG_RE =
    /\barborito-modal--(?:arcade|forum|certificates-hub|search|tree-info)\b|\barborito-search-dock\b/u;

export function isMobileDockSheetRootFlags(rootFlags) {
    return MOBILE_DOCK_SHEET_ROOT_FLAG_RE.test(String(rootFlags || ''));
}

/**
 * Hub dock sheets on mobile: anchor top→dock gap (same as Search), not full-viewport `dock` + 100dvh.
 * Takeover modals (profile, sources, …) keep `layout="dock"` for fullbleed.
 */
export function resolveMobileDockHubLayout(mobile, layout, rootFlags) {
    const base = layout ?? 'dock';
    if (!mobile || base !== 'dock') return base;
    return isMobileDockSheetRootFlags(rootFlags) ? 'dock-bottom' : base;
}

/**
 * Perfil, Biblioteca, onboarding… — hides dock (`arborito-fullbleed-sheet-open` on `<html>`).
 *
 * @param {{ modal: unknown, viewMode?: string }} state
 * @param {boolean} mobUi
 */
export function isMobileDockTakeover(state, mobUi) {
    if (!mobUi || typeof document === 'undefined') return false;
    const t = modalType(state);
    const root = document.documentElement;
    const constructionMobile =
        root.classList.contains('arborito-construction-mobile') &&
        !root.classList.contains('arborito-desktop');
    const fullBleedInConstruction =
        constructionMobile && t && CONSTRUCTION_MOBILE_FULLBLEED_MODAL_TYPES.has(t);
    return !!(t && MOBILE_DOCK_TAKEOVER_MODAL_TYPES.has(t)) || fullBleedInConstruction;
}

/** Backdrop `arborito-modal--mobile-fullbleed` (bottom: 0) — takeover only. */
export function isMobileBackdropFullbleed(state, mobUi) {
    return isMobileDockTakeover(state, mobUi);
}

/** @deprecated Alias — use isMobileBackdropFullbleed or isMobileDockTakeover explicitly. */
export function isMobileFullbleedSheetOpen(state, mobUi) {
    return isMobileDockTakeover(state, mobUi);
}
