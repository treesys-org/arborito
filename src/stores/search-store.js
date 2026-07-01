import { createArboritoStore } from './create-store.js';
import { useStore } from 'zustand';
import { patchStoreSlice } from './sync-shallow.js';

/**
 * Piloto Zustand — slice de búsqueda (desacoplado gradualmente de core/store).
 * Se sincroniza desde el snapshot global en syncReactSnapshot().
 */
export const searchStore = createArboritoStore(() => ({
    searchIndexStatus: 'idle',
    searchIndexError: null,
    searchCache: null,
}));

/** @param {Record<string, unknown>} snap — reactStateStore snapshot */
export function syncSearchStoreFromSnapshot(snap) {
    if (!snap || typeof snap !== 'object') return;
    patchStoreSlice(searchStore, {
        searchIndexStatus: snap.searchIndexStatus ?? 'idle',
        searchIndexError: snap.searchIndexError ?? null,
        searchCache: snap.searchCache ?? null,
    });
}

export function patchSearchSlice(partial) {
    if (!partial || typeof partial !== 'object') return;
    searchStore.setState(partial);
}

export function useSearchSlice(selector) {
    return useStore(searchStore, selector);
}

/** Alias — prefer `useSearchSlice` (matches other domain stores). */
export const useSearchStore = useSearchSlice;

export { commitSearchState, searchActions, searchAction, searchBroadAction } from './search-store-actions.js';
