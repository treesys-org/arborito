import { parseNostrTreeUrl } from '../../nostr/nostr-refs.js';
import { isNostrNetworkAvailable } from '../../nostr/nostr-universe.js';
import { isNostrTreeMaintainerBlocked as isNostrTreeOnMaintainerBlocklist } from '../../nostr/maintainer-nostr-tree-blocklist.js';

/** Nostr presence + relay URL persistence + maintainer blocklist proxy. */
export const storePresenceMethods = {
    /** Curated blocklist in `maintainer-nostr-tree-blocklist.js` (not automatic report-based blocking). */
    isNostrTreeMaintainerBlocked(ownerPub, universeId) {
        return isNostrTreeOnMaintainerBlocklist(ownerPub, universeId);
    },

    /** Persist + apply Nostr relay URLs (global). */
    setNostrRelayUrls(peers) {
        try {
            this.nostr.setPeers(peers);
            try {
                localStorage.setItem('arborito-nostr-relays-v1', JSON.stringify(this.nostr.peers || []));
            } catch {
                /* ignore */
            }
            // Restart presence on new peers.
            this.syncNostrPresenceFromActiveSource(this.state.activeSource);
            this.update({});
        } catch (e) {
            console.warn('setNostrRelayUrls failed', e);
        }
    },

    /** Start or stop the Nostr presence counter for the active tree. */
    syncNostrPresenceFromActiveSource(source) {
        if (this._nostrPresenceSession) {
            try {
                this._nostrPresenceSession.stop();
            } catch {
                /* ignore */
            }
            this._nostrPresenceSession = null;
        }
        if (!source?.url) {
            this.update({ nostrLiveSeeds: null });
            return;
        }
        const ref = parseNostrTreeUrl(String(source.url));
        if (!ref || !isNostrNetworkAvailable()) {
            this.update({ nostrLiveSeeds: null });
            return;
        }
        const url = String(source.url);
        this._nostrPresenceSession = this.nostr.startUniversePresence({
            pub: ref.pub,
            universeId: ref.universeId,
            onCount: (total) => {
                if (String(this.state.activeSource?.url || '') !== url) return;
                const t = typeof total === 'number' && total >= 0 ? total : 0;
                if (this.state.nostrLiveSeeds === t) return;
                this.update({ nostrLiveSeeds: t });
            }
        });
    }
};
