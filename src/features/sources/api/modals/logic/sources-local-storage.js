export function sourcesLsGet(key) {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

export function sourcesLsSet(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch {
        /* ignore */
    }
}

export function sourcesLsDel(key) {
    try {
        localStorage.removeItem(key);
    } catch {
        /* ignore */
    }
}

export function sourcesVoteKey(ownerPub, universeId, voterPub) {
    return `arborito-tree-vote-v1:${ownerPub}/${universeId}:${voterPub}`;
}

export function sourcesVoteKeyFallback(ownerPub, universeId) {
    return `arborito-tree-vote-local-v1:${ownerPub}/${universeId}`;
}

export function sourcesCooldownOk(key, minMs) {
    const raw = sourcesLsGet(key);
    const last = raw ? Number(raw) : 0;
    const now = Date.now();
    if (last && Number.isFinite(last) && now - last < minMs) return false;
    sourcesLsSet(key, String(now));
    return true;
}
