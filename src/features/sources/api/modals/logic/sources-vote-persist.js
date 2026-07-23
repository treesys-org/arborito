/**
 * Persistent like display that survives close/reopen while network tallies lag.
 * Floor is the highest count the user has already seen for a tree; network
 * metrics never push the visible count below that until relays catch up.
 */

import {
    sourcesLsGet,
    sourcesLsSet,
    sourcesLsDel,
    sourcesVoteKey,
    sourcesVoteKeyFallback,
} from './sources-local-storage.js';
import { getArboritoStore as store } from '../../../../../core/store-singleton.js';

function countKey(ownerPub, universeId) {
    return `arborito-tree-vote-count-v1:${ownerPub}/${universeId}`;
}

export function readLocalLiked(ownerPub, universeId, voterPub = '') {
    let pub = String(voterPub || '').trim();
    if (!pub) {
        try {
            pub = String(store.getNetworkUserPair?.()?.pub || '').trim();
        } catch {
            pub = '';
        }
    }
    try {
        const fallback = sourcesLsGet(sourcesVoteKeyFallback(ownerPub, universeId)) === '1';
        if (pub) {
            return sourcesLsGet(sourcesVoteKey(ownerPub, universeId, pub)) === '1' || fallback;
        }
        return fallback;
    } catch {
        return false;
    }
}

export function readVoteCountFloor(ownerPub, universeId) {
    const n = Number(sourcesLsGet(countKey(ownerPub, universeId)));
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

export function writeVoteCountFloor(ownerPub, universeId, votes) {
    const n = Math.max(0, Math.floor(Number(votes) || 0));
    sourcesLsSet(countKey(ownerPub, universeId), String(n));
}

export function clearVoteCountFloor(ownerPub, universeId) {
    sourcesLsDel(countKey(ownerPub, universeId));
}

/**
 * Merge network tally with local floor + local liked flag.
 * @returns {number|null}
 */
export function mergeDisplayedVotes(ownerPub, universeId, networkVotes, likedLocally) {
    const net =
        networkVotes == null || networkVotes === ''
            ? null
            : Math.max(0, Math.floor(Number(networkVotes) || 0));
    const floor = readVoteCountFloor(ownerPub, universeId);
    let n = net;
    if (floor != null) {
        n = n == null ? floor : Math.max(n, floor);
    }
    if (likedLocally) {
        n = Math.max(n == null ? 0 : n, 1);
        if (floor != null) n = Math.max(n, floor);
    }
    if (net != null && floor != null && net >= floor) {
        writeVoteCountFloor(ownerPub, universeId, net);
        return net;
    }
    return n;
}

/** After a local toggle, pin the visible count so reopen cannot drop it. */
export function pinVoteCountAfterToggle(ownerPub, universeId, nextVotes) {
    writeVoteCountFloor(ownerPub, universeId, nextVotes);
}
