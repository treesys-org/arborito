import { getPanelRef } from '../app/panel-refs.js';

const CERTS_CHROME_SEL =
    '#modal-backdrop.arborito-modal--certificates-hub, #browse-dock-hub-backdrop, #browse-dock-hub-sheet';

function hideCertificatesChromeNow() {
    try {
        if (typeof document === 'undefined') return;
        document.querySelectorAll(CERTS_CHROME_SEL).forEach((el) => {
            el.style.setProperty('display', 'none');
        });
    } catch {
        /* ignore */
    }
}

function clearCertificatesChromeHide() {
    try {
        if (typeof document === 'undefined') return;
        document.querySelectorAll(CERTS_CHROME_SEL).forEach((el) => {
            el.style.removeProperty('display');
        });
    } catch {
        /* ignore */
    }
}

/** @param {import('./shell-store.js').ShellStore} store */
export function leaveCertificatesViewOnStore(store, opts = {}) {
    if (store.state.viewMode !== 'certificates') return;
    const fromMore = store.state.certificatesFromMobileMore;
    const returnToMore = opts.returnToMore !== false;

    /* Hide chrome immediately — React unmount of the list can lag. */
    hideCertificatesChromeNow();

    store.update({
        viewMode: 'explore',
        certificatesFromMobileMore: false,
        ...(store.state.modal?.type === 'certificate' ? { modal: null } : {}),
    });
    if (fromMore && returnToMore) {
        const reopen = () => {
            const sb = getPanelRef('sidebar');
            if (sb && typeof sb.openMobileMoreMenu === 'function') sb.openMobileMoreMenu();
        };
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(reopen);
        else reopen();
    }
}

/** @param {import('./shell-store.js').ShellStore} store */
export function setViewModeOnStore(store, viewMode, options = {}) {
    if (viewMode === 'certificates') {
        /* Shell opens instantly; list fills in background (spinner if cold). */
        clearCertificatesChromeHide();
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
