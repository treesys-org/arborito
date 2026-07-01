import { createArboritoStore } from './create-store.js';
import { useStore } from 'zustand';
import { nostrDomainActions } from './nostr-store-actions.js';
import { patchStoreSlice } from './sync-shallow.js';

/**
 * Piloto Zustand — red Nostr (colaboradores, roles).
 * `nostrLiveSeeds` vive en tree-graph-store (salud de árbol público).
 */
export const nostrStore = createArboritoStore(() => ({
    treeCollaboratorRoles: null,
}));

/** @param {Record<string, unknown>} snap */
export function syncNostrStoreFromSnapshot(snap) {
    if (!snap || typeof snap !== 'object') return;
    patchStoreSlice(nostrStore, {
        treeCollaboratorRoles: snap.treeCollaboratorRoles ?? null,
    });
}

export function useNostrSlice(selector) {
    return useStore(nostrStore, selector);
}

export function patchNostrSlice(partial) {
    if (!partial || typeof partial !== 'object') return;
    nostrStore.setState(partial);
}

export { commitNostrState, nostrDomainActions } from './nostr-store-actions.js';

/** Acciones Nostr — dominio en `nostr-store-actions.js`. */
export const nostrActions = { ...nostrDomainActions };
