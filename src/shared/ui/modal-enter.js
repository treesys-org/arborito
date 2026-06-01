import { shouldShowMobileUI } from './breakpoints.js';

/** @param {unknown} modal */
export function modalType(modal) {
    if (!modal) return null;
    return typeof modal === 'string' ? modal : modal.type;
}

/** Dock pill modals (search / sage / arcade / profile) that share the bottom chrome. */
function isDockTabModal(modal) {
    const t = modalType(modal);
    if (!t) return false;
    if (t === 'sage') {
        if (typeof modal === 'object' && modal.sageLessonContext) return false;
        return true;
    }
    if (t === 'profile') return shouldShowMobileUI();
    if (t === 'search' || t === 'arcade') {
        return typeof modal === 'object' && !!modal.dockUi;
    }
    return false;
}

/** Modal opened from More / construction More / sources back-stack — no dock slide. */
function isInternalStackNav(modal) {
    if (!modal || typeof modal !== 'object') return false;
    return !!(modal.fromMobileMore || modal.fromConstructionMore || modal.fromSources);
}

/** Slide-in when opening a dock tab from the map (not when swapping tabs or drilling More). */
export function shouldAnimateDockEnter(prevModal, nextModal) {
    if (!isDockTabModal(nextModal)) return false;
    if (isInternalStackNav(nextModal)) return false;
    if (isDockTabModal(prevModal)) return false;
    if (isInternalStackNav(prevModal)) return false;
    return true;
}

/**
 * Enter animation for `modalShellHtml` based on what was open before.
 * @param {unknown} prevModal
 * @param {unknown} nextModal
 * @param {{ layout?: string }} [opts]
 * @returns {{ instantOpen: boolean, enter: string, dockSwap?: boolean }}
 */
export function resolveModalShellEnter(prevModal, nextModal, opts = {}) {
    const layout = opts.layout;
    const isDockLayout = layout === 'dock' || layout === 'dock-bottom';

    if (isInternalStackNav(nextModal)) {
        return { instantOpen: true, enter: 'instant' };
    }

    if (isDockTabModal(prevModal) && isDockTabModal(nextModal)) {
        const swapping = modalType(prevModal) !== modalType(nextModal);
        return { instantOpen: true, enter: 'instant', dockSwap: swapping };
    }

    if (isDockLayout) {
        if (!prevModal || (!isDockTabModal(prevModal) && !isInternalStackNav(prevModal))) {
            return { instantOpen: false, enter: 'dock' };
        }
        return { instantOpen: true, enter: 'instant' };
    }

    if (prevModal && nextModal) {
        return { instantOpen: true, enter: 'fade-fast' };
    }
    return { instantOpen: false, enter: 'fade-fast' };
}
