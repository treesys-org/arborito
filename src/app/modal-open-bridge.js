import {
    ensureModalChunk,
    EAGER_MODAL_TYPES,
    MODAL_EXPORT_NAMES,
} from './modal-chunk-loaders.js';
import { modalType } from '../shared/ui/modal-enter.js';

/** Prefetch lazy modal chunk when opening — UI spinner is `ModalChunkFallback` in `ModalHost`. */
export function armModalOpenLoading(modal) {
    if (!modal) return;
    const type = modalType(modal);
    if (!type || type === 'sage' || EAGER_MODAL_TYPES.has(type)) return;
    if (MODAL_EXPORT_NAMES[type]) {
        void ensureModalChunk(type);
    }
}

/** Hover / pointer intent on modal triggers. */
export function prefetchModalChunkOnIntent(type) {
    const key = String(type || '');
    if (!key || !MODAL_EXPORT_NAMES[key]) return;
    void ensureModalChunk(key);
}

/** Mobile More menu — warm common modal chunks on open / hover. */
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
        prefetchModalChunkOnIntent(type);
    }
}

/** Desktop profile popover — warm every entry before the user picks one. */
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
        prefetchModalChunkOnIntent(type);
    }
}

/** Construction nav — panel JS/CSS + construction modals. */
export function prefetchConstructionShellOnIntent() {
    if (typeof window !== 'undefined') {
        void import('../shell-lazy-init.js').then((m) => m.prefetchConstructionOnIntent());
    }
}
