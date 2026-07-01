import { MODAL_EXPORT_NAMES, EAGER_MODAL_TYPES } from '../modal-chunk-loaders.js';
import { isDesktopForestInlineSearch } from '../../shared/ui/breakpoints.js';
import { isMobileBackdropFullbleed } from '../../shared/ui/mobile-fullbleed-modals.js';
import { shouldShowMobileUI } from '../../shared/ui/breakpoints.js';

/** Sub-modals opened from Profile: keep profile mounted underneath. */
export const PROFILE_STACK_CHILD_TYPES = new Set(['backup', 'privacy', 'sync-login-qr-scanner']);

export function dialogModalContentKey(modal) {
    if (!modal || typeof modal !== 'object') return '';
    try {
        const snaps = modal.exportSnapshots;
        const snapIds = Array.isArray(snaps) ? snaps.map((r) => (r && r.id) || '').join('\n') : '';
        return JSON.stringify({
            dialogType: modal.dialogType,
            title: modal.title,
            body: modal.body,
            bodyHtml: !!modal.bodyHtml,
            placeholder: modal.placeholder,
            confirmText: modal.confirmText,
            cancelText: modal.cancelText,
            danger: !!modal.danger,
            choices: modal.choices,
            exportSnapshotIds: snapIds,
            dialogIcon: modal.dialogIcon,
        });
    } catch {
        return `err-${Date.now()}`;
    }
}

export function computeModalRouteKey(modal, previewNode) {
    if (previewNode) return `preview-${previewNode.id}`;
    if (!modal) return '';
    const type = modal.type || modal;
    const modalRef = typeof modal === 'object' && modal ? modal : {};
    const focusSuffix = typeof modal === 'object' && modal?.focus ? `-${modal.focus}` : '';
    const fromMoreSuffix = typeof modal === 'object' && modal?.fromMobileMore ? '-mm' : '';
    const fromConstructionMoreSuffix =
        typeof modal === 'object' && modal?.fromConstructionMore ? '-cm' : '';
    const fromSourcesSuffix = typeof modal === 'object' && modal?.fromSources ? '-src' : '';
    const fromProfileSuffix = typeof modal === 'object' && modal?.fromProfile ? '-pf' : '';
    const viewModeSuffix = typeof modal === 'object' && modal?.viewMode ? `-${modal.viewMode}` : '';
    const aboutTabSuffix =
        type === 'about' && typeof modal === 'object' && modal?.tab ? `-${modal.tab}` : '';
    return `${type}-${modalRef.node?.id || modalRef.url || ''}${focusSuffix}${fromMoreSuffix}${fromConstructionMoreSuffix}${fromSourcesSuffix}${fromProfileSuffix}${viewModeSuffix}${aboutTabSuffix}`;
}

/**
 * @param {{ modal: unknown, viewMode?: string, previewNode?: unknown, ui?: Record<string, string> }} state
 * @returns {{
 *   kind: 'none' | 'search-redirect' | 'lazy' | 'eager' | 'profile-stack' | 'contributor' | 'unknown',
 *   type?: string,
 *   childType?: string,
 *   suspenseKey?: string,
 *   chunkType?: string,
 * }}
 */
export function resolveModalRoute(state) {
    const { modal, viewMode, previewNode } = state;

    if (modal && (modal === 'sage' || modal.type === 'sage')) {
        return { kind: 'none' };
    }

    if (viewMode === 'certificates' && modal?.type !== 'certificate') {
        return { kind: 'eager', type: 'certificates', suspenseKey: 'certificates' };
    }

    if (!modal && !previewNode) {
        return { kind: 'none' };
    }

    if (previewNode) {
        return {
            kind: 'lazy',
            type: 'preview',
            chunkType: 'preview',
            suspenseKey: `preview-${previewNode.id}`,
        };
    }

    const type = modal.type || modal;
    const modalRef = typeof modal === 'object' && modal ? modal : {};
    const routeKey = computeModalRouteKey(modal, null);

    if (type === 'search' && isDesktopForestInlineSearch()) {
        return { kind: 'search-redirect' };
    }

    if (type === 'dialog' && typeof modal === 'object') {
        const dialogKey = dialogModalContentKey(modal);
        return {
            kind: 'lazy',
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

    if (type === 'contributor') {
        return { kind: 'contributor', chunkType: 'contributor', suspenseKey: routeKey };
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
    backdrop.classList.toggle('arborito-modal--mobile', mobUi);
    backdrop.classList.toggle('arborito-modal--search', t === 'search');
    backdrop.classList.toggle('arborito-modal--arcade', t === 'arcade');
    backdrop.classList.toggle('arborito-modal--forum', t === 'forum');
    backdrop.classList.toggle('arborito-modal--certificates-hub', state.viewMode === 'certificates');
    backdrop.classList.toggle('arborito-modal--immersive', t === 'game-player');
    backdrop.classList.toggle('arborito-modal--mobile-fullbleed', isMobileBackdropFullbleed(state, mobUi));
}

export function handleModalEscapeKey(state, store) {
    if (store.state.modalOverlay) {
        store.closeAuthorLicenseOverlay();
        return true;
    }
    if (state.modal) {
        const type = state.modal?.type || state.modal;
        if (type === 'onboarding') return true;
        if (type === 'sources' && store.isSourcesDismissBlocked()) {
            const ui = store.ui;
            store.notify(ui.sourcesDismissNeedTree || 'Add or load a tree before closing.', true);
            return true;
        }
        if (type !== 'dialog') store.dismissModal();
        return true;
    }
    if (state.viewMode === 'certificates') {
        store.leaveCertificatesView();
        return true;
    }
    return false;
}

export function handleFocusTrapEscape(store) {
    const cur = store.value.modal;
    const mt = cur?.type || cur;
    if (mt === 'onboarding') return;
    if (mt === 'sources' && store.isSourcesDismissBlocked()) return;
    if (mt !== 'dialog') store.dismissModal();
}

export function handleBackdropEmptyTap(store) {
    const cur = store.value.modal;
    const mt = cur?.type || cur;
    if (mt === 'onboarding') return;
    if (mt === 'sources' && store.isSourcesDismissBlocked()) {
        const ui = store.ui;
        store.notify(ui.sourcesDismissNeedTree || 'Add or load a tree before closing.', true);
        return;
    }
    store.dismissModal();
}
