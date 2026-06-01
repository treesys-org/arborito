/**
 * Unified GDPR-style consent for Nostr-backed social features (forum + weekly ranking).
 * Granted once when creating an online account; sign-in sessions from another
 * device must accept before posting (the consent record lives in this device's
 * gamification state).
 */

const NETWORK_SOCIAL_CONSENT_VERSION = 1;

/**
 * @param {import('../../core/store.js').default} store
 */
export function hasNetworkSocialConsent(store) {
    const g = store?.userStore?.state?.gamification;
    if (!g?.networkSocialConsentAt) return false;
    return Number(g.networkSocialConsentVersion) === NETWORK_SOCIAL_CONSENT_VERSION;
}

/**
 * Signed-in user still needs to accept (e.g. account created on another device
 * before the consent record syncs over).
 * @param {import('../../core/store.js').default} store
 */
export function needsNetworkSocialConsent(store) {
    if (typeof store.isSignedIn !== 'function' || !store.isSignedIn()) return false;
    return !hasNetworkSocialConsent(store);
}

/**
 * @param {import('../../core/store.js').default} store
 * @returns {{ networkSocialConsentAt: string, networkSocialConsentVersion: number, rankingOptIn: boolean }}
 */
export function buildNetworkSocialConsentPatch() {
    return {
        networkSocialConsentAt: new Date().toISOString(),
        networkSocialConsentVersion: NETWORK_SOCIAL_CONSENT_VERSION,
        rankingOptIn: true
    };
}
