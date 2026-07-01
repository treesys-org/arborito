/**
 * Emit Nostr fork/remix signal when publishing derived content.
 */

import { parseNostrTreeUrl } from './nostr-refs.js';
import { ensureConnectedNostr } from '../../../shared/lib/connected-services/index.js';

/**
 * @param {import('../../../core/store.js' ).Store} store
 * @param {object} forkOf
 * @param {{ pub: string, universeId: string }} childRef
 */
export async function publishForkSignalIfNeeded(store, forkOf, childRef) {
    const url = String(forkOf?.treeUrl || '').trim();
    const parent = url ? parseNostrTreeUrl(url) : null;
    if (!parent?.pub || !parent?.universeId) return;
    const childPub = String(childRef?.pub || '').trim();
    const childId = String(childRef?.universeId || '').trim();
    if (!childPub || !childId) return;
    if (parent.pub === childPub && parent.universeId === childId) return;
    await ensureConnectedNostr(store);
    if (!store.nostr) return;
    const pair = store.getNostrPublisherPair(childPub);
    if (!(pair && pair.priv)) return;
    try {
        await store.nostr.putTreeFork({
            pair,
            parentOwnerPub: parent.pub,
            parentUniverseId: parent.universeId,
            forkOwnerPub: childPub,
            forkUniverseId: childId,
        });
    } catch (e) {
        console.warn('fork signal publish failed', e);
    }
}
