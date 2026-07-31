/**
 * Optimistic like UI that survives list remounts/reranks.
 * Keyed by ownerPub/universeId; Components subscribe and render from here.
 */

const overrides = new Map();
const listeners = new Set();

function voteUiKey(ownerPub, universeId) {
    return `${String(ownerPub || '').trim()}/${String(universeId || '').trim()}`;
}

function emit(key) {
    for (const fn of listeners) {
        try {
            fn(key);
        } catch {
            /* ignore */
        }
    }
}

export function getVoteUiOverride(ownerPub, universeId) {
    return overrides.get(voteUiKey(ownerPub, universeId)) || null;
}

/** Toggle from current override or from prop baselines. Returns next state. */
export function toggleVoteUiOverride(ownerPub, universeId, baseLiked, baseVotes) {
    const key = voteUiKey(ownerPub, universeId);
    const cur = overrides.get(key);
    const liked = cur ? cur.liked : !!baseLiked;
    const votes = cur ? cur.votes : Math.max(0, Number(baseVotes) || 0);
    const nextLiked = !liked;
    const next = {
        liked: nextLiked,
        votes: Math.max(0, votes + (nextLiked ? 1 : -1)),
    };
    overrides.set(key, next);
    emit(key);
    return next;
}

/** Drop override once props have caught up (optional cleanup). */
export function clearVoteUiOverrideIfMatched(ownerPub, universeId, liked, votes) {
    const key = voteUiKey(ownerPub, universeId);
    const cur = overrides.get(key);
    if (!cur) return;
    const v = Math.max(0, Number(votes) || 0);
    if (cur.liked === !!liked && cur.votes === v) {
        overrides.delete(key);
        emit(key);
    }
}

export function subscribeVoteUi(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
