import { hasGdprNetworkConsent } from './connected-services/index.js';

const ONBOARDING_SEEN_KEY = 'arborito-onboarding-seen-v1';

/** Wizard not finished yet (step 2/3 still pending) — stays true after GDPR accept. */
export function isOnboardingWizardIncomplete() {
    try {
        return localStorage.getItem(ONBOARDING_SEEN_KEY) !== 'true';
    } catch {
        return true;
    }
}

/** First-run welcome (step 1) — defer heavy locale/emoji work until the user accepts. */
export function isFirstVisitOnboarding() {
    try {
        if (hasGdprNetworkConsent()) return false;
        return localStorage.getItem(ONBOARDING_SEEN_KEY) !== 'true';
    } catch {
        return true;
    }
}
