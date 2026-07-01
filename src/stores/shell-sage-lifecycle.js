import { getPanelRef } from '../app/panel-refs.js';

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
        const { preloadSageModal } = await import('../shell-lazy-init.js');
        await preloadSageModal();
    } catch (e) {
        console.error('[Arborito] Sage host sync failed', e);
    }
    nudgeSageHostOnStore(store);
}

/** @param {import('./shell-store.js').ShellStore} store */
export function closeProgressWidgetIfOpenOnStore(store) {
    if (typeof document === 'undefined') return;
    const pw = getPanelRef('progress-widget');
    if (!pw || !pw.isOpen) return;
    pw.isOpen = false;
    pw.renderKey = null;
    document.documentElement.classList.remove('arborito-progress-modal-open');
    if (typeof pw._scheduleRender === 'function') pw._scheduleRender();
}

/**
 * Open Sage (dock FAB, lesson shortcut, construction).
 * @param {import('./shell-store.js').ShellStore} store
 */
export function openSageModalOnStore(store, payload = { type: 'sage', mode: 'context', dockUi: true }) {
    closeProgressWidgetIfOpenOnStore(store);
    const patch = { modal: payload };
    if (store.state.previewNode) patch.previewNode = null;
    store.update(patch);
    void ensureSageHostReadyOnStore(store);
}
