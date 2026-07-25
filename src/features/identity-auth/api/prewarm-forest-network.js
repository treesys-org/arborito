/**
 * Fire-and-forget: warm Nostr relays + pull course directory indices.
 * Never block login/register — callers must not await this for account success.
 */

import { getArboritoStore } from '../../../core/store-singleton.js';
import {
    hasGdprNetworkConsent,
    warmNostrRelayConnections,
} from '../../../shared/lib/connected-services/index.js';
import { DIRECTORY_CLIENT_FETCH_LIMIT } from '../../p2p-webtorrent/api/directory-index-config.js';

let _prewarmInFlight = null;

/**
 * @param {ReturnType<typeof getArboritoStore>} [storeRef]
 * @returns {void}
 */
export function prewarmForestNetworkIndices(storeRef = getArboritoStore()) {
    if (!hasGdprNetworkConsent()) return;
    if (_prewarmInFlight) return;

    _prewarmInFlight = (async () => {
        try {
            void storeRef.userStore?.ensureBranchesHydrated?.()?.catch?.(() => {});
            const nostr = await warmNostrRelayConnections(storeRef, {
                probe: true,
                timeoutMs: 12000,
                perRelayMs: 4500,
            });
            if (nostr && typeof nostr.listGlobalTreeDirectoryEntriesOnce === 'function') {
                await nostr.listGlobalTreeDirectoryEntriesOnce({
                    limit: DIRECTORY_CLIENT_FETCH_LIMIT,
                    query: '',
                });
            }
        } catch (e) {
            console.warn('[Arborito] forest network indices prewarm', e);
        } finally {
            _prewarmInFlight = null;
        }
    })();
}
