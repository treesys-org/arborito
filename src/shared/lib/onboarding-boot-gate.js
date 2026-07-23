import { hasGdprNetworkConsent } from './connected-services/index.js';

const ONBOARDING_SEEN_KEY = 'arborito-onboarding-seen-v1';

/** Wizard not finished yet (step 2/3 still pending), stays true after GDPR accept. */
export function isOnboardingWizardIncomplete() {
    try {
        return localStorage.getItem(ONBOARDING_SEEN_KEY) !== 'true';
    } catch {
        return true;
    }
}

/** Allow returning to the wizard after guest skip / Biblioteca back. */
export function reopenOnboardingWizard() {
    try {
        localStorage.removeItem(ONBOARDING_SEEN_KEY);
    } catch {
        /* ignore */
    }
}

/**
 * Build `{ type: 'onboarding', step?, view? }` from a `fromOnboarding` hint.
 * Clears the “seen” flag so OnboardingModal does not bounce straight back to Forest.
 * @param {unknown} fromOnboarding
 * @returns {{ type: 'onboarding', step?: number, view?: string }}
 */
export function onboardingModalFromSourcesHint(fromOnboarding) {
    reopenOnboardingWizard();
    const hint = fromOnboarding && typeof fromOnboarding === 'object' ? fromOnboarding : {};
    const payload = { type: 'onboarding' };
    const returnStep = Number(hint.step);
    if (returnStep === 1 || returnStep === 2) payload.step = returnStep;
    if (hint.view) payload.view = hint.view;
    return payload;
}

/** First-run welcome (step 1), defer heavy shell/locale work until the user accepts. */
export function isFirstVisitOnboarding() {
    try {
        if (hasGdprNetworkConsent()) return false;
        return localStorage.getItem(ONBOARDING_SEEN_KEY) !== 'true';
    } catch {
        return true;
    }
}
