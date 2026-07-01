import { createArboritoStore } from './create-store.js';
import { useStore } from 'zustand';
import { getArboritoStore as store } from '../core/store-singleton.js';
import { patchStoreSlice } from './sync-shallow.js';
import {
    addCommunitySourceAction,
    applyCurriculumPresetLanguageAction,
    cancelUntrustedLoadAction,
    commitSourcesState,
    proceedWithUntrustedLoadAction,
} from './sources-store-actions.js';

/**
 * Piloto Zustand — slice de fuentes / biblioteca de árboles.
 * Se sincroniza desde el snapshot global en syncReactSnapshot().
 */
export const sourcesStore = createArboritoStore(() => ({
    communitySources: [],
    activeSource: null,
    availableReleases: [],
    pendingUntrustedSource: null,
}));

/** @param {Record<string, unknown>} snap — reactStateStore snapshot */
export function syncSourcesStoreFromSnapshot(snap) {
    if (!snap || typeof snap !== 'object') return;
    patchStoreSlice(sourcesStore, {
        communitySources: Array.isArray(snap.communitySources) ? snap.communitySources : [],
        activeSource: snap.activeSource ?? null,
        availableReleases: Array.isArray(snap.availableReleases) ? snap.availableReleases : [],
        pendingUntrustedSource: snap.pendingUntrustedSource ?? null,
    });
}

export function useSourcesSlice(selector) {
    return useStore(sourcesStore, selector);
}

/** Actualización síncrona del slice (transición hacia escrituras directas). */
export function patchSourcesSlice(partial) {
    if (!partial || typeof partial !== 'object') return;
    sourcesStore.setState(partial);
}

export {
    addCommunitySourceAction,
    applyCurriculumPresetLanguageAction,
    cancelUntrustedLoadAction,
    commitSourcesState,
    proceedWithUntrustedLoadAction,
} from './sources-store-actions.js';

/** Acciones fuentes — dominio en `sources-store-actions.js`; resto delega al singleton. */
export const sourcesActions = {
    loadData: (source) => store.loadData(source),
    findNode: (id) => store.findNode(id),
    navigateTo: (id, data) => store.navigateTo(id, data),
    getNetworkUserPair: () => store.getNetworkUserPair?.(),
    getNostrPublisherPair: (pub) => store.getNostrPublisherPair?.(pub),
    cancelUntrustedLoad: cancelUntrustedLoadAction,
    proceedWithUntrustedLoad: proceedWithUntrustedLoadAction,
    applyCurriculumPresetLanguage: applyCurriculumPresetLanguageAction,
    addCommunitySource: addCommunitySourceAction,
    notifyCommunityAddResult: (res) => store.notifyCommunityAddResult(res),
    maybeAutoLoadCommunityAfterAdd: (res) => store.maybeAutoLoadCommunityAfterAdd(res),
};
