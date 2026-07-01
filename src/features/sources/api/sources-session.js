import { getArboritoStore as store } from '../../../core/store-singleton.js';

/**
 * Biblioteca was opened from onboarding/welcome (`modal.fromOnboarding`).
 * Only then should a successful load/plant dismiss the modal.
 */
export function isSourcesWelcomeLoadClose() {
    const m = store.state?.modal ?? store.value?.modal;
    return !!(m && typeof m === 'object' && m.fromOnboarding);
}

/**
 * After a successful load/plant/import in Biblioteca: close and show the canvas.
 * Uses `dismissModal` directly so `isSourcesDismissBlocked()` cannot leave the modal open
 * after the tree is already in memory.
 * @param {{ close?: (opts?: object) => void, updateContent?: () => void }} [_modal]
 */
export function finishSourcesLoadSession(_modal) {
    store.dismissModal({ returnToMore: false });
}
