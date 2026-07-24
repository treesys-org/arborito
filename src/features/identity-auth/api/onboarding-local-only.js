/**
 * Confirm + enter local-only mode from onboarding Privacy (or welcome).
 */

import { persistUserNostrRelays } from '../../nostr/api/nostr-relays-runtime.js';
import { withdrawGdprNetworkConsent } from '../../../shared/lib/connected-services/index.js';
import { showDialogAction } from '../../../stores/shell-ui-store-actions.js';
import { completeOnboardingWizard } from './onboarding-complete.js';

/**
 * @param {{
 *   ui?: Record<string, string>,
 *   notify?: (msg: string, isError?: boolean) => void,
 *   setModal?: (m: object) => void,
 *   cancelPendingAccountSyncTimers?: () => void,
 *   loadLanguage?: (lang: string) => void,
 *   lang?: string,
 * }} opts
 * @returns {Promise<boolean>}
 */
export async function confirmAndEnterLocalOnlyOnboarding(opts = {}) {
    const ui = opts.ui || {};
    const word = String(ui.onboardingLocalOnlyPromptWord || 'localonly')
        .normalize('NFKC')
        .replace(/\s+/g, '')
        .toLowerCase();
    const typed = await showDialogAction({
        type: 'prompt',
        title: ui.onboardingLocalOnlyConfirmTitle || 'Local-only mode?',
        body:
            ui.onboardingLocalOnlyPromptBody ||
            ui.onboardingLocalOnlyConfirmBody ||
            'Arborito will be very limited. Type the keyword to continue offline.',
        placeholder: ui.onboardingLocalOnlyPromptPlaceholder || word,
        danger: true,
        confirmText: ui.onboardingLocalOnlyConfirmButton || 'Yes, local only',
        cancelText: ui.cancel || 'Cancel',
    });
    if (typed == null) return false;
    if (
        String(typed || '')
            .normalize('NFKC')
            .replace(/\s+/g, '')
            .toLowerCase() !== word
    ) {
        opts.notify?.(
            ui.onboardingLocalOnlyPromptMismatch ||
                ui.privacyWipeLocalPromptMismatch ||
                'Confirmation did not match.',
            true
        );
        return false;
    }
    withdrawGdprNetworkConsent();
    persistUserNostrRelays([]);
    opts.cancelPendingAccountSyncTimers?.();
    if (opts.lang && typeof opts.loadLanguage === 'function') {
        void opts.loadLanguage(opts.lang);
    }
    if (typeof opts.setModal === 'function') {
        completeOnboardingWizard(
            { setModal: opts.setModal },
            { guest: true, localOnly: true, returnStep: 1 }
        );
    }
    return true;
}
