import { shouldShowMobileUI, isDesktopForestShell } from './breakpoints.js';
import {
    isMobileCertificatesHubOpen,
    isMobileDockHubOpen,
    isMobileDockTakeover,
    isMobileConstructionDockHubOpen,
    isFromOnboardingDockGapTakeover,
} from './mobile-fullbleed-modals.js';
import { armPostClosePointerGuard } from '../../stores/shell-dialog-lifecycle.js';

/** Skip arming on the first tree-home rise (boot / first paint), not a sheet close. */
let _ghostChromeArmPrimed = false;
/** Last `opts.mobileMoreOpen` seen (browse More or construction More). */
let _prevMobileMoreOpen = false;

/**
 * Mobile: `<html>` class when only the course map is visible (no lesson, modal, or “More” sheet).
 * CSS hides floating profile/theme and the course card; lowers z-index under modals.
 *
 * `arborito-mob-first-run-gate`: hide dock + profile/theme until the user loads or creates
 * a tree (`isSourcesDismissBlocked`), including while Sage or the picker tour is open.
 *
 * Ghost-click consolidation (MODAL_STANDARDS §8c): when chrome under mobile Back becomes
 * hittable again (or a dock sheet closes while Courses stayed live), arm the shared guard
 * here so More / Search / Arcade / … do not each need a manual armPostClosePointerGuard.
 *
 * @param {{ state: object, isSourcesDismissBlocked?: () => boolean }} store
 * @param {{ mobileMoreOpen?: boolean }} [opts], “More” sheet open state (not on `store.state`).
 */
export function syncMobileTreeShellClass(store, opts = {}) {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const prevTreeHome = root.classList.contains('arborito-mob-tree-home');
    const prevDockModal = root.classList.contains('arborito-mob-dock-modal-open');
    const prevLesson = root.classList.contains('arborito-lesson-open');
    const prevFullbleed = root.classList.contains('arborito-fullbleed-sheet-open');

    const s = store?.state ?? store;
    const lessonOpen = !!(s && typeof s === 'object' && (s.selectedNode || s.previewNode));
    root.classList.toggle('arborito-lesson-open', lessonOpen);

    const mobUi = shouldShowMobileUI();
    const deskForestOnly = isDesktopForestShell();
    if (deskForestOnly || !mobUi) {
        root.classList.remove('arborito-mob-tree-home');
        root.classList.remove('arborito-mob-first-run-gate');
        root.classList.remove('arborito-fullbleed-sheet-open');
        root.classList.remove('arborito-sage-lesson-overlay');
        root.classList.remove('arborito-mob-dock-modal-open');
        _prevMobileMoreOpen = false;
        return;
    }
    if (!s || typeof s !== 'object') return;
    const anyModal = !!s.modal || !!s.modalOverlay;
    const dockTakeover = isMobileDockTakeover(s, mobUi);
    const certificatesHub = isMobileCertificatesHubOpen(s, mobUi);
    const explore = s.viewMode === 'explore';
    /* Browse More (opts) or construction More (html class — store sync only sees sidebar). */
    const moreOpen =
        opts.mobileMoreOpen === true || root.classList.contains('arborito-construction-more-open');
    const moreJustClosed = _prevMobileMoreOpen && !moreOpen;
    _prevMobileMoreOpen = moreOpen;
    const on = explore && !lessonOpen && !anyModal && !moreOpen && !dockTakeover && !certificatesHub;
    root.classList.toggle('arborito-mob-tree-home', on);
    root.classList.toggle('arborito-fullbleed-sheet-open', dockTakeover);

    const m = s.modal;
    const mt = m && (typeof m === 'string' ? m : m.type);
    const modalObj = m && typeof m === 'object' ? m : null;

    /* No tree loaded yet: hide dock and top chrome until a curriculum is chosen
     * (onboarding, nested Accesibilidad/App from welcome, locked-trees, etc.). */
    const sourcesBlocked =
        typeof store.isSourcesDismissBlocked === 'function' && store.isSourcesDismissBlocked();
    const fromOnboardingNest = isFromOnboardingDockGapTakeover(modalObj);
    const firstRunGate =
        mt === 'onboarding' ||
        fromOnboardingNest ||
        !!(modalObj && modalObj.fromOnboarding) ||
        sourcesBlocked ||
        (s.treeHydrating && !s.data);
    root.classList.toggle('arborito-mob-first-run-gate', !!firstRunGate);

    /* Sage from a lesson (“Pregunta al sabio”): fullbleed over the reader, dock hidden. */
    const sageLessonOverlay =
        mt === 'sage' && modalObj && !!modalObj.sageLessonContext && !modalObj.dockUi;
    root.classList.toggle('arborito-sage-lesson-overlay', !!sageLessonOverlay);

    /* Dock stays above dock-gap sheets (Profile, Search, Language…) and hub tabs.
     * Never while nested from first-run onboarding dock-gap prefs (those are takeovers). */
    const hubFromMap = isMobileDockHubOpen(s, mobUi) && !(modalObj && modalObj.fromMobileMore);
    const constructionDockHub = isMobileConstructionDockHubOpen(s, mobUi);
    const dockGapSheet =
        mt === 'profile' ||
        mt === 'backup' ||
        mt === 'about' ||
        mt === 'language' ||
        mt === 'download-app' ||
        mt === 'celebration-prefs' ||
        mt === 'accessibility-prefs' ||
        mt === 'preview' ||
        mt === 'node-properties' ||
        mt === 'search';
    const isDockModal =
        !!s.modal &&
        !moreOpen &&
        !sourcesBlocked &&
        !fromOnboardingNest &&
        !lessonOpen &&
        !sageLessonOverlay &&
        (mt === 'sage' ||
            hubFromMap ||
            constructionDockHub ||
            dockGapSheet ||
            ((mt === 'search' || mt === 'arcade' || mt === 'sources') && modalObj && modalObj.dockUi));
    root.classList.toggle('arborito-mob-dock-modal-open', !!isDockModal);

    const nextTreeHome = root.classList.contains('arborito-mob-tree-home');
    const nextDockModal = root.classList.contains('arborito-mob-dock-modal-open');
    const nextLesson = root.classList.contains('arborito-lesson-open');
    const nextFullbleed = root.classList.contains('arborito-fullbleed-sheet-open');
    /*
     * Arm when a sheet actually closed — not on first boot tree-home paint
     * (!prevTreeHome && nextTreeHome alone would eat the first map tap for 550ms).
     */
    const treeHomeRevealAfterOverlay =
        _ghostChromeArmPrimed && !prevTreeHome && nextTreeHome;
    if (
        moreJustClosed ||
        treeHomeRevealAfterOverlay ||
        (prevDockModal && !nextDockModal) ||
        (prevLesson && !nextLesson) ||
        (prevFullbleed && !nextFullbleed)
    ) {
        armPostClosePointerGuard(550);
    }
    _ghostChromeArmPrimed = true;
}
