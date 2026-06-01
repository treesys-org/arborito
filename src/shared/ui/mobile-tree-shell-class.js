import { shouldShowMobileUI } from './breakpoints.js';

/**
 * Mobile: `<html>` class when only the course map is visible (no lesson, modal, or “More” sheet).
 * CSS hides floating profile/theme and the course card; lowers z-index under modals.
 *
 * `arborito-mob-first-run-gate`: hide dock + profile/theme until the user loads or creates
 * a tree (`isSourcesDismissBlocked`), including while Sage or the picker tour is open.
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
    document.documentElement.classList.toggle('arborito-lesson-open', lessonOpen);

    const m = s.modal;
    const mt = m && (typeof m === 'string' ? m : m.type);
    const modalObj = m && typeof m === 'object' ? m : null;

    /* No tree loaded yet: hide dock and top chrome until a curriculum is chosen
     * (onboarding, locked-trees screen, Sage during the tour, etc.). */
    const sourcesBlocked =
        typeof store.isSourcesDismissBlocked === 'function' && store.isSourcesDismissBlocked();
    const firstRunGate = mt === 'onboarding' || sourcesBlocked || (s.treeHydrating && !s.data);
    document.documentElement.classList.toggle('arborito-mob-first-run-gate', !!firstRunGate);

    /* Sage from a lesson (“Pregunta al sabio”): fullbleed over the reader, dock hidden. */
    const sageLessonOverlay =
        mt === 'sage' && modalObj && !!modalObj.sageLessonContext;
    document.documentElement.classList.toggle('arborito-sage-lesson-overlay', !!sageLessonOverlay);

    /* Dock pill stays visible only for dock-tab modals opened from the map (not lesson sage, not More).
     * Perfil y Mi Progreso son pantalla completa — no cuentan como dock-modal. */
    const isDockModal =
        !!s.modal &&
        !moreOpen &&
        !sourcesBlocked &&
        !lessonOpen &&
        !sageLessonOverlay &&
        (mt === 'sage' ||
            ((mt === 'search' || mt === 'arcade') && modalObj && modalObj.dockUi));
    document.documentElement.classList.toggle('arborito-mob-dock-modal-open', !!isDockModal);
}
