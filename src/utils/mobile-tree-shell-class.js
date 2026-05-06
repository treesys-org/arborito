import { shouldShowMobileUI } from './breakpoints.js';

/**
 * Mobile: `<html>` class when only the course map is visible (no lesson, modal, or “More” sheet).
 * CSS hides floating profile/theme and the course card; lowers z-index under modals.
 *
 * `arborito-mob-first-run-gate`: bottom dock sits above modal backdrop z-index; hide it during
 * onboarding and the non-dismissible Trees step until a tree is chosen (matches desktop chrome).
 *
 * @param {{ state: object, isSourcesDismissBlocked?: () => boolean }} store
 * @param {{ mobileMoreOpen?: boolean }} [opts] — “More” sheet open state (not on `store.state`).
 */
export function syncMobileTreeShellClass(store, opts = {}) {
    if (typeof document === 'undefined') return;
    const mobUi = shouldShowMobileUI();
    const deskForestOnly =
        document.documentElement.classList.contains('arborito-desktop') && !mobUi;
    if (deskForestOnly || !mobUi) {
        document.documentElement.classList.remove('arborito-mob-tree-home');
        document.documentElement.classList.remove('arborito-mob-first-run-gate');
        return;
    }
    const s = store.state;
    const lessonOpen = !!(s.selectedNode || s.previewNode);
    const anyModal = !!s.modal || !!s.modalOverlay;
    const explore = s.viewMode === 'explore';
    const moreOpen = opts.mobileMoreOpen === true;
    const on = explore && !lessonOpen && !anyModal && !moreOpen;
    document.documentElement.classList.toggle('arborito-mob-tree-home', on);

    const m = s.modal;
    const mt = m && (typeof m === 'string' ? m : m.type);
    const firstRunGate =
        mt === 'onboarding' ||
        (mt === 'sources' &&
            typeof store.isSourcesDismissBlocked === 'function' &&
            store.isSourcesDismissBlocked());
    document.documentElement.classList.toggle('arborito-mob-first-run-gate', !!firstRunGate);
}
