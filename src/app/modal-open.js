import { getArboritoStore } from '../core/store-singleton.js';
import { setModalOnStore } from '../stores/shell-modal-lifecycle.js';
import {
    chunkIsReady,
    ensureModalChunk,
    EAGER_MODAL_TYPES,
    MODAL_EXPORT_NAMES,
} from './modal-chunk-loaders.js';
import { modalType } from '../shared/ui/modal-enter.js';

/** Canonical modal open, prefetch + arm loading happen in `setModalOnStore`. */
export function openModal(modal) {
    const store = getArboritoStore();
    if (!store) return;
    setModalOnStore(store, modal);
}

/** Warm a lazy modal chunk (hover / pointer intent). No-op for eager types. */
export function prefetchModal(type) {
    const key = String(type || '');
    if (!key || !MODAL_EXPORT_NAMES[key] || EAGER_MODAL_TYPES.has(key)) return;
    void ensureModalChunk(key);
}

/** Whether the modal route can render without waiting on a lazy chunk. */
export function isModalReady(modalOrType) {
    const type =
        typeof modalOrType === 'string'
            ? modalOrType
            : modalOrType
              ? modalType(modalOrType)
              : null;
    if (!type || type === 'sage') return true;
    if (EAGER_MODAL_TYPES.has(type)) return true;
    return chunkIsReady(type);
}

/** Await lazy chunk when needed, then open. Eager modals open synchronously. */
export async function openModalWhenReady(modal) {
    const type = modal ? modalType(modal) : null;
    if (type && MODAL_EXPORT_NAMES[type] && !EAGER_MODAL_TYPES.has(type)) {
        await ensureModalChunk(type);
    }
    openModal(modal);
}
