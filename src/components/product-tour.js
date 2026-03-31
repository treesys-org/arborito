import { store } from '../store.js';
import { shouldShowMobileUI } from '../utils/breakpoints.js';

const TOUR_DONE_KEY = 'arborito-ui-tour-done';
const PAD = 10;

function queryTourTarget(target) {
    if (!target) return null;
    return document.querySelector(`[data-arbor-tour="${CSS.escape(target)}"]`);
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

class ArboritoProductTour extends HTMLElement {
    constructor() {
        super();
        this._active = false;
        this._index = 0;
        this._steps = [];
        this._force = false;
        this._raf = null;
        this._onStart = (e) => {
            const force = !!(e.detail && e.detail.force);
            this.tryStart({ force });
        };
        this._onResize = () => {
            if (this._active) this._scheduleLayout();
        };
        this._onState = () => {
            if (!this._active) return;
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
        window.addEventListener('resize', this._onResize);
        window.addEventListener('arborito-viewport', this._onResize);
        store.addEventListener('state-change', this._onState);
        document.addEventListener('keydown', this._onKeydown);
        document.addEventListener('focusin', this._onFocusIn, true);
    }

    disconnectedCallback() {
        window.removeEventListener('arborito-start-tour', this._onStart);
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
        this.setAttribute('aria-label', 'Product tour');
        this.innerHTML = `
            <div class="arborito-tour-shade arborito-tour-shade--top" aria-hidden="true"></div>
            <div class="arborito-tour-shade arborito-tour-shade--left" aria-hidden="true"></div>
            <div class="arborito-tour-shade arborito-tour-shade--right" aria-hidden="true"></div>
            <div class="arborito-tour-shade arborito-tour-shade--bottom" aria-hidden="true"></div>
            <div class="arborito-tour-ring" aria-hidden="true"></div>
            <div class="arborito-tour-tooltip">
                <div class="arborito-tour-tooltip__head">
                    <span class="arborito-tour-tooltip__mascot" aria-hidden="true">🦉</span>
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

    tryStart({ force = false } = {}) {
        if (this._active) return;
        if (store.value.modal || store.value.previewNode) return;
        if (!force && localStorage.getItem(TOUR_DONE_KEY)) return;

        const ui = store.ui;
        const desk = Array.isArray(ui.uiTourSteps) ? ui.uiTourSteps : [];
        const mob = Array.isArray(ui.uiTourStepsMobile) ? ui.uiTourStepsMobile : [];
        const steps = shouldShowMobileUI() ? mob : desk;
        if (!steps.length) return;

        this._force = force;
        this._steps = steps;
        this._index = 0;
        this._active = true;
        this.removeAttribute('hidden');
        document.documentElement.classList.add('arborito-product-tour-active');
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
        if (target === 'manual-menu') {
            this._setProfilePopoverOpen(true);
        } else {
            this._setProfilePopoverOpen(false);
        }
        this._applyStepText();
    }

    _applyStepText() {
        const step = this._steps[this._index];
        const ui = store.ui;
        const titleEl = this.querySelector('#arborito-tour-title');
        const bodyEl = this.querySelector('#arborito-tour-body');
        const progEl = this.querySelector('#arborito-tour-progress');
        if (titleEl) titleEl.textContent = (step && step.title) || '';
        if (bodyEl) bodyEl.textContent = (step && step.body) || '';
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
        if (this._index <= 0) return;
        this._index--;
        this._applyStep();
        this._scheduleLayout();
        queueMicrotask(() => this.querySelector('.js-tour-next')?.focus());
    }

    next() {
        if (this._index >= this._steps.length - 1) {
            this.finish({ markDone: true });
            return;
        }
        this._index++;
        this._applyStep();
        this._scheduleLayout();
        queueMicrotask(() => this.querySelector('.js-tour-next')?.focus());
    }

    finish({ markDone = false } = {}) {
        if (!this._active) return;
        this._active = false;
        this._setProfilePopoverOpen(false);
        if (markDone || !this._force) {
            localStorage.setItem(TOUR_DONE_KEY, 'true');
        }
        this.setAttribute('hidden', '');
        document.documentElement.classList.remove('arborito-product-tour-active');
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
