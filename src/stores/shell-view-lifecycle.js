import { getPanelRef } from '../app/panel-refs.js';

/** @param {import('./shell-store.js').ShellStore} store */
export function leaveCertificatesViewOnStore(store, opts = {}) {
    if (store.state.viewMode !== 'certificates') return;
    const fromMore = store.state.certificatesFromMobileMore;
    const returnToMore = opts.returnToMore !== false;
    if (fromMore && returnToMore) {
        const sb = getPanelRef('sidebar');
        if (sb && typeof sb.openMobileMoreMenu === 'function') sb.openMobileMoreMenu();
    }
    store.update({ viewMode: 'explore', certificatesFromMobileMore: false });
}

/** @param {import('./shell-store.js').ShellStore} store */
export function setViewModeOnStore(store, viewMode, options = {}) {
    if (viewMode === 'certificates') {
        store.update({
            viewMode: 'certificates',
            modal: null,
            certificatesFromMobileMore: !!options.fromMobileMore,
        });
        return;
    }
    if (viewMode === 'explore' && store.state.viewMode === 'certificates') {
        leaveCertificatesViewOnStore(store, options);
        return;
    }
    store.update({ viewMode });
}
