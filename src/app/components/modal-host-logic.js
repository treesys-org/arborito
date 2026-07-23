import { MODAL_EXPORT_NAMES, EAGER_MODAL_TYPES } from '../modal-chunk-loaders.js';
import { shouldShowMobileUI } from '../../shared/ui/breakpoints.js';
import { isMobileDockTakeover, CONSTRUCTION_DOCK_HUB_MODAL_TYPES } from '../../shared/ui/mobile-fullbleed-modals.js';
import {
    resolveModalSurface,
} from '../modal-surface-routing.js';

/** Sub-modals opened from Profile: keep profile mounted underneath. */
export const PROFILE_STACK_CHILD_TYPES = new Set(['backup', 'privacy', 'sync-login-qr-scanner', 'account-recovery', 'change-password']);

const DIALOG_LIKE_MODAL_TYPES = new Set(['dialog', 'sync-login-qr-scanner', 'account-recovery', 'change-password']);

let _dialogSessionCounter = 0;

export function dialogModalContentKey(modal) {
    if (!modal || typeof modal !== 'object') return '';
    if (modal._dialogSessionId) return String(modal._dialogSessionId);
    _dialogSessionCounter += 1;
    modal._dialogSessionId = _dialogSessionCounter;
    return String(modal._dialogSessionId);
}

export function computeModalRouteKey(modal, previewNode) {
    if (previewNode) return `preview-${previewNode.id}`;
    if (!modal) return '';
    const type = modal.type || modal;
    const modalRef = typeof modal === 'object' && modal ? modal : {};
    const focusSuffix = typeof modal === 'object' && modal?.focus ? `-${modal.focus}` : '';
    const fromConstructionMoreSuffix =
        typeof modal === 'object' && modal?.fromConstructionMore ? '-cm' : '';
    const fromSourcesSuffix = typeof modal === 'object' && modal?.fromSources ? '-src' : '';
    const fromProfileSuffix = typeof modal === 'object' && modal?.fromProfile ? '-pf' : '';
    const viewModeSuffix = typeof modal === 'object' && modal?.viewMode ? `-${modal.viewMode}` : '';
    const aboutTabSuffix =
        type === 'about' && typeof modal === 'object' && modal?.tab ? `-${modal.tab}` : '';
    return `${type}-${modalRef.node?.id || modalRef.url || ''}${focusSuffix}${fromConstructionMoreSuffix}${fromSourcesSuffix}${fromProfileSuffix}${viewModeSuffix}${aboutTabSuffix}`;
}

/**
 * @param {{ modal: unknown, viewMode?: string, previewNode?: unknown, ui?: Record<string, string> }} state
 * @returns {{
 *   kind: 'none' | 'search-redirect' | 'lazy' | 'eager' | 'profile-stack' | 'unknown',
 *   type?: string,
 *   childType?: string,
 *   suspenseKey?: string,
 *   chunkType?: string,
 * }}
 */
export function resolveModalRoute(state) {
    const { modal, viewMode, previewNode } = state;
    const mobUi = shouldShowMobileUI();
    const surface = resolveModalSurface(state, mobUi);

    if (surface === 'sage' || surface === 'browse-dock-hub' || surface === 'construction-dock-hub') {
        return { kind: 'none' };
    }

    if (surface === 'search-redirect') {
        return { kind: 'search-redirect' };
    }

    if (viewMode === 'certificates' && modal?.type !== 'certificate') {
        return {
            kind: 'lazy',
            type: 'certificates',
            chunkType: 'certificates',
            suspenseKey: 'certificates',
        };
    }

    if (!modal && !previewNode) {
        return { kind: 'none' };
    }

    if (previewNode) {
        return {
            kind: 'eager',
            type: 'preview',
            chunkType: 'preview',
            suspenseKey: `preview-${previewNode.id}`,
        };
    }

    const type = modal.type || modal;
    const modalRef = typeof modal === 'object' && modal ? modal : {};
    const routeKey = computeModalRouteKey(modal, null);

    if (type === 'dialog' && typeof modal === 'object') {
        const dialogKey = dialogModalContentKey(modal);
        return {
            kind: 'eager',
            type: 'dialog',
            chunkType: 'dialog',
            suspenseKey: `dialog-${dialogKey}`,
        };
    }

    if (PROFILE_STACK_CHILD_TYPES.has(type) && modalRef.fromProfile) {
        return {
            kind: 'profile-stack',
            childType: type,
            chunkType: type,
            suspenseKey: routeKey,
        };
    }

    if (type === 'publish-diff') {
        return { kind: 'eager', type: 'construction-about', suspenseKey: routeKey };
    }

    if (type === 'onboarding' || EAGER_MODAL_TYPES.has(type)) {
        return { kind: 'eager', type, suspenseKey: routeKey };
    }

    if (MODAL_EXPORT_NAMES[type]) {
        return { kind: 'lazy', type, chunkType: type, suspenseKey: routeKey };
    }

    return { kind: 'unknown', type: String(type), suspenseKey: routeKey };
}

/** @param {HTMLElement | null} backdrop */
export function syncModalBackdropClasses(backdrop, state) {
    if (!backdrop || !backdrop.classList.contains('arborito-modal-root')) return;
    const mobUi = shouldShowMobileUI();
    const m = state.modal;
    const t = typeof m === 'string' ? m : m?.type;
    const fromProfile = m && typeof m === 'object' && m.fromProfile;
    backdrop.classList.toggle('arborito-modal--mobile', mobUi);
    backdrop.classList.toggle('arborito-modal--search', t === 'search');
    backdrop.classList.toggle('arborito-modal--arcade', t === 'arcade');
    backdrop.classList.toggle('arborito-modal--forum', t === 'forum');
    backdrop.classList.toggle(
        'arborito-modal--profile',
        t === 'profile' || (fromProfile && PROFILE_STACK_CHILD_TYPES.has(t))
    );
    backdrop.classList.toggle('arborito-modal--dialog', DIALOG_LIKE_MODAL_TYPES.has(t));
    backdrop.classList.toggle('arborito-modal--backup', t === 'backup');
    backdrop.classList.toggle('arborito-modal--certificates-hub', state.viewMode === 'certificates');
    backdrop.classList.toggle(
        'arborito-modal--construction-dock-hub',
        !!(t && CONSTRUCTION_DOCK_HUB_MODAL_TYPES.has(t)),
    );
    backdrop.classList.toggle('arborito-modal--immersive', t === 'game-player');
    backdrop.classList.toggle('arborito-modal--onboarding', t === 'onboarding');
    backdrop.classList.toggle('arborito-modal--sources', t === 'sources');
    backdrop.classList.toggle('arborito-modal--mobile-fullbleed', isMobileDockTakeover(state, mobUi));
}

export function handleModalEscapeKey(state, store) {
    if (state.modal) {
        const type = state.modal?.type || state.modal;
        if (type === 'dialog') {
            store.closeDialog(null);
            return true;
        }
        if (type === 'onboarding') return true;
        if (type === 'sources' && store.isSourcesDismissBlocked()) {
            const ui = store.ui;
            store.notify(ui.sourcesDismissNeedTree || 'Add or load a tree before closing.', true);
            return true;
        }
        store.dismissModal();
        return true;
    }
    if (state.viewMode === 'certificates') {
        store.leaveCertificatesView();
        return true;
    }
    return false;
}

export function handleFocusTrapEscape(store) {
    const state = store.value;
    const cur = state.modal;
    const mt = cur?.type || cur;
    if (mt === 'dialog') {
        store.closeDialog(null);
        return;
    }
    if (mt === 'onboarding') return;
    if (mt === 'sources' && store.isSourcesDismissBlocked()) return;
    if (state.viewMode === 'certificates' && mt !== 'certificate') {
        store.leaveCertificatesView();
        return;
    }
    store.dismissModal();
}

export function handleBackdropEmptyTap(store) {
    const state = store.value;
    const cur = state.modal;
    const mt = cur?.type || cur;
    if (mt === 'dialog') {
        store.closeDialog(null);
        return;
    }
    if (mt === 'onboarding') return;
    if (mt === 'sources' && store.isSourcesDismissBlocked()) {
        const ui = store.ui;
        store.notify(ui.sourcesDismissNeedTree || 'Add or load a tree before closing.', true);
        return;
    }
    if (state.viewMode === 'certificates' && mt !== 'certificate') {
        store.leaveCertificatesView();
        return;
    }
    store.dismissModal();
}
