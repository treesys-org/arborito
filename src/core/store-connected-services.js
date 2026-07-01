import { getWindowConfiguredNostrRelays, normalizeNostrRelayUrls } from '../features/nostr/api/nostr-relays-runtime.js';
import { ensureAppCoreReady } from './store-lazy-modules.js';

/** Nostr + AI lazy init — mixed onto Store.prototype at boot. */
export const storeConnectedServiceMethods = {
    _applyNostrPeerConfig(service) {
        try {
            const rawPeers = localStorage.getItem('arborito-nostr-relays-v1');
            if (rawPeers) {
                const parsed = JSON.parse(rawPeers);
                if (Array.isArray(parsed) && parsed.length) {
                    const normalized = normalizeNostrRelayUrls(parsed);
                    if (normalized.length) service.setPeers(normalized);
                }
            }
        } catch {
            /* ignore */
        }
        if (!service.peers.length) {
            const fromPage = getWindowConfiguredNostrRelays();
            if (fromPage.length) service.setPeers(fromPage);
        }
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
