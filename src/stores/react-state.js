import { createStore } from 'zustand/vanilla';
import { syncSearchStoreFromSnapshot } from './search-store.js';
import { syncLearningStoreFromSnapshot } from './learning-store.js';
import { syncTreeGraphStoreFromSnapshot } from './tree-graph-store.js';
import { syncSourcesStoreFromSnapshot } from './sources-store.js';
import { syncShellUiStoreFromSnapshot } from './shell-ui-store.js';
import { syncNostrStoreFromSnapshot } from './nostr-store.js';
import { patchStoreSlice } from './sync-shallow.js';

/**
 * i18n + metadata — ya no replica todo `store.value`.
 * El estado de dominio vive en slices Zustand; ver `useArboritoStore()`.
 */
export const reactStateStore = createStore(() => ({
    ui: {},
    availableLanguages: [],
    currentLangInfo: null,
}));

function snapshotFromStore(storeOrSnap) {
    return storeOrSnap && typeof storeOrSnap === 'object' && 'state' in storeOrSnap
        ? {
              ...storeOrSnap.value,
              ui: storeOrSnap.ui,
              availableLanguages: storeOrSnap.availableLanguages,
              currentLangInfo: storeOrSnap.currentLangInfo,
          }
        : (storeOrSnap ?? {});
}

/** i18n metadata only — domain slices are synced in `patchDomainSlicesFromPartial`. */
export function syncReactI18nSnapshot(storeOrSnap) {
    const snap = snapshotFromStore(storeOrSnap);
    patchStoreSlice(reactStateStore, {
        ui: snap.ui ?? {},
        availableLanguages: snap.availableLanguages ?? [],
        currentLangInfo: snap.currentLangInfo ?? null,
    });
}

/**
 * @param {import('../core/store.js').store | Record<string, unknown>} storeOrSnap
 */
export function syncReactSnapshot(storeOrSnap) {
    const snap = snapshotFromStore(storeOrSnap);

    syncReactI18nSnapshot(snap);

    syncSearchStoreFromSnapshot(snap);
    syncLearningStoreFromSnapshot(snap);
    syncTreeGraphStoreFromSnapshot(snap);
    syncSourcesStoreFromSnapshot(snap);
    syncShellUiStoreFromSnapshot(snap);
    syncNostrStoreFromSnapshot(snap);
}
