import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    useState,
} from 'react';
import { useTourStore, useTour } from './useTour.js';
import { useArboritoStore } from '../../../app/hooks/useArboritoStore.js';
import { useRegisterPanel } from '../../../app/hooks/useRegisterPanel.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { resolveReadAloudUi } from '../../learning/api/a11y-prefs.js';
import { speakText } from '../../learning/api/read-aloud.js';
import {
    cloneTourStep,
    isLessonEditTourContextReady,
    stepHasTarget,
} from '../api/product-tour-targets.js';
import { flushPendingTourStarts } from '../api/product-tour-start-bridge.js';
import {
    TOUR_DONE_KEY,
    TOUR_DONE_KEY_CONSTRUCTION,
    TOUR_DONE_KEY_LESSON_EDIT,
    TOUR_DONE_KEY_SOURCES_PICKER,
    SHELL_TOUR_PENDING_KEY,
    EMPTY_LAYOUT,
    mascotForTarget,
    defaultMascotForMode,
    computeLayout,
    setProfilePopoverOpen,
    syncSourcesPickerTabForStep,
    inSourcesContinuationPhase,
} from '../api/logic/product-tour-steps.js';

export function useProductTour() {
    const store = useTourStore();
    const { ui: appUi } = useTour();
const [active, setActive] = useState(false);
    const [index, setIndex] = useState(0);
    const [steps, setSteps] = useState([]);
    const [mode, setMode] = useState('default');
    const [sourcesPickerOnlyTour, setSourcesPickerOnlyTour] = useState(false);
    const [stepping, setStepping] = useState(false);
    const [layout, setLayout] = useState(EMPTY_LAYOUT);
    const [mascotKey, setMascotKey] = useState('🦉');

    const forceRef = useRef(false);
    const tryStartTimerRef = useRef(null);
    const rafRef = useRef(null);
    const layoutRafRef = useRef(null);
    const stateLayoutTimerRef = useRef(null);
    const skipDockOpenRetryRef = useRef(0);
    const skipDockStepsRetryRef = useRef(0);
    const anchorWaitRetryRef = useRef(0);
    const modalWaitRetryRef = useRef(0);
    const i18nTourWaitBoundRef = useRef(false);
    const lastSpokenStepRef = useRef(-1);
    const lastMascotKeyRef = useRef('');
    const tipRef = useRef(null);
    const nextBtnRef = useRef(null);
    const panelApiRef = useRef({});

    const tourStateRef = useRef({});
    tourStateRef.current = {
        active,
        index,
        steps,
        mode,
        sourcesPickerOnlyTour,
    };

    const clearTryStartTimer = useCallback(() => {
        if (tryStartTimerRef.current != null) {
            clearTimeout(tryStartTimerRef.current);
            tryStartTimerRef.current = null;
        }
    }, []);

    const layoutNow = useCallback(({ animate = false } = {}) => {
        const { active: isActive, index: idx, steps: tourSteps } = tourStateRef.current;
        if (!isActive) return;
        const step = tourSteps[idx];
        if (!animate) setStepping(true);
        setLayout(computeLayout(step, tipRef.current, { smoothScroll: animate }));
        if (!animate) {
            if (layoutRafRef.current != null) cancelAnimationFrame(layoutRafRef.current);
            layoutRafRef.current = requestAnimationFrame(() => {
                layoutRafRef.current = null;
                setStepping(false);
            });
        }
    }, []);

    const scheduleLayout = useCallback(() => {
        if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
            rafRef.current = null;
            const { active: isActive, index: idx } = tourStateRef.current;
            layoutNow({ animate: isActive && idx > 0 });
        });
    }, [layoutNow]);

    const maybeSpeakTourStep = useCallback((step, stepIndex) => {
        if (!step || lastSpokenStepRef.current === stepIndex) return;
        if (!resolveReadAloudUi()) return;
        lastSpokenStepRef.current = stepIndex;
        const title = String(step.title || '').replace(/<[^>]+>/g, ' ').trim();
        const body = String(step.body || '').replace(/<[^>]+>/g, ' ').trim();
        const text = [title, body].filter(Boolean).join('. ');
        if (text) void speakText(text);
    }, []);

    const updateMascot = useCallback((step, tourMode, pickerOnly) => {
        if (!step) return;
        const m =
            mascotForTarget(tourMode, step.target) ||
            defaultMascotForMode(tourMode, pickerOnly);
        if (m !== lastMascotKeyRef.current) {
            lastMascotKeyRef.current = m;
            setMascotKey(m);
        }
    }, []);

    const finish = useCallback(({ markDone = false } = {}) => {
        const {
            active: isActive,
            mode: finishingMode,
            sourcesPickerOnlyTour: wasSourcesPickerOnlyTour,
        } = tourStateRef.current;
        if (!isActive) return;

        setActive(false);
        setSourcesPickerOnlyTour(false);
        skipDockOpenRetryRef.current = 0;
        skipDockStepsRetryRef.current = 0;
        setProfilePopoverOpen(false);

        if (wasSourcesPickerOnlyTour) {
            try {
                localStorage.setItem(TOUR_DONE_KEY_SOURCES_PICKER, 'true');
            } catch {
                /* ignore */
            }
        }

        if (wasSourcesPickerOnlyTour && !markDone) {
            try {
                localStorage.setItem(SHELL_TOUR_PENDING_KEY, 'true');
            } catch {
                /* ignore */
            }
            queueMicrotask(() => {
                if (typeof store.maybeScheduleShellProductTourAfterTree === 'function') {
                    store.maybeScheduleShellProductTourAfterTree();
                }
            });
        }

        let done = markDone;
        if (done && wasSourcesPickerOnlyTour) done = false;

        if (done) {
            if (finishingMode === 'construction') {
                try {
                    localStorage.setItem(TOUR_DONE_KEY_CONSTRUCTION, 'true');
                } catch {
                    /* ignore */
                }
            } else if (finishingMode === 'lesson-edit') {
                try {
                    localStorage.setItem(TOUR_DONE_KEY_LESSON_EDIT, 'true');
                } catch {
                    /* ignore */
                }
            } else {
                try {
                    localStorage.setItem(TOUR_DONE_KEY, 'true');
                } catch {
                    /* ignore */
                }
                try {
                    localStorage.removeItem(SHELL_TOUR_PENDING_KEY);
                } catch {
                    /* ignore */
                }
            }
        }

        document.documentElement.classList.remove('arborito-product-tour-sources-picker');
        if (rafRef.current != null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
        if (layoutRafRef.current != null) {
            cancelAnimationFrame(layoutRafRef.current);
            layoutRafRef.current = null;
        }
        if (stateLayoutTimerRef.current) {
            clearTimeout(stateLayoutTimerRef.current);
            stateLayoutTimerRef.current = null;
        }
        clearTryStartTimer();
        setStepping(false);
    }, [clearTryStartTimer]);

    const applyStepText = useCallback(() => {
        const { active: isActive, index: idx, steps: tourSteps, mode: tourMode, sourcesPickerOnlyTour: pickerOnly } =
            tourStateRef.current;
        if (!isActive) return;
        const step = tourSteps[idx];
        updateMascot(step, tourMode, pickerOnly);
        maybeSpeakTourStep(step, idx);
    }, [maybeSpeakTourStep, updateMascot]);

    const startTour = useCallback(({ tourSteps, tourMode, force, pickerOnly }) => {
        forceRef.current = force;
        setMode(tourMode);
        setSteps(tourSteps);
        setSourcesPickerOnlyTour(!!pickerOnly);
        setIndex(0);
        setActive(true);
        lastSpokenStepRef.current = -1;
        lastMascotKeyRef.current = '';
        setMascotKey(pickerOnly ? '📚' : defaultMascotForMode(tourMode, false));
        if (pickerOnly) {
            document.documentElement.classList.add('arborito-product-tour-sources-picker');
        }
        setProfilePopoverOpen(false);
    }, []);

    const scheduleTryStart = useCallback(
        (detail, delayMs) => {
            clearTryStartTimer();
            tryStartTimerRef.current = setTimeout(() => {
                tryStartTimerRef.current = null;
                panelApiRef.current.tryStart?.(detail);
            }, delayMs);
        },
        [clearTryStartTimer]
    );

    const tryStart = useCallback(
        ({ force = false, mode: startMode = 'default', skipDockForOpenTrees = false } = {}) => {
            if (tourStateRef.current.active) return;

            const m =
                startMode === 'construction' ? 'construction'
                : startMode === 'lesson-edit' ? 'lesson-edit'
                : 'default';
            const isConstruction = !!store.value.constructionMode;
            if (m === 'default' && isConstruction) return;
            if (m === 'construction' && !isConstruction) return;
            if (m === 'lesson-edit' && !isConstruction) return;
            if (m === 'lesson-edit' && !isLessonEditTourContextReady()) return;

            const treeAlreadyLoaded = !!(store.state.data || store.state.rawGraphData);
            const skipDock =
                !!skipDockForOpenTrees && m === 'default' && (!treeAlreadyLoaded || force);
            if (!skipDock) {
                setSourcesPickerOnlyTour(false);
                skipDockOpenRetryRef.current = 0;
                skipDockStepsRetryRef.current = 0;
            }

            const modal0 = store.value.modal;
            const modalType0 = typeof modal0 === 'string' ? modal0 : modal0?.type;
            const overlayBlocking = !!(store.value.previewNode || store.state.modalOverlay);

            if (skipDock) {
                if (!force) {
                    try {
                        if (localStorage.getItem(TOUR_DONE_KEY_SOURCES_PICKER)) return;
                    } catch {
                        return;
                    }
                }
                if (overlayBlocking) return;
                if (modalType0 !== 'sources') {
                    try {
                        store.setModal({ type: 'sources' });
                    } catch {
                        /* ignore */
                    }
                    if (skipDockOpenRetryRef.current < 28) {
                        skipDockOpenRetryRef.current += 1;
                        setTimeout(
                            () => panelApiRef.current.tryStart?.({ force, mode: startMode, skipDockForOpenTrees: true }),
                            90
                        );
                    }
                    return;
                }
            } else if (store.value.modal || store.value.previewNode || store.state.modalOverlay) {
                if ((m === 'construction' || m === 'lesson-edit') && modalWaitRetryRef.current < 40) {
                    if (m === 'lesson-edit' && !isLessonEditTourContextReady()) {
                        modalWaitRetryRef.current = 0;
                        return;
                    }
                    modalWaitRetryRef.current += 1;
                    scheduleTryStart({ force, mode: m }, 120);
                    return;
                }
                return;
            }
            modalWaitRetryRef.current = 0;

            const doneKey =
                m === 'construction' ? TOUR_DONE_KEY_CONSTRUCTION
                : m === 'lesson-edit' ? TOUR_DONE_KEY_LESSON_EDIT
                : TOUR_DONE_KEY;
            if (!force) {
                try {
                    if (localStorage.getItem(doneKey)) return;
                } catch {
                    return;
                }
            }

            const ui = store?.ui ?? appUi ?? {};

            if (skipDock) {
                skipDockOpenRetryRef.current = 0;
                const sp = Array.isArray(ui.uiTourStepsSourcesPicker) ? ui.uiTourStepsSourcesPicker : [];
                const mapped = sp.map((s) => cloneTourStep(s)).filter(Boolean);
                if (!sp.length) {
                    if (!i18nTourWaitBoundRef.current) {
                        i18nTourWaitBoundRef.current = true;
                        const cleanup = () => {
                            store.removeEventListener('state-change', onLang);
                            clearTimeout(failsafe);
                            i18nTourWaitBoundRef.current = false;
                        };
                        const onLang = () => {
                            const pickerSteps = store.ui?.uiTourStepsSourcesPicker;
                            if (!Array.isArray(pickerSteps) || !pickerSteps.length) return;
                            cleanup();
                            panelApiRef.current.tryStart?.({ force, mode: startMode, skipDockForOpenTrees: true });
                        };
                        store.addEventListener('state-change', onLang);
                        const failsafe = setTimeout(cleanup, 15000);
                    }
                    return;
                }
                if (!mapped.length || !stepHasTarget(mapped[0])) {
                    if (skipDockStepsRetryRef.current < 30) {
                        skipDockStepsRetryRef.current += 1;
                        setTimeout(
                            () => panelApiRef.current.tryStart?.({ force, mode: startMode, skipDockForOpenTrees: true }),
                            120
                        );
                        return;
                    }
                    skipDockStepsRetryRef.current = 0;
                    try {
                        localStorage.setItem(SHELL_TOUR_PENDING_KEY, 'true');
                    } catch {
                        /* ignore */
                    }
                    return;
                }
                skipDockStepsRetryRef.current = 0;
                startTour({ tourSteps: mapped, tourMode: m, force, pickerOnly: true });
                return;
            }

            const desk = Array.isArray(ui.uiTourSteps) ? ui.uiTourSteps : [];
            const mob = Array.isArray(ui.uiTourStepsMobile) ? ui.uiTourStepsMobile : [];
            const deskCon = Array.isArray(ui.uiTourStepsConstruction) ? ui.uiTourStepsConstruction : [];
            const mobCon = Array.isArray(ui.uiTourStepsConstructionMobile) ? ui.uiTourStepsConstructionMobile : [];
            const lessonEdit = Array.isArray(ui.uiTourStepsLessonEdit) ? ui.uiTourStepsLessonEdit : [];

            const rawSteps =
                m === 'lesson-edit' ? lessonEdit
                : m === 'construction' ? (shouldShowMobileUI() ? mobCon : deskCon)
                : shouldShowMobileUI() ? mob : desk;
            const tourSteps = rawSteps.filter((s) => stepHasTarget(s));
            if (!tourSteps.length) {
                if (!store.state.i18nData && !i18nTourWaitBoundRef.current) {
                    i18nTourWaitBoundRef.current = true;
                    const cleanup = () => {
                        store.removeEventListener('state-change', onLang);
                        clearTimeout(failsafe);
                        i18nTourWaitBoundRef.current = false;
                    };
                    const onLang = () => {
                        if (!store.state.i18nData) return;
                        cleanup();
                        panelApiRef.current.tryStart?.({ force, mode: m });
                    };
                    store.addEventListener('state-change', onLang);
                    const failsafe = setTimeout(cleanup, 15000);
                    return;
                }
                if ((m === 'construction' || m === 'lesson-edit') && anchorWaitRetryRef.current < 30) {
                    if (m === 'lesson-edit' && !isLessonEditTourContextReady()) {
                        anchorWaitRetryRef.current = 0;
                        return;
                    }
                    anchorWaitRetryRef.current += 1;
                    scheduleTryStart({ force, mode: m }, 100);
                    return;
                }
                anchorWaitRetryRef.current = 0;
                return;
            }
            anchorWaitRetryRef.current = 0;
            modalWaitRetryRef.current = 0;
            startTour({ tourSteps, tourMode: m, force, pickerOnly: false });
        },
        [scheduleTryStart, startTour]
    );

    const prev = useCallback(() => {
        const { sourcesPickerOnlyTour: pickerOnly, index: idx } = tourStateRef.current;
        if (pickerOnly && idx <= 0) {
            finish({ markDone: false });
            return;
        }
        if (idx <= 0) return;
        setIndex((i) => i - 1);
    }, [finish]);

    const next = useCallback(() => {
        const { index: idx, steps: tourSteps, sourcesPickerOnlyTour: pickerOnly } = tourStateRef.current;
        if (idx >= tourSteps.length - 1) {
            finish({ markDone: !pickerOnly });
            return;
        }
        setIndex((i) => i + 1);
    }, [finish]);

    const syncCopyFromStore = useCallback(() => {
        if (!tourStateRef.current.active) return;
        applyStepText();
    }, [applyStepText]);

    panelApiRef.current = {
        get _active() {
            return tourStateRef.current.active;
        },
        tryStart,
        finish,
        prev,
        next,
        syncStepText: applyStepText,
        _applyStepText: applyStepText,
        syncCopyFromStore,
    };

    useRegisterPanel('product-tour', () => panelApiRef.current);

    useEffect(() => {
        flushPendingTourStarts(panelApiRef.current);
    }, []);

    const scheduleLessonEditTourStart = useCallback(
        (attempt = 0) => {
            clearTryStartTimer();
            const tick = () => {
                if (!isLessonEditTourContextReady()) {
                    if (attempt < 24) {
                        tryStartTimerRef.current = setTimeout(
                            () => scheduleLessonEditTourStart(attempt + 1),
                            80
                        );
                    }
                    return;
                }
                panelApiRef.current.tryStart?.({ mode: 'lesson-edit' });
            };
            requestAnimationFrame(() => requestAnimationFrame(tick));
        },
        [clearTryStartTimer]
    );

    useEffect(() => {
        const onLessonEditEnter = () => {
            try {
                if (localStorage.getItem(TOUR_DONE_KEY_LESSON_EDIT)) return;
            } catch {
                /* ignore */
            }
            if (tourStateRef.current.active) return;
            scheduleLessonEditTourStart();
        };
        const onLessonEditCancel = () => {
            clearTryStartTimer();
            modalWaitRetryRef.current = 0;
            anchorWaitRetryRef.current = 0;
            if (tourStateRef.current.active && tourStateRef.current.mode === 'lesson-edit') {
                finish({ markDone: false });
            }
        };
        const onStoreLessonClose = () => {
            if (store.value.selectedNode) return;
            onLessonEditCancel();
        };
        const onResize = () => {
            if (tourStateRef.current.active) scheduleLayout();
        };
        const onEmojiReady = () => {
            if (tourStateRef.current.active) applyStepText();
        };
        const onState = () => {
            if (!tourStateRef.current.active) return;
            const modal = store.value.modal;
            const modalType = typeof modal === 'string' ? modal : modal?.type;
            const pickerOnly = tourStateRef.current.sourcesPickerOnlyTour;
            if (store.value.modal || store.state.modalOverlay) {
                if (pickerOnly && modalType === 'sources' && !store.state.modalOverlay) {
                    syncCopyFromStore();
                    scheduleLayout();
                    return;
                }
                finish({ markDone: false });
                return;
            }
            if (pickerOnly) {
                finish({ markDone: false });
                return;
            }
            const isConstruction = !!store.value.constructionMode;
            if (tourStateRef.current.mode === 'default' && isConstruction) {
                finish({ markDone: false });
                queueMicrotask(() => panelApiRef.current.tryStart?.({ force: true, mode: 'construction' }));
                return;
            }
            if (tourStateRef.current.mode === 'construction' && !isConstruction) {
                finish({ markDone: false });
                return;
            }
            if (tourStateRef.current.mode === 'lesson-edit' && !isConstruction) {
                finish({ markDone: false });
                return;
            }
            syncCopyFromStore();
            if (stateLayoutTimerRef.current) clearTimeout(stateLayoutTimerRef.current);
            stateLayoutTimerRef.current = setTimeout(() => {
                stateLayoutTimerRef.current = null;
                scheduleLayout();
            }, 120);
        };
        const onKeydown = (e) => {
            if (!tourStateRef.current.active) return;
            if (e.key === 'Escape') {
                e.preventDefault();
                finish({ markDone: !tourStateRef.current.sourcesPickerOnlyTour });
            }
        };
        const onFocusIn = (e) => {
            if (!tourStateRef.current.active) return;
            const m0 = store.value.modal;
            const mt0 = typeof m0 === 'string' ? m0 : m0?.type;
            const inSources = inSourcesContinuationPhase(
                tourStateRef.current.active,
                tourStateRef.current.mode,
                tourStateRef.current.sourcesPickerOnlyTour
            ) && mt0 === 'sources';
            if (!inSources) {
                if (store.value.modal || store.state.modalOverlay) return;
            }
            const t = e.target;
            if (t && typeof t.closest === 'function') {
                if (!inSources && t.closest('[data-arborito-panel="modals"]')) return;
                if (t.closest('[data-arborito-panel="modal-overlay-host"]')) return;
            }
            const tip = tipRef.current;
            if (!tip || tip.contains(e.target)) return;
            e.preventDefault();
            nextBtnRef.current?.focus();
        };

        window.addEventListener('arborito-lesson-edit-enter', onLessonEditEnter);
        window.addEventListener('arborito-lesson-edit-cancel', onLessonEditCancel);
        store.addEventListener('state-change', onStoreLessonClose);
        window.addEventListener('resize', onResize);
        window.addEventListener('arborito-viewport', onResize);
        window.addEventListener('arborito-emoji-ready', onEmojiReady);
        store.addEventListener('state-change', onState);
        document.addEventListener('keydown', onKeydown);
        document.addEventListener('focusin', onFocusIn, true);

        return () => {
            window.removeEventListener('arborito-lesson-edit-enter', onLessonEditEnter);
            window.removeEventListener('arborito-lesson-edit-cancel', onLessonEditCancel);
            store.removeEventListener('state-change', onStoreLessonClose);
            window.removeEventListener('resize', onResize);
            window.removeEventListener('arborito-viewport', onResize);
            window.removeEventListener('arborito-emoji-ready', onEmojiReady);
            store.removeEventListener('state-change', onState);
            document.removeEventListener('keydown', onKeydown);
            document.removeEventListener('focusin', onFocusIn, true);
        };
    }, [
        applyStepText,
        clearTryStartTimer,
        finish,
        scheduleLayout,
        scheduleLessonEditTourStart,
        syncCopyFromStore,
    ]);

    useEffect(() => {
        if (!active) return;
        const step = steps[index];
        const tabSwitched = syncSourcesPickerTabForStep(step, sourcesPickerOnlyTour);
        setProfilePopoverOpen(false);
        applyStepText();
        if (tabSwitched) {
            requestAnimationFrame(() => scheduleLayout());
        } else if (step?.target === 'graph-root') {
            requestAnimationFrame(() => requestAnimationFrame(() => scheduleLayout()));
        }
        nextBtnRef.current?.focus();
    }, [active, index, steps, sourcesPickerOnlyTour, applyStepText, scheduleLayout]);

    useLayoutEffect(() => {
        if (!active) return;
        layoutNow({ animate: index > 0 });
    }, [active, index, steps, layoutNow]);

    const ui = store?.ui ?? appUi ?? {};
    const step = steps[index];
    const total = steps.length;
    const single = total <= 1;
    const first = index <= 0;
    const last = index >= total - 1;
    const ariaLabel = ui.tourAriaLabel || ui.navManual || 'Tour';

    return {
        active,
        stepping,
        layout,
        tipRef,
        nextBtnRef,
        step,
        mascotKey,
        ui,
        index,
        total,
        single,
        first,
        last,
        ariaLabel,
        sourcesPickerOnlyTour,
        finish,
        prev,
        next,
    };
}
