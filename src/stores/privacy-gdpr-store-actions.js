import {
    clearAllArboritoBrowserStorage,
    clearOptionalConsentKeys,
} from '../features/backup-export/api/clear-arborito-browser-storage.js';
import {
    hasGdprNetworkConsent,
    grantGdprNetworkConsent,
    withdrawGdprNetworkConsent,
    getConnectedNostr,
} from '../shared/lib/connected-services/index.js';
import { ensureOptInRelaysAfterNetworkGrant } from '../features/nostr/api/nostr-relays-runtime.js';
import { getArboritoStore } from '../core/store-singleton.js';
import { confirmAction, notifyAction, showDialogAction } from './shell-ui-store-actions.js';
import { disableArboritoStorageWrites } from '../shared/lib/arborito-storage-gate.js';
import { clearLessonMediaBlobCache } from '../features/learning/api/lesson-local-media-store.js';
import { cancelScheduledPersistTreeUiState } from '../features/tree-graph/api/tree-ui-persist.js';

/** Prevents double-tap from starting two reset flows before the dialog paints. */
let resetConsentsInFlight = null;
let wipeLocalInFlight = null;

/** GDPR network consent + optional consents reset + wipe local device data. */
export async function resetOptionalConsentsInteractiveAction() {
    if (resetConsentsInFlight) return resetConsentsInFlight;
    resetConsentsInFlight = (async () => {
        const store = getArboritoStore();
        if (!store) return;
        const ui = store.ui;
        const ok = await confirmAction(
            ui.privacyResetConsentConfirmBody,
            ui.privacyResetConsentConfirmTitle,
            false
        );
        if (!ok) return;
        clearOptionalConsentKeys();
        withdrawGdprNetworkConsent();
        try {
            store.cancelPendingAccountSyncTimers?.();
            if (store.userStore?.state) {
                store.userStore.state.cloudProgressSync = false;
                store.userStore.persist?.();
            }
        } catch {
            /* ignore */
        }
        notifyAction(ui.privacyResetConsentDone, false);
    })();
    try {
        return await resetConsentsInFlight;
    } finally {
        resetConsentsInFlight = null;
    }
}

export function hasGdprNetworkConsentAction() {
    return hasGdprNetworkConsent();
}

export function grantGdprNetworkConsentAction() {
    grantGdprNetworkConsent();
    /* Accepting privacy enables Online; without relays register/sync still fail. */
    const restored = ensureOptInRelaysAfterNetworkGrant();
    if (!restored?.length) return;
    const store = getArboritoStore();
    if (!store) return;
    void (async () => {
        try {
            const net = await getConnectedNostr(store);
            if (net) net.setPeers(restored);
        } catch (e) {
            console.warn('[Arborito] apply relays after network grant failed', e);
        }
    })();
}

/** @param {import('./shell-store.js').ShellStore} store */
export async function wipeAllLocalDataOnThisDeviceInteractiveAction() {
    if (wipeLocalInFlight) return wipeLocalInFlight;
    wipeLocalInFlight = (async () => {
        const store = getArboritoStore();
        if (!store) return;
        const ui = store.ui;
        const word = normalizeWipeConfirmToken(ui.privacyWipeLocalPromptWord || 'reseteverything');
        const typed = await showDialogAction({
            type: 'prompt',
            title: ui.privacyWipeLocalTitle || 'Wipe local data?',
            body:
                ui.privacyWipeLocalPromptBody ||
                `Type ${word} to confirm. This cannot be undone.`,
            placeholder: ui.privacyWipeLocalPromptPlaceholder || word,
            danger: true,
            confirmText: ui.privacyWipeLocalConfirmButton || ui.privacyWipeLocalButton || 'Delete',
            cancelText: ui.cancel || 'Cancel',
        });
        if (typed == null) return;
        if (normalizeWipeConfirmToken(typed) !== word) {
            notifyAction(ui.privacyWipeLocalPromptMismatch || 'Confirmation did not match.', true);
            return;
        }
        await wipeAllLocalDataOnThisDeviceAction();
    })();
    try {
        return await wipeLocalInFlight;
    } finally {
        wipeLocalInFlight = null;
    }
}

function normalizeWipeConfirmToken(value) {
    return String(value || '')
        .normalize('NFKC')
        .replace(/\s+/g, '')
        .toLowerCase();
}

export async function wipeAllLocalDataOnThisDeviceAction() {
    const store = getArboritoStore();
    try {
        disableArboritoStorageWrites();
        cancelScheduledPersistTreeUiState();
        store?.cancelPendingAccountSyncTimers?.();
        const us = store?.userStore;
        if (us) {
            us._branchesDirty?.clear?.();
            us._treesDirty?.clear?.();
            us._privateAccountSyncDirty?.clear?.();
            if (us.state) {
                us.state.branches = [];
                us.state.trees = [];
                us.state.completedNodes = new Set();
                us.state.xpAwardedNodes = new Set();
                us.state.bookmarks = [];
                us.state.recentLessons = [];
                us.state.frozenTrees = {};
                us.state.offlineGames = {};
                us.state.gameData = {};
                us.state.installedGames = {};
                us.state.gameRepos = {};
            }
        }
        if (store?.state) {
            store.state.communitySources = [];
            store.state.bookmarks = [];
        }
        if (store?.sourceManager?.state) {
            store.sourceManager.state.communitySources = [];
        }
        clearLessonMediaBlobCache();
    } catch (e) {
        console.warn('[Arborito] wipe quiesce', e);
    }
    await clearAllArboritoBrowserStorage();
    window.location.reload();
}

/** Store.prototype, GDPR / privacy. */
export const storeGdprConsentMethods = {
    resetOptionalConsentsInteractive: resetOptionalConsentsInteractiveAction,
    hasGdprNetworkConsent: hasGdprNetworkConsentAction,
    grantGdprNetworkConsent: grantGdprNetworkConsentAction,
    wipeAllLocalDataOnThisDeviceInteractive: wipeAllLocalDataOnThisDeviceInteractiveAction,
    wipeAllLocalDataOnThisDevice: wipeAllLocalDataOnThisDeviceAction,
};

/** Hook / modal API. */
export const privacyGdprActions = {
    resetOptionalConsentsInteractive: resetOptionalConsentsInteractiveAction,
    hasGdprNetworkConsent: hasGdprNetworkConsentAction,
    grantGdprNetworkConsent: grantGdprNetworkConsentAction,
    wipeAllLocalDataOnThisDeviceInteractive: wipeAllLocalDataOnThisDeviceInteractiveAction,
    wipeAllLocalDataOnThisDevice: wipeAllLocalDataOnThisDeviceAction,
};
