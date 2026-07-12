/**
 * Finish the onboarding wizard (Trees picker + boot continuation).
 * Shared by OnboardingModal, QR scanner, and recovery flows.
 */

const ONBOARDING_SEEN_KEY = 'arborito-onboarding-seen-v1';

/**
 * @param {{ setModal: (m: object) => void }} store
 * @param {{ guest?: boolean, localOnly?: boolean, returnStep?: number }} [opts]
 *   guest: show sync hint in Biblioteca when not signed in;
 *   localOnly: show local-mode banner in Biblioteca;
 *   returnStep: onboarding step when Biblioteca closes.
 */
export function completeOnboardingWizard(store, opts = {}) {
    try {
        localStorage.setItem(ONBOARDING_SEEN_KEY, 'true');
    } catch {
        /* ignore */
    }
    const returnStep = Number(opts.returnStep) === 1 ? 1 : 2;
    const fromOnboarding = { step: returnStep, view: 'start' };
    if (opts.localOnly) fromOnboarding.showLocalModeBanner = true;
    if (opts.guest) fromOnboarding.showGuestSyncHint = true;
    store.setModal({
        type: 'sources',
        instantOpen: true,
        fromOnboarding,
    });
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('arborito-onboarding-complete'));
    }
}
