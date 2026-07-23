import { getArboritoStore } from '../core/store-singleton.js';
import { getPanelRef } from '../app/panel-refs.js';
import { openModal } from '../app/modal-open.js';

/**
 * Aplica un patch de shell UI al singleton (sincroniza slices vía `store.update`).
 * @param {Record<string, unknown>} partial
 */
export function commitShellUiState(partial) {
    const store = getArboritoStore();
    if (!store || !partial) return;
    store.update(partial);
}

function shell() {
    return getArboritoStore();
}

export function setThemeAction(theme, options) {
    return shell()?.setTheme?.(theme, options);
}

export function toggleThemeAction() {
    return shell()?.toggleTheme?.();
}

export function setLangAction(lang) {
    return shell()?.setLanguage?.(lang);
}

export function setLanguageAction(code, opts) {
    return shell()?.setLanguage?.(code, opts);
}

export function setViewModeAction(mode, opts) {
    return shell()?.setViewMode?.(mode, opts);
}

export function dismissModalAction(opts) {
    return shell()?.dismissModal?.(opts);
}

export function setModalAction(modal) {
    openModal(modal);
}

export function notifyAction(msg, isError) {
    return shell()?.notify?.(msg, isError);
}

export function enableCloudSyncFromBannerAction() {
    return shell()?.enableCloudSyncFromBanner?.();
}

export function dismissCloudSyncBannerAction() {
    return shell()?.dismissCloudSyncBanner?.();
}

export function isSignedInAction() {
    return shell()?.isSignedIn?.();
}

export function confirmAction(...args) {
    return shell()?.confirm?.(...args);
}

export function alertAction(...args) {
    return shell()?.alert?.(...args);
}

export function acknowledgeAction(opts) {
    return shell()?.acknowledge?.(opts);
}

export function showDialogAction(...args) {
    return shell()?.showDialog?.(...args);
}

export function openSageModalAction(payload) {
    return shell()?.openSageModal?.(payload);
}

export function goHomeAction() {
    const store = getArboritoStore();
    if (!store) return;
    store.update({
        viewMode: 'explore',
        selectedNode: null,
        previewNode: null,
        modal: null,
        certificatesFromMobileMore: false,
    });
}

export async function confirmLeaveActiveQuizIfNeededAction() {
    const contentEl = getPanelRef('content');
    if (contentEl && typeof contentEl.confirmLeaveIfNeeded === 'function') {
        return contentEl.confirmLeaveIfNeeded();
    }
    return true;
}

export async function requestGoHomeAction() {
    const store = getArboritoStore();
    if (!store) return;

    const m = store.state.modal;
    const mt = m && (typeof m === 'string' ? m : m.type);
    if (mt === 'game-player') {
        const ok = await confirmAction(
            store.ui?.confirmCloseGame ||
                'Are you sure you want to exit the game? Any unsaved progress will be lost.'
        );
        if (!ok) return;
    }

    if (!(await confirmLeaveActiveQuizIfNeededAction())) return;

    const sb = getPanelRef('sidebar');
    if (sb && typeof sb.closeMobileMenuIfOpen === 'function') {
        sb.closeMobileMenuIfOpen();
    }

    store.update({
        viewMode: 'explore',
        modal: null,
        modalOverlay: null,
        previewNode: null,
        selectedNode: null,
    });

    goHomeAction();
}

/** API pública shell, resuelve store vía `getArboritoStore()`. */
export const shellUiActions = {
    setTheme: setThemeAction,
    setLang: setLangAction,
    setLanguage: setLanguageAction,
    toggleTheme: toggleThemeAction,
    setViewMode: setViewModeAction,
    dismissModal: dismissModalAction,
    setModal: setModalAction,
    notify: notifyAction,
    enableCloudSyncFromBanner: enableCloudSyncFromBannerAction,
    dismissCloudSyncBanner: dismissCloudSyncBannerAction,
    isSignedIn: isSignedInAction,
    confirm: confirmAction,
    acknowledge: acknowledgeAction,
    alert: alertAction,
    showDialog: showDialogAction,
    openSageModal: openSageModalAction,
    goHome: goHomeAction,
    requestGoHome: requestGoHomeAction,
};
