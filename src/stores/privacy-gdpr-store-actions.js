import {
    clearAllArboritoBrowserStorage,
    clearOptionalConsentKeys,
} from '../features/backup-export/api/clear-arborito-browser-storage.js';
import {
    hasGdprNetworkConsent,
    grantGdprNetworkConsent,
    withdrawGdprNetworkConsent,
} from '../shared/lib/connected-services/index.js';
import { getArboritoStore } from '../core/store-singleton.js';
import { confirmAction, notifyAction, showDialogAction } from './shell-ui-store-actions.js';

/** GDPR network consent + optional consents reset + wipe local device data. */
export async function resetOptionalConsentsInteractiveAction() {
    const store = getArboritoStore();
    if (!store) return;
    const ui = store.ui;
    const ok = await confirmAction(ui.privacyResetConsentConfirmBody, ui.privacyResetConsentConfirmTitle, false);
    if (!ok) return;
    clearOptionalConsentKeys();
    withdrawGdprNetworkConsent();
    notifyAction(ui.privacyResetConsentDone, false);
}

export function hasGdprNetworkConsentAction() {
    return hasGdprNetworkConsent();
}

export function grantGdprNetworkConsentAction() {
    grantGdprNetworkConsent();
}

export async function wipeAllLocalDataOnThisDeviceInteractiveAction() {
    const store = getArboritoStore();
    if (!store) return;
    const ui = store.ui;
    const word = (ui.privacyWipeLocalPromptWord || 'deletetree').trim();
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
    if (String(typed || '').trim().toLowerCase() !== word.toLowerCase()) {
        notifyAction(ui.privacyWipeLocalPromptMismatch || 'Confirmation did not match.', true);
        return;
    }
    await wipeAllLocalDataOnThisDeviceAction();
}

export async function wipeAllLocalDataOnThisDeviceAction() {
    clearAllArboritoBrowserStorage();
    window.location.reload();
}

/** Store.prototype — GDPR / privacy. */
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
