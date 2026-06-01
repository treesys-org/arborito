import { store } from '../../core/store.js';
import { shouldShowMobileUI } from '../../shared/ui/breakpoints.js';

const TOUR_DONE_KEY = 'arborito-ui-tour-done';
const TOUR_DONE_KEY_CONSTRUCTION = 'arborito-ui-tour-done-construction';
const TOUR_DONE_KEY_LESSON_EDIT = 'arborito-ui-tour-done-lesson-edit';
/** After Sources-only tour: dock/graph tour is scheduled when a tree loads. */
const SHELL_TOUR_PENDING_KEY = 'arborito-ui-tour-shell-pending-v1';
const PAD = 10;

function queryTourTarget(target) {
    if (!target) return null;
    const sel = `[data-arbor-tour="${CSS.escape(target)}"]`;
    let el = document.querySelector(sel);
    if (el && rectForElement(el)) return el;
    if (target === 'graph-root') {
        el = document.querySelector('[data-arbor-tour="graph"]');
        if (el && rectForElement(el)) return el;
    }
    if (target === 'graph') {
        el = document.querySelector('[data-arbor-tour="graph-root"]');
        if (el && rectForElement(el)) return el;
    }
    return document.querySelector(sel);
}

function stepHasTarget(step) {
    if (!(step && step.target)) return false;
    return !!queryTourTarget(step.target);
}

function rectForElement(el) {
    if (!el || !el.getBoundingClientRect) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 2 && r.height < 2) return null;
    return r;
}

function fallbackRect() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const rw = Math.min(w * 0.72, 520);
    const rh = Math.min(h * 0.5, 380);
    return new DOMRect((w - rw) / 2, (h - rh) / 2, rw, rh);
}

/** @param {{ title?: string, body?: string, target?: string }} step */
function cloneTourStep(step) {
    if (!step || typeof step !== 'object') return null;
    return {
        target: String(step.target || ''),
        title: String(step.title || ''),
        body: String(step.body || '')
    };
}

class ArboritoProductTour extends HTMLElement {
    constructor() {
        super();
        this._active = false;
        this._index = 0;
        this._steps = [];
        this._force = false;
        this._mode = 'default'; // 'default' | 'construction' | 'lesson-edit'
        /** After onboarding / no tree: tour only in Sources picker. */
        this._sourcesPickerOnlyTour = false;
        /** Retries when opening Sources / waiting for `sources-pick-tree` step DOM. */
        this._skipDockOpenRetry = 0;
        this._skipDockStepsRetry = 0;
        /** Retries while waiting for construction-panel / lesson-editor anchors to appear. */
        this._anchorWaitRetry = 0;
        this._raf = null;
        this._i18nTourWaitBound = false;
        this._onStart = (e) => {
            const force = !!(e.detail && e.detail.force);
            const skipDockForOpenTrees = !!(e.detail && e.detail.skipDockForOpenTrees);
            let mode = e.detail && e.detail.mode ? String(e.detail.mode) : 'default';
            if (mode === 'default' && store.value.constructionMode) {
                mode = 'construction';
            }
            this.tryStart({ force, mode, skipDockForOpenTrees });
        };
        this._onLessonEditEnter = () => {
            try {
                if (localStorage.getItem(TOUR_DONE_KEY_LESSON_EDIT)) return;
            } catch {
                /* ignore */
            }
            if (this._active) return;
            /* Wait a frame so the lesson editor DOM is attached before we measure anchors. */
            queueMicrotask(() => this.tryStart({ mode: 'lesson-edit' }));
        };
        this._onResize = () => {
            if (this._active) this._scheduleLayout();
        };
        this._onState = () => {
            if (!this._active) return;
            const modal = store.value.modal;
            const modalType = typeof modal === 'string' ? modal : modal?.type;
            const sourcesPickerOnly = this._sourcesPickerOnlyTour;
            /* Default shell tour: no modal. Sources-picker tour keeps running while modal === sources. */
            if (store.value.modal || store.state.modalOverlay) {
                if (
                    sourcesPickerOnly &&
                    modalType === 'sources' &&
                    !store.state.modalOverlay
                ) {
                    this._syncCopyFromStore();
                    this._scheduleLayout();
                    return;
                }
                this.finish({ markDone: false });
                return;
            }
            if (sourcesPickerOnly) {
                /* Sources modal closed (tree loaded, dismissed): end picker tour, queue shell tour. */
                this.finish({ markDone: false });
                return;
            }
            // If the user enters/leaves construction while a tour is open, switch tours immediately.
            // This prevents showing the default tour ("El mapa de conocimiento") inside construction.
            const isConstruction = !!store.value.constructionMode;
            if (this._mode === 'default' && isConstruction) {
                this.finish({ markDone: false });
                queueMicrotask(() => this.tryStart({ force: true, mode: 'construction' }));
                return;
            }
            if (this._mode === 'construction' && !isConstruction) {
                this.finish({ markDone: false });
                return;
            }
            if (this._mode === 'lesson-edit' && !isConstruction) {
                this.finish({ markDone: false });
                return;
            }
            this._syncCopyFromStore();
            this._scheduleLayout();
        };
        this._onKeydown = (e) => {
            if (!this._active) return;
            if (e.key === 'Escape') {
                e.preventDefault();
                this.finish({ markDone: true });
            }
        };
        this._onFocusIn = (e) => {
            if (!this._active) return;
            const m0 = store.value.modal;
            const mt0 = typeof m0 === 'string' ? m0 : m0?.type;
            const inSources = this._inSourcesContinuationPhase() && mt0 === 'sources';
            if (!inSources) {
                if (store.value.modal || store.state.modalOverlay) return;
            }
            const t = e.target;
            if (t && typeof t.closest === 'function') {
                if (!inSources && t.closest('arborito-modals')) return;
                if (t.closest('arborito-modal-overlay-host')) return;
            }
            const tip = this.querySelector('.arborito-tour-tooltip');
            if (!tip || tip.contains(e.target)) return;
            e.preventDefault();
            const btn = tip.querySelector('.arborito-tour-btn');
            if (btn) btn.focus();
        };
    }

    connectedCallback() {
        if (!this._built) this._buildDom();
        window.addEventListener('arborito-start-tour', this._onStart);
        window.addEventListener('arborito-lesson-edit-enter', this._onLessonEditEnter);
        window.addEventListener('resize', this._onResize);
        window.addEventListener('arborito-viewport', this._onResize);
        store.addEventListener('state-change', this._onState);
        document.addEventListener('keydown', this._onKeydown);
        document.addEventListener('focusin', this._onFocusIn, true);
    }

    disconnectedCallback() {
        window.removeEventListener('arborito-start-tour', this._onStart);
        window.removeEventListener('arborito-lesson-edit-enter', this._onLessonEditEnter);
        window.removeEventListener('resize', this._onResize);
        window.removeEventListener('arborito-viewport', this._onResize);
        store.removeEventListener('state-change', this._onState);
        document.removeEventListener('keydown', this._onKeydown);
        document.removeEventListener('focusin', this._onFocusIn, true);
    }

    _buildDom() {
        this._built = true;
        this.setAttribute('hidden', '');
        this.setAttribute('role', 'dialog');
        this.setAttribute('aria-modal', 'true');
        this.setAttribute('aria-label', 'Tour');
        this.innerHTML = `
            <div class="arborito-tour-shade arborito-tour-shade--top" aria-hidden="true"></div>
            <div class="arborito-tour-shade arborito-tour-shade--left" aria-hidden="true"></div>
            <div class="arborito-tour-shade arborito-tour-shade--right" aria-hidden="true"></div>
            <div class="arborito-tour-shade arborito-tour-shade--bottom" aria-hidden="true"></div>
            <div class="arborito-tour-ring" aria-hidden="true"></div>
            <div class="arborito-tour-tooltip">
                <div class="arborito-tour-tooltip__head">
                    <span id="arborito-tour-mascot" class="arborito-tour-tooltip__mascot" aria-hidden="true">🦉</span>
                    <div class="arborito-tour-tooltip__titles">
                        <h2 class="arborito-tour-tooltip__title" id="arborito-tour-title"></h2>
                    </div>
                </div>
                <p class="arborito-tour-tooltip__body" id="arborito-tour-body" aria-live="polite"></p>
                <p class="arborito-tour-tooltip__progress" id="arborito-tour-progress" aria-hidden="true"></p>
                <div class="arborito-tour-tooltip__actions">
                    <button type="button" class="arborito-tour-btn arborito-tour-btn--ghost js-tour-skip"></button>
                    <div class="arborito-tour-tooltip__nav">
                        <button type="button" class="arborito-tour-btn arborito-tour-btn--ghost js-tour-prev"></button>
                        <button type="button" class="arborito-tour-btn arborito-tour-btn--primary js-tour-next"></button>
                    </div>
                </div>
            </div>`;

        this.querySelector('.js-tour-skip').onclick = () => this.finish({ markDone: true });
        this.querySelector('.js-tour-prev').onclick = () => this.prev();
        this.querySelector('.js-tour-next').onclick = () => this.next();
    }

    _inSourcesContinuationPhase() {
        if (!this._active || this._mode !== 'default') return false;
        if (this._sourcesPickerOnlyTour) {
            const modal = store.value.modal;
            const modalType = typeof modal === 'string' ? modal : modal?.type;
            return modalType === 'sources';
        }
        return false;
    }

    tryStart({ force = false, mode = 'default', skipDockForOpenTrees = false } = {}) {
        if (this._active) return;

        const m =
            mode === 'construction'
                ? 'construction'
                : mode === 'lesson-edit'
                  ? 'lesson-edit'
                  : 'default';
        const isConstruction = !!store.value.constructionMode;
        // Default tour never runs in construction. Construction / lesson-edit need construction.
        if (m === 'default' && isConstruction) return;
        if (m === 'construction' && !isConstruction) return;
        if (m === 'lesson-edit' && !isConstruction) return;

        /*
         * "Pick your first tree" tour (sources picker):
         * - Triggered explicitly with `skipDockForOpenTrees: true` AND no tree loaded.
         * - Opens the Sources modal and pins the tour to the `sources-pick-tree` card.
         * - When the user dismisses the modal or actually loads a tree, the tour ends
         *   and we schedule the shell tour (graph-root) via SHELL_TOUR_PENDING_KEY.
         */
        const treeAlreadyLoaded = !!(store.state.data || store.state.rawGraphData);
        const skipDock = !!skipDockForOpenTrees && m === 'default' && !treeAlreadyLoaded;
        if (!skipDock) {
            this._sourcesPickerOnlyTour = false;
            this._skipDockOpenRetry = 0;
            this._skipDockStepsRetry = 0;
        }

        const modal0 = store.value.modal;
        const modalType0 = typeof modal0 === 'string' ? modal0 : modal0?.type;
        const overlayBlocking = !!(store.value.previewNode || store.state.modalOverlay);

        if (skipDock) {
            if (overlayBlocking) return;
            if (modalType0 !== 'sources') {
                try {
                    store.setModal({ type: 'sources' });
                } catch {
                    /* ignore */
                }
                if (this._skipDockOpenRetry < 28) {
                    this._skipDockOpenRetry += 1;
                    setTimeout(() => this.tryStart({ force, mode, skipDockForOpenTrees: true }), 90);
                }
                return;
            }
        } else if (store.value.modal || store.value.previewNode || store.state.modalOverlay) {
            return;
        }

        const doneKey =
            m === 'construction'
                ? TOUR_DONE_KEY_CONSTRUCTION
                : m === 'lesson-edit'
                  ? TOUR_DONE_KEY_LESSON_EDIT
                  : TOUR_DONE_KEY;
        if (!force && localStorage.getItem(doneKey)) return;

        const ui = store.ui;

        if (skipDock) {
            this._skipDockOpenRetry = 0;
            const sp = Array.isArray(ui.uiTourStepsSourcesPicker) ? ui.uiTourStepsSourcesPicker : [];
            const mapped = sp.map((s) => cloneTourStep(s)).filter(Boolean);
            const stepsOnly = mapped.filter(stepHasTarget);
            if (!stepsOnly.length) {
                if (this._skipDockStepsRetry < 30) {
                    this._skipDockStepsRetry += 1;
                    setTimeout(() => this.tryStart({ force, mode, skipDockForOpenTrees: true }), 120);
                    return;
                }
                this._skipDockStepsRetry = 0;
                /* DOM never appeared (slow render, slow network). Defer to shell tour after tree load. */
                try {
                    localStorage.setItem(SHELL_TOUR_PENDING_KEY, 'true');
                } catch {
                    /* ignore */
                }
                return;
            }
            this._skipDockStepsRetry = 0;
            this._force = force;
            this._mode = m;
            this._steps = stepsOnly;
            this._sourcesPickerOnlyTour = true;
            this._index = 0;
            this._active = true;
            this.setAttribute('aria-label', ui.tourAriaLabel || ui.navManual || 'Tour');
            this.removeAttribute('hidden');
            document.documentElement.classList.add('arborito-product-tour-sources-picker');
            const mascot = this.querySelector('#arborito-tour-mascot');
            if (mascot) mascot.textContent = '📚';
            this._setProfilePopoverOpen(false);
            this._bindStepChrome();
            this._applyStep();
            this._scheduleLayout();
            queueMicrotask(() => {
                const n = this.querySelector('.js-tour-next');
                if (n) n.focus();
            });
            return;
        }
        const desk = Array.isArray(ui.uiTourSteps) ? ui.uiTourSteps : [];
        const mob = Array.isArray(ui.uiTourStepsMobile) ? ui.uiTourStepsMobile : [];
        const deskCon = Array.isArray(ui.uiTourStepsConstruction) ? ui.uiTourStepsConstruction : [];
        const mobCon = Array.isArray(ui.uiTourStepsConstructionMobile) ? ui.uiTourStepsConstructionMobile : [];
        const lessonEdit = Array.isArray(ui.uiTourStepsLessonEdit) ? ui.uiTourStepsLessonEdit : [];

        const rawSteps =
            m === 'lesson-edit'
                ? lessonEdit
                : m === 'construction'
                  ? shouldShowMobileUI() ? mobCon : deskCon
                  : shouldShowMobileUI()
                    ? mob
                    : desk;
        const steps = rawSteps.filter((s) => stepHasTarget(s));
        if (!steps.length) {
            if (!store.state.i18nData && !this._i18nTourWaitBound) {
                this._i18nTourWaitBound = true;
                const cleanup = () => {
                    store.removeEventListener('state-change', onLang);
                    clearTimeout(failsafe);
                    this._i18nTourWaitBound = false;
                };
                const onLang = () => {
                    if (!store.state.i18nData) return;
                    cleanup();
                    this.tryStart({ force, mode: m });
                };
                store.addEventListener('state-change', onLang);
                const failsafe = setTimeout(cleanup, 15000);
                return;
            }
            /* Construction / lesson-edit anchors are wired by sibling custom elements
             * (construction-panel, lesson editor) that render asynchronously after the
             * mode flips. If their DOM hasn't shown up yet, poll a few frames before
             * giving up so the tour does not silently drop on entry. */
            if ((m === 'construction' || m === 'lesson-edit') && this._anchorWaitRetry < 30) {
                this._anchorWaitRetry += 1;
                setTimeout(() => this.tryStart({ force, mode: m }), 100);
                return;
            }
            this._anchorWaitRetry = 0;
            return;
        }
        this._anchorWaitRetry = 0;

        this._force = force;
        this._mode = m;
        this._steps = steps;
        this._index = 0;
        this._active = true;
        this.setAttribute('aria-label', ui.tourAriaLabel || ui.navManual || 'Tour');
        this.removeAttribute('hidden');
        const mascot = this.querySelector('#arborito-tour-mascot');
        if (mascot)
            mascot.textContent =
                m === 'construction' ? '🦉⛑️' : m === 'lesson-edit' ? '🦉📋' : '🦉';
        this._setProfilePopoverOpen(false);
        this._bindStepChrome();
        this._applyStep();
        this._scheduleLayout();
        queueMicrotask(() => {
            const n = this.querySelector('.js-tour-next');
            if (n) n.focus();
        });
    }

    _syncCopyFromStore() {
        if (!this._active) return;
        const ui = store.ui;
        this.setAttribute('aria-label', ui.tourAriaLabel || ui.navManual || 'Tour');
        this._bindStepChrome();
        this._applyStepText();
    }

    _bindStepChrome() {
        const ui = store.ui;
        const skip = this.querySelector('.js-tour-skip');
        const prev = this.querySelector('.js-tour-prev');
        const next = this.querySelector('.js-tour-next');
        if (skip) skip.textContent = ui.tourSkip || 'Skip';
        if (prev) prev.textContent = ui.tourPrev || 'Back';
        const last = this._index >= this._steps.length - 1;
        if (next) {
            next.textContent = last ? ui.tourDone || 'Done' : ui.tourNext || 'Next';
            next.classList.toggle('arborito-tour-btn--primary', !last);
            next.classList.toggle('arborito-tour-btn--done', last);
        }
    }

    _applyStep() {
        const step = this._steps[this._index];
        const target = step && step.target;
        this._setProfilePopoverOpen(false);
        this._applyStepText();
    }

    _applyStepText() {
        if (!this._active) return;
        const step = this._steps[this._index];
        const ui = store.ui;
        const titleEl = this.querySelector('#arborito-tour-title');
        const bodyEl = this.querySelector('#arborito-tour-body');
        const progEl = this.querySelector('#arborito-tour-progress');
        const mascotEl = this.querySelector('#arborito-tour-mascot');

        if (titleEl) titleEl.textContent = (step && step.title) || '';
        if (bodyEl) bodyEl.textContent = (step && step.body) || '';

        if (mascotEl && step) {
            /* Step-specific mascot emoji reinforces tour copy (clock, cloud, construction owl, etc.). */
            let m =
                this._mode === 'construction'
                    ? '🦉⛑️'
                    : this._mode === 'lesson-edit'
                      ? '🦉📋'
                      : '🦉';
            const t = step.target;
            if (t === 'graph-root') m = '🌳';
            else if (t === 'graph' || t === 'mob-home' || t === 'home') m = '🗺️';
            else if (t === 'arcade' || t === 'mob-arcade') m = '🎮';
            else if (t === 'construct') m = '🏗️';
            else if (t === 'search' || t === 'mob-search') m = '🔍';
            else if (t === 'profile' || t === 'mob-profile') m = '🎒';
            else if (t === 'sage-fab' || t === 'mob-sage') m = '🦉';
            else if (t === 'sources' || t === 'sources-pick-tree') m = '📚';
            else if (t === 'con-undo') m = '🕒';
            else if (t === 'con-exit') m = '⬅️';
            else if (t === 'con-more') m = '🧰';
            else if (t === 'con-lang') m = '🌐';
            else if (t === 'con-info') m = 'ℹ️';
            else if (t === 'con-gov') m = '👥';
            else if (t === 'con-publish') m = '🚀';
            else if (t === 'cloud-sync') m = '☁️';
            else if (t === 'mob-progress') m = '📊';
            else if (t === 'mob-theme') m = '🌓';
            /* Construction-mode Sage mascot: same owl as study mode with a hard hat. */
            else if (t === 'con-ai') m = '🦉⛑️';
            else if (t === 'lesson-edit-meta') m = '📝';
            else if (t === 'lesson-edit-toolbar') m = '🧰';
            else if (t === 'lesson-edit-insert') m = '➕';
            else if (t === 'lesson-edit-quiz') m = '📋';
            else if (t === 'lesson-edit-wizard') m = '🎯';
            else if (t === 'lesson-edit-arcade') m = '🎮';
            else if (t === 'lesson-edit-save') m = '💾';
            else if (!t) m = '👋';
            mascotEl.textContent = m;
        }

        if (progEl) {
            const tmpl = ui.tourStepIndicator || 'Step {n} of {total}';
            progEl.textContent = tmpl
                .replace('{n}', String(this._index + 1))
                .replace('{total}', String(this._steps.length));
        }
        this._bindStepChrome();
    }

    _setProfilePopoverOpen(open) {
        const wrap = document.querySelector('.arborito-desktop-profile-wrap');
        if (!wrap) return;
        wrap.classList.toggle('arborito-tour-popover-open', !!open);
    }

    prev() {
        if (this._sourcesPickerOnlyTour && this._index <= 0) {
            this.finish({ markDone: true });
            return;
        }
        if (this._index <= 0) return;
        this._index--;
        this._applyStep();
        this._scheduleLayout();
        queueMicrotask(() => { const btn = this.querySelector('.js-tour-next'); if (btn) btn.focus(); });
    }

    next() {
        if (this._index >= this._steps.length - 1) {
            /* Sources-only tour ends without marking the full tour done; shell tour starts after tree load. */
            this.finish({ markDone: !this._sourcesPickerOnlyTour });
            return;
        }
        this._index++;
        this._applyStep();
        this._scheduleLayout();
        queueMicrotask(() => { const btn = this.querySelector('.js-tour-next'); if (btn) btn.focus(); });
    }

    finish({ markDone = false } = {}) {
        if (!this._active) return;
        const wasSourcesPickerOnlyTour = this._sourcesPickerOnlyTour;
        const finishingMode = this._mode;
        this._active = false;
        this._sourcesPickerOnlyTour = false;
        this._skipDockOpenRetry = 0;
        this._skipDockStepsRetry = 0;
        this._setProfilePopoverOpen(false);

        if (wasSourcesPickerOnlyTour && !markDone) {
            try {
                localStorage.setItem(SHELL_TOUR_PENDING_KEY, 'true');
            } catch {
                /* ignore */
            }
            /* If tree was already loaded, we do not wait for another mount. */
            queueMicrotask(() => {
                if (typeof store.maybeScheduleShellProductTourAfterTree === 'function') {
                    store.maybeScheduleShellProductTourAfterTree();
                }
            });
        }

        if (markDone) {
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
        this.setAttribute('hidden', '');
        document.documentElement.classList.remove('arborito-product-tour-sources-picker');
        if (this._raf != null) {
            cancelAnimationFrame(this._raf);
            this._raf = null;
        }
    }

    _scheduleLayout() {
        if (this._raf != null) cancelAnimationFrame(this._raf);
        this._raf = requestAnimationFrame(() => {
            this._raf = null;
            this._layout();
        });
    }

    _layout() {
        if (!this._active) return;
        const step = this._steps[this._index];
        const el = step ? queryTourTarget(step.target) : null;
        if (el && typeof el.scrollIntoView === 'function') {
            try {
                el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
            } catch {
                try {
                    el.scrollIntoView({ block: 'center', inline: 'nearest' });
                } catch {
                    el.scrollIntoView();
                }
            }
        }
        let r = rectForElement(el);
        if (!r) r = fallbackRect();

        const t = Math.max(0, r.top - PAD);
        const l = Math.max(0, r.left - PAD);
        const right = Math.min(window.innerWidth, r.right + PAD);
        const bottom = Math.min(window.innerHeight, r.bottom + PAD);
        const w = Math.max(0, right - l);
        const h = Math.max(0, bottom - t);

        const shades = {
            top: this.querySelector('.arborito-tour-shade--top'),
            left: this.querySelector('.arborito-tour-shade--left'),
            right: this.querySelector('.arborito-tour-shade--right'),
            bottom: this.querySelector('.arborito-tour-shade--bottom'),
            ring: this.querySelector('.arborito-tour-ring'),
        };

        if (shades.top) {
            shades.top.style.top = '0';
            shades.top.style.left = '0';
            shades.top.style.width = '100%';
            shades.top.style.height = `${t}px`;
        }
        if (shades.left) {
            shades.left.style.top = `${t}px`;
            shades.left.style.left = '0';
            shades.left.style.width = `${l}px`;
            shades.left.style.height = `${h}px`;
        }
        if (shades.right) {
            shades.right.style.top = `${t}px`;
            shades.right.style.left = `${l + w}px`;
            shades.right.style.width = `${Math.max(0, window.innerWidth - l - w)}px`;
            shades.right.style.height = `${h}px`;
        }
        if (shades.bottom) {
            shades.bottom.style.top = `${t + h}px`;
            shades.bottom.style.left = '0';
            shades.bottom.style.width = '100%';
            shades.bottom.style.height = `${Math.max(0, window.innerHeight - t - h)}px`;
        }
        if (shades.ring) {
            shades.ring.style.top = `${t}px`;
            shades.ring.style.left = `${l}px`;
            shades.ring.style.width = `${w}px`;
            shades.ring.style.height = `${h}px`;
        }

        const tip = this.querySelector('.arborito-tour-tooltip');
        if (!tip) return;
        tip.style.visibility = 'hidden';
        const tw = tip.offsetWidth || 320;
        const th = tip.offsetHeight || 200;
        const margin = 12;
        let ty = bottom + margin;
        if (ty + th > window.innerHeight - margin) {
            ty = t - th - margin;
        }
        if (ty < margin) ty = margin;
        let tx = l + w / 2 - tw / 2;
        tx = Math.max(margin, Math.min(window.innerWidth - tw - margin, tx));
        tip.style.top = `${ty}px`;
        tip.style.left = `${tx}px`;
        tip.style.visibility = '';
    }
}

customElements.define('arborito-product-tour', ArboritoProductTour);

