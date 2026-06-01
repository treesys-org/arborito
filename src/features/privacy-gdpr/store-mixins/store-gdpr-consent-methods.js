import {
    clearAllArboritoBrowserStorage,
    clearOptionalConsentKeys,
    clearWllamaCaches
} from '../../backup-export/clear-arborito-browser-storage.js';
import {
    hasGdprNetworkConsent,
    grantGdprNetworkConsent,
    withdrawGdprNetworkConsent
} from '../gdpr-network-consent.js';

/** GDPR network consent + optional consents reset + “wipe everything on this device”. */
export const storeGdprConsentMethods = {
    /** GDPR: optional consents (external media, Sage AI, inline-game warning) PLUS
     * the network consent (Nostr relays / WebTorrent). Withdrawing network consent
     * makes `NostrUniverseService` and `WebTorrentService` refuse outbound calls
     * until the user re-accepts. We do NOT delete progress / trees here — that's
     * `wipeAllLocalDataOnThisDeviceInteractive`. */
    async resetOptionalConsentsInteractive() {
        const ui = this.ui;
        const ok = await this.confirm(
            ui.privacyResetConsentConfirmBody,
            ui.privacyResetConsentConfirmTitle,
            false
        );
        if (!ok) return;
        clearOptionalConsentKeys();
        withdrawGdprNetworkConsent();
        this.notify(ui.privacyResetConsentDone, false);
    },

    /** Programmatic getter used by UI components (privacy modal callout). */
    hasGdprNetworkConsent() {
        return hasGdprNetworkConsent();
    },

    /** Called from the privacy modal "Accept" / re-grant CTA. */
    grantGdprNetworkConsent() {
        grantGdprNetworkConsent();
    },

    /** GDPR: erase all Arborito browser storage on this device and reload. */
    async wipeAllLocalDataOnThisDeviceInteractive() {
        const ui = this.ui;
        const word = (ui.privacyWipeLocalPromptWord || 'deletetree').trim();
        const typed = await this.showDialog({
            type: 'prompt',
            title: ui.privacyWipeLocalTitle || 'Wipe local data?',
            body:
                ui.privacyWipeLocalPromptBody ||
                `Type ${word} to confirm. This cannot be undone.`,
            placeholder: ui.privacyWipeLocalPromptPlaceholder || word,
            danger: true,
            confirmText: ui.privacyWipeLocalConfirmButton || ui.privacyWipeLocalButton || 'Delete',
            cancelText: ui.cancel || 'Cancel'
        });
        if (String(typed || '').trim().toLowerCase() !== word.toLowerCase()) {
            this.notify(ui.privacyWipeLocalPromptMismatch || 'Confirmation did not match.', true);
            return;
        }
        await this.wipeAllLocalDataOnThisDevice();
    },

    /** Erase all Arborito browser storage on this device and reload. */
    async wipeAllLocalDataOnThisDevice() {
        clearAllArboritoBrowserStorage();
        await clearWllamaCaches();
        window.location.reload();
    }
};
