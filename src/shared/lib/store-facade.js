/**
 * Read graph/app fields from either the legacy singleton (`store.state`)
 * or a Zustand hook facade (flat slice fields on the hook return).
 */

export function getStoreTreeRoot(store) {
    if (!store) return null;
    return store.state?.data ?? store.data ?? null;
}

export function getStoreFields(store) {
    if (!store) return {};
    if (store.state && typeof store.state === 'object') return store.state;
    return store;
}
