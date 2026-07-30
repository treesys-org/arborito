/**
 * Finish the onboarding wizard (Trees picker + boot continuation).
 * Shared by OnboardingModal, QR scanner, and recovery flows.
 */

import { getArboritoStore } from '../../../core/store-singleton.js';
import { hasGdprNetworkConsent } from '../../../shared/lib/connected-services/index.js';
import { prewarmForestNetworkIndices } from './prewarm-forest-network.js';

const ONBOARDING_SEEN_KEY = 'arborito-onboarding-seen-v1';

/**
 * @param {{ setModal: (m: object) => void }} store
 * @param {{ guest?: boolean, localOnly?: boolean, returnStep?: number }} [opts]
 *   guest: reserved (account offer runs after first lesson progress);
 *   localOnly: show local-mode banner in Biblioteca;
 *   returnStep: onboarding step when Biblioteca closes.
 */
export function completeOnboardingWizard(store, opts = {}) {
    try {
        localStorage.setItem(ONBOARDING_SEEN_KEY, 'true');
    } catch {
        /* ignore */
    }
    /* Fire-and-forget — never await; must not delay sign-in success paths. */
    if (hasGdprNetworkConsent()) {
        prewarmForestNetworkIndices(getArboritoStore());
    }
    const returnStep = Number(opts.returnStep) === 1 ? 1 : 2;
    const fromOnboarding = { step: returnStep };
    if (opts.localOnly) fromOnboarding.showLocalModeBanner = true;
    store.setModal({
        type: 'sources',
        instantOpen: true,
        fromOnboarding,
    });
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('arborito-onboarding-complete'));
    }
}
