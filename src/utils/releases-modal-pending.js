/** Marca que el siguiente loadData completo debe abrir el modal de versiones (cambio de snapshot/archivo). */

const KEY = 'arborito-pending-releases-modal';

export function markPendingReleasesModal() {
    try {
        sessionStorage.setItem(KEY, '1');
    } catch {
        /* ignore */
    }
}

export function consumePendingReleasesModal() {
    try {
        if (sessionStorage.getItem(KEY) === '1') {
            sessionStorage.removeItem(KEY);
            return true;
        }
    } catch {
        /* ignore */
    }
    return false;
}
