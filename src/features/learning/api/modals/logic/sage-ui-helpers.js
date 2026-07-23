export const SAGE_OPEN = 'arborito-sage--open';

export function sageHideDismissButton() {
    return false;
}

/** Avoid `{ ...'sage' }` spreading a string into numeric keys when syncing modal state. */
export function normalizeSageModal(modal, patch = {}) {
    const base =
        modal == null
            ? {}
            : typeof modal === 'string'
              ? { type: modal }
              : { ...modal };
    return { ...base, type: 'sage', ...patch };
}
