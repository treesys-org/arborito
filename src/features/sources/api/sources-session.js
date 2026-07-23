import { getArboritoStore as store } from '../../../core/store-singleton.js';

/**
 * Biblioteca was opened from onboarding/welcome (`modal.fromOnboarding`).
 * Only then should a successful load/plant dismiss the modal even if a tree was already open.
 */
export function isSourcesWelcomeLoadClose() {
    const m = store.state?.modal ?? store.value?.modal;
    return !!(m && typeof m === 'object' && m.fromOnboarding);
}

/** Snapshot whether a curriculum was mounted before a Biblioteca load action. */
export function captureHadCurriculumBeforeLoad() {
    const s = store.state ?? store.value;
    return !!s?.data;
}

/**
 * After a successful load/plant/import in Biblioteca: close and show the canvas when
 * appropriate (first tree / onboarding). Keep the modal open when the user loaded
 * another tree or branch while a curriculum was already on the canvas.
 * @param {{ close?: (opts?: object) => void, updateContent?: () => void }} [_modal]
 * @param {{ hadCurriculumBeforeLoad?: boolean }} [opts]
 */
export function finishSourcesLoadSession(_modal, { hadCurriculumBeforeLoad = false } = {}) {
    if (hadCurriculumBeforeLoad && !isSourcesWelcomeLoadClose()) return;
    store.dismissModal({ returnToMore: false });
}
