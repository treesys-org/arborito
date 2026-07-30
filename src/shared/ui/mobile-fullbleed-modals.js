/**
 * Mobile modal chrome tiers (one source of truth for dispatcher + shell classes).
 *
 * - **Dock hub** (Arcade, Foro, Logros…): sheet anchored above the dock pill, dock stays visible.
 * - **Dock takeover** (Biblioteca, onboarding, Dialog confirms, nested fromOnboarding…): true edge-to-edge, dock hidden.
 * - **Perfil / Acerca de / Buscar / Descargar** (normal open): dock-gap sheet, dock stays visible.
 * - **Mochila / Cambiar**: consolidated shells but fullbleed (dock hidden, sheet to bottom).
 */

import { CONSTRUCTION_DOCK_HUB_MODAL_TYPES } from '../../features/editor/api/construction-hub-chrome.js';

export { CONSTRUCTION_DOCK_HUB_MODAL_TYPES };

/** HUB tier (`dock-hub`), `renderDockModalShell` family; NOT true fullscreen takeover. */
export const MOBILE_DOCK_HUB_MODAL_TYPES = new Set([
    'arcade',
    'forum',
    'tree-info',
]);

/** Takeover modals, hide dock + `arborito-modal--mobile-fullbleed` on the backdrop. */
export const MOBILE_DOCK_TAKEOVER_MODAL_TYPES = new Set([
    'arborito-support',
    'load-warning',
    'onboarding',
    'privacy',
    'security-warning',
    'sources',
    /* Viewport confirms (Continue without account…): cover the dock, no dock-gap strip. */
    'dialog',
]);

/** Fullbleed only while authoring on mobile construction (pickers, not dock hubs / sign-in sheets). */
export const CONSTRUCTION_MOBILE_FULLBLEED_MODAL_TYPES = new Set([
    'pick-curriculum-lang',
    'sources',
    'export-pdf',
]);

/** @param {{ modal: unknown, viewMode?: string }} state */
function modalType(state) {
    const m = state?.modal;
    return typeof m === 'string' ? m : m?.type;
}

/** Logros dashboard (`viewMode === 'certificates'`), dock hub, not takeover.
 * Diploma viewer (`modal.type === 'certificate'`) must leave the hub so ModalHost can mount. */
export function isMobileCertificatesHubOpen(state, mobUi) {
    if (!mobUi || state?.viewMode !== 'certificates') return false;
    const t = typeof state?.modal === 'string' ? state.modal : state?.modal?.type;
    if (t === 'certificate') return false;
    return true;
}

/** Arcade / Foro / tree-info / Logros hub, sheet above dock. */
export function isMobileDockHubOpen(state, mobUi) {
    if (!mobUi) return false;
    if (isMobileCertificatesHubOpen(state, mobUi)) return true;
    const t = modalType(state);
    return !!(t && MOBILE_DOCK_HUB_MODAL_TYPES.has(t));
}

/** Construction dock hubs (history, publish, team, language), sheet above construction dock. */
export function isMobileConstructionDockHubOpen(state, mobUi) {
    if (!mobUi || typeof document === 'undefined') return false;
    const root = document.documentElement;
    if (!root.classList.contains('arborito-construction-mobile')) {
        return false;
    }
    const t = modalType(state);
    return !!(t && CONSTRUCTION_DOCK_HUB_MODAL_TYPES.has(t));
}

/** `rootFlags` on dock hub sheets, mobile uses `layout="dock-bottom"`. */
export const MOBILE_DOCK_SHEET_ROOT_FLAG_RE =
    /\barborito-modal--(?:arcade|forum|certificates-hub|search|tree-info|node-properties|construction-dock-hub|profile|backup|about|language|download-app|preview|celebration-prefs|accessibility-prefs)\b|\barborito-search-dock\b/u;

export function isMobileDockSheetRootFlags(rootFlags) {
    return MOBILE_DOCK_SHEET_ROOT_FLAG_RE.test(String(rootFlags || ''));
}

/**
 * Hub dock sheets on mobile: anchor top→dock gap (same as Search), not full-viewport `dock` + 100dvh.
 * Takeover modals (biblioteca, onboarding…): hide dock + `arborito-modal--mobile-fullbleed` on the backdrop.
 * Perfil / Buscar use the dock-gap sheet. Mochila / Cambiar are fullbleed (dock hidden).
 */
export function resolveMobileDockHubLayout(mobile, layout, rootFlags) {
    const base = layout ?? 'dock';
    if (!mobile || base !== 'dock') return base;
    return isMobileDockSheetRootFlags(rootFlags) ? 'dock-bottom' : base;
}

/**
 * Dock-gap sheets that must become takeovers when nested from first-run welcome
 * (Accesibilidad / App…). Do NOT include compact dialogs (account-recovery, QR…).
 */
export const FROM_ONBOARDING_DOCK_GAP_TAKEOVER_TYPES = new Set([
    'accessibility-prefs',
    'download-app',
    'celebration-prefs',
    'language',
    'about',
    'backup',
    'profile',
    'search',
    'preview',
    'node-properties',
]);

/** @param {unknown} modal */
export function isFromOnboardingDockGapTakeover(modal) {
    if (!modal || typeof modal !== 'object' || !modal.fromOnboarding) return false;
    const t = typeof modal.type === 'string' ? modal.type : null;
    return !!(t && FROM_ONBOARDING_DOCK_GAP_TAKEOVER_TYPES.has(t));
}

/**
 * Biblioteca, onboarding…, hides dock (`arborito-fullbleed-sheet-open` on `<html>`).
 *
 * @param {{ modal: unknown, viewMode?: string }} state
 * @param {boolean} mobUi
 */
export function isMobileDockTakeover(state, mobUi) {
    if (!mobUi || typeof document === 'undefined') return false;
    const m = state?.modal;
    /* Nested dock-gap prefs from welcome: cover the dock. Compact auth dialogs keep their own chrome. */
    if (isFromOnboardingDockGapTakeover(m)) {
        return true;
    }
    const t = modalType(state);
    const root = document.documentElement;
    const constructionMobile =
        root.classList.contains('arborito-construction-mobile') &&
        !root.classList.contains('arborito-desktop');
    const fullBleedInConstruction =
        constructionMobile && t && CONSTRUCTION_MOBILE_FULLBLEED_MODAL_TYPES.has(t);
    return !!(t && MOBILE_DOCK_TAKEOVER_MODAL_TYPES.has(t)) || fullBleedInConstruction;
}
