import { getPanelRef } from '../app/panel-refs.js';
import { preloadSageModal } from '../shell-lazy-init.js';

/** @param {import('./shell-store.js').ShellStore} store */
export function nudgeSageHostOnStore(store) {
    if (typeof document === 'undefined') return;
    const el = getPanelRef('sage');
    if (el && typeof el.checkState === 'function') el.checkState();
}

/** @param {import('./shell-store.js').ShellStore} store */
export async function ensureSageHostReadyOnStore(store) {
    if (typeof document === 'undefined') return;
    try {
        await preloadSageModal();
    } catch (e) {
        console.error('[Arborito] Sage host sync failed', e);
    }
    nudgeSageHostOnStore(store);
}

/** @param {import('./shell-store.js').ShellStore} [_store] */
export function closeProgressWidgetIfOpenOnStore(_store) {
    if (typeof document === 'undefined') return;
    const pw = getPanelRef('progress-widget');
    if (!pw || !pw.isOpen) return;
    if (typeof pw.close === 'function') {
        pw.close();
        return;
    }
    pw.isOpen = false;
    pw.renderKey = null;
    if (typeof pw._scheduleRender === 'function') pw._scheduleRender();
}

/**
 * Open Sage (dock FAB, lesson shortcut, construction).
 * @param {import('./shell-store.js').ShellStore} store
 */
export function openSageModalOnStore(store, payload = { type: 'sage', mode: 'context', dockUi: true }) {
    closeProgressWidgetIfOpenOnStore(store);
    /* Lesson sage: fullbleed over the reader on mobile, not a dock hub sheet. */
    const modal =
        payload && payload.sageLessonContext ? { ...payload, dockUi: false } : payload;
    const patch = { modal };
    if (store.state.previewNode) patch.previewNode = null;
    store.update(patch);
    nudgeSageHostOnStore(store);
    void ensureSageHostReadyOnStore(store);
}
