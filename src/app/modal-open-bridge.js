import {
    ensureModalChunk,
    EAGER_MODAL_TYPES,
    MODAL_EXPORT_NAMES,
} from './modal-chunk-loaders.js';
import { modalType } from '../shared/ui/modal-enter.js';
import { prefetchConstructionOnIntent } from '../shell-lazy-init.js';
import { prefetchModal } from './modal-open.js';

export { openModal, openModalWhenReady, prefetchModal, isModalReady } from './modal-open.js';

/** Prefetch lazy modal chunk when opening, UI spinner is `ModalChunkFallback` in `ModalHost`. */
export function armModalOpenLoading(modal) {
    if (!modal) return;
    const type = modalType(modal);
    if (!type || type === 'sage' || EAGER_MODAL_TYPES.has(type)) return;
    if (MODAL_EXPORT_NAMES[type]) {
        void ensureModalChunk(type);
    }
}

/** Mobile More menu, warm common modal chunks on open / hover. */
export function prefetchMobileMenuModalChunks() {
    for (const type of [
        'forum',
        'sources',
        'certificates',
        'about',
        'language',
        'celebration-prefs',
        'accessibility-prefs',
        'download-app',
        'privacy',
        'backup',
    ]) {
        prefetchModal(type);
    }
}

/** Desktop profile popover, warm every entry before the user picks one. */
export function prefetchProfileMenuOnIntent() {
    for (const type of [
        'profile',
        'privacy',
        'backup',
        'celebration-prefs',
        'accessibility-prefs',
        'download-app',
        'language',
    ]) {
        prefetchModal(type);
    }
}

/** Construction nav, panel JS/CSS + construction modals. */
export function prefetchConstructionShellOnIntent() {
    void prefetchConstructionOnIntent();
    for (const type of ['contributor', 'construction-curriculum-lang', 'construction-history']) {
        prefetchModal(type);
    }
}
