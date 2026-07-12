/** Connected services, single public entry for consent gates + Nostr / AI runtime. */
export {
    ensureConnectedNostr,
    getConnectedNostr,
    requireConnectedNostr,
    ensureConnectedAI,
    runConnectedNetworkLoad,
    runBibliotecaNetworkLoad,
} from './runtime.js';

export {
    hasGdprNetworkConsent,
    grantGdprNetworkConsent,
    withdrawGdprNetworkConsent,
    onGdprNetworkConsentGranted,
    hasNetworkSocialConsent,
    needsNetworkSocialConsent,
    buildNetworkSocialConsentPatch,
} from '../../../features/privacy-gdpr/api/network-consent.js';
