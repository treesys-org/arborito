import { createArboritoStore } from './create-store.js';
import { useStore } from 'zustand';
import { patchStoreSlice } from './sync-shallow.js';

/**
 * Zustand mirror of `userStore` branches/trees, Biblioteca subscribes here
 * instead of polling the singleton on every `state-change`.
 */
export const catalogStore = createArboritoStore(() => ({
    branches: [],
    trees: [],
    revision: 0,
}));

/** @param {import('../core/user-store/index.js').UserStore | null | undefined} userStore */
export function syncCatalogStoreFromUserStore(userStore) {
    if (!userStore?.state) return;
    patchStoreSlice(catalogStore, {
        branches: Array.isArray(userStore.state.branches) ? userStore.state.branches : [],
        trees: Array.isArray(userStore.state.trees) ? userStore.state.trees : [],
        revision: userStore._catalogRevision || 0,
    });
}

export function useCatalogSlice(selector) {
    return useStore(catalogStore, selector);
}

export function patchCatalogSlice(partial) {
    if (!partial || typeof partial !== 'object') return;
    catalogStore.setState(partial);
}
