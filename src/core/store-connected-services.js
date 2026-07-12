import {
    getWindowConfiguredNostrRelays,
    loadUserNostrRelays,
    backfillSuggestedRelaysIfNeeded,
} from '../features/nostr/api/nostr-relays-runtime.js';
import { hasGdprNetworkConsent } from '../features/privacy-gdpr/api/network-consent.js';
import { ensureAppCoreReady } from './store-lazy-modules.js';

/** Nostr + AI lazy init, mixed onto Store.prototype at boot. */
export const storeConnectedServiceMethods = {
    _applyNostrPeerConfig(service) {
        let onboardingSeen = false;
        try {
            onboardingSeen = localStorage.getItem('arborito-onboarding-seen-v1') === 'true';
        } catch {
            /* ignore */
        }
        backfillSuggestedRelaysIfNeeded({ hasGdprNetworkConsent, onboardingSeen });

        const userRelays = loadUserNostrRelays();
        if (userRelays.length) {
            service.setPeers(userRelays);
            return;
        }
        const fromPage = getWindowConfiguredNostrRelays();
        if (fromPage.length) service.setPeers(fromPage);
    },

    async ensureNostrReady() {
        if (this._nostr) return this._nostr;
        if (!this._nostrInitPromise) {
            this._nostrInitPromise = import('../features/nostr/api/client/index.js').then(
                ({ NostrUniverseService }) => {
                    const service = new NostrUniverseService();
                    this._applyNostrPeerConfig(service);
                    this._nostr = service;
                    return service;
                }
            );
        }
        return this._nostrInitPromise;
    },

    async ensureCoreReady() {
        return ensureAppCoreReady();
    },

    async ensureAILogic() {
        if (this._aiLogic) return this._aiLogic;
        if (!this._aiLogicPromise) {
            this._aiLogicPromise = import('../features/learning/api/ai-logic.js').then(({ AILogic }) => {
                this._aiLogic = new AILogic(this);
                return this._aiLogic;
            });
        }
        return this._aiLogicPromise;
    },
};
