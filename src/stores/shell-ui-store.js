import { createArboritoStore } from './create-store.js';
import { useStore } from 'zustand';
import { patchStoreSlice } from './sync-shallow.js';

/**
 * Piloto Zustand, shell UI: tema, idioma, modales, banners.
 * Compartido por shell-chrome e identity-auth.
 */
export const shellUiStore = createArboritoStore(() => ({
    theme: 'light',
    lang: 'EN',
    viewMode: 'explore',
    modal: null,
    modalOverlay: null,
    loading: false,
    error: null,
    cloudSyncBanner: null,
    certificatesFromMobileMore: false,
    lastErrorMessage: null,
    lastActionMessage: null,
    publishingTree: false,
    creatorModerationAlerts: [],
    creatorModerationUnreadCount: 0,
}));

/** @param {Record<string, unknown>} snap */
export function syncShellUiStoreFromSnapshot(snap) {
    if (!snap || typeof snap !== 'object') return;
    patchStoreSlice(shellUiStore, {
        theme: snap.theme ?? 'light',
        lang: snap.lang ?? 'EN',
        viewMode: snap.viewMode ?? 'explore',
        modal: snap.modal ?? null,
        modalOverlay: snap.modalOverlay ?? null,
        loading: !!snap.loading,
        error: snap.error ?? null,
        cloudSyncBanner: snap.cloudSyncBanner ?? null,
        certificatesFromMobileMore: !!snap.certificatesFromMobileMore,
        lastErrorMessage: snap.lastErrorMessage ?? null,
        lastActionMessage: snap.lastActionMessage ?? null,
        publishingTree: !!snap.publishingTree,
        creatorModerationAlerts: Array.isArray(snap.creatorModerationAlerts) ? snap.creatorModerationAlerts : [],
        creatorModerationUnreadCount: Number(snap.creatorModerationUnreadCount) || 0,
    });
}

export function useShellUiSlice(selector) {
    return useStore(shellUiStore, selector);
}

export function patchShellUiSlice(partial) {
    if (!partial || typeof partial !== 'object') return;
    shellUiStore.setState(partial);
}

export {
    alertAction,
    commitShellUiState,
    confirmAction,
    dismissCloudSyncBannerAction,
    dismissModalAction,
    enableCloudSyncFromBannerAction,
    goHomeAction,
    isSignedInAction,
    notifyAction,
    openSageModalAction,
    confirmLeaveActiveQuizIfNeededAction,
    requestGoHomeAction,
    setLangAction,
    setLanguageAction,
    setModalAction,
    setThemeAction,
    setViewModeAction,
    shellUiActions,
    showDialogAction,
    toggleThemeAction,
} from './shell-ui-store-actions.js';
