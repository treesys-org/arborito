/** Connected services, single public entry for consent gates + Nostr / AI runtime. */
export {
    ensureConnectedNostr,
    warmNostrRelayConnections,
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
    onGdprNetworkConsentChanged,
    hasNetworkSocialConsent,
    needsNetworkSocialConsent,
    buildNetworkSocialConsentPatch,
} from '../../../features/privacy-gdpr/api/network-consent.js';
