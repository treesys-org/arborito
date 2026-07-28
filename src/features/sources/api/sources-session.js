import { getArboritoStore as store } from '../../../core/store-singleton.js';
import { getPanelRef } from '../../../app/panel-refs.js';

/**
 * Biblioteca UI is open: desktop/web modal, or mobile More-menu embed
 * (`ModalSources` mounted — `store.state.modal` is often not `'sources'` there).
 * @param {{ state?: object, value?: object }|null|undefined} [s]
 */
export function isBibliotecaUiOpen(s = store) {
    const m = s?.state?.modal ?? s?.value?.modal;
    if (m && (m === 'sources' || (typeof m === 'object' && m.type === 'sources'))) return true;
    return !!getPanelRef('modal-sources');
}

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
 * @param {{ close?: (opts?: object) => void, updateContent?: () => void, isConnected?: boolean }} [modal]
 * @param {{ hadCurriculumBeforeLoad?: boolean }} [opts]
 */
export function finishSourcesLoadSession(modal, { hadCurriculumBeforeLoad = false } = {}) {
    if (hadCurriculumBeforeLoad && !isSourcesWelcomeLoadClose()) return;
    /* Stale modalApi after leaving Biblioteca mid-load must not dismiss another modal. */
    if (modal && modal.isConnected === false) return;
    if (!isBibliotecaUiOpen()) return;
    if (typeof modal?.close === 'function') {
        modal.close({ returnToMore: false });
        return;
    }
    store.dismissModal({ returnToMore: false });
}
