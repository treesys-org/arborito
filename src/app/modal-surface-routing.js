import { isDesktopForestInlineSearch, shouldShowMobileUI } from '../shared/ui/breakpoints.js';
import {
    MOBILE_DOCK_HUB_MODAL_TYPES,
    isMobileCertificatesHubOpen,
} from '../shared/ui/mobile-fullbleed-modals.js';

export const BROWSE_DOCK_HUB_BACKDROP_ID = 'browse-dock-hub-backdrop';
export const BROWSE_DOCK_HUB_SHEET_ID = 'browse-dock-hub-sheet';

export const CONSTRUCTION_DOCK_HUB_MODAL_TYPES = new Set([
    'construction-history',
    'construction-about',
    'construction-curriculum-lang',
    'construction-edit-pick',
    'contributor',
]);

/** @typedef {'none' | 'modal-host' | 'browse-dock-hub' | 'construction-dock-hub' | 'sage' | 'search-redirect'} ModalSurface */

function modalType(state) {
    const m = state?.modal;
    if (!m) return null;
    return typeof m === 'string' ? m : m?.type ?? null;
}

function isConstructionDockPanel() {
    if (typeof document === 'undefined') return false;
    return document.documentElement.classList.contains('arborito-construction-mobile');
}

function isBrowseMobilePanel(mobUi) {
    if (!mobUi || typeof document === 'undefined') return false;
    if (isConstructionDockPanel()) return false;
    return true;
}

/** Mobile browse: render dock-tab hubs inside sidebar (search, arcade, forum, logros…). */
export function shouldRenderBrowseDockHubInPanel(state, mobUi) {
    if (!isBrowseMobilePanel(mobUi)) return false;

    if (isMobileCertificatesHubOpen(state, mobUi)) return true;

    const m = state?.modal;
    if (!m) return false;
    const t = modalType(state);
    if (!t || t === 'certificate') return false;
    if (typeof m === 'object' && m.fromMobileMore) return false;
    if (typeof m === 'object' && m.fromConstructionMore) return false;

    if (t === 'search' || t === 'arcade') {
        return !!(typeof m === 'object' && m.dockUi);
    }

    return !!(t && MOBILE_DOCK_HUB_MODAL_TYPES.has(t));
}

/** Construction mode: dock sheets in construction panel (mobile only; desktop uses ModalHost). */
export function shouldRenderConstructionDockHubInPanel(state) {
    if (!shouldShowMobileUI() || !state?.modal || !isConstructionDockPanel()) return false;
    const t = modalType(state);
    return !!(t && CONSTRUCTION_DOCK_HUB_MODAL_TYPES.has(t));
}

export function resolveBrowseDockHubChunkType(state, mobUi) {
    if (isMobileCertificatesHubOpen(state, mobUi)) return 'certificates';
    const m = state?.modal;
    if (!m) return null;
    return typeof m === 'string' ? m : m.type;
}

export function resolveConstructionDockHubChunkType(state) {
    const m = state?.modal;
    if (!m || typeof m !== 'object') return null;
    return m.type ?? null;
}

/**
 * Canonical surface for a modal given shell state.
 * @param {{ modal: unknown, viewMode?: string, previewNode?: unknown }} state
 * @param {boolean} [mobUi]
 * @returns {ModalSurface}
 */
export function resolveModalSurface(state, mobUi = false) {
    const { modal, previewNode } = state || {};

    if (modal && (modal === 'sage' || modal.type === 'sage')) {
        return 'sage';
    }

    if (shouldRenderConstructionDockHubInPanel(state)) {
        return 'construction-dock-hub';
    }

    if (shouldRenderBrowseDockHubInPanel(state, mobUi)) {
        return 'browse-dock-hub';
    }

    const type = modalType(state);
    if (type === 'search' && isDesktopForestInlineSearch()) {
        return 'search-redirect';
    }

    if (!modal && !previewNode && state?.viewMode !== 'certificates') {
        return 'none';
    }

    return 'modal-host';
}

/** Whether ModalHost should render modal content (inverse of dock-hub surfaces). */
export function isModalHostSurface(surface) {
    return surface === 'modal-host';
}
