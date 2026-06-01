import { store } from '../../../core/store.js';
import { bindMobileTap } from '../../../shared/ui/mobile-tap.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { fetchLocalePack } from '../../../core/i18n-runtime.js';
import { modalShellHtml } from '../../../shared/ui/modal-shell.js';
import { welcomeMixin } from './onboarding-mixins/welcome-mixin.js';
import { languageMixin } from './onboarding-mixins/language-mixin.js';
import { chooseMixin } from './onboarding-mixins/choose-mixin.js';
import { signinMixin } from './onboarding-mixins/signin-mixin.js';
import { escHtml as esc } from '../../../shared/lib/html-escape.js';

const ONBOARDING_SEEN_KEY = 'arborito-onboarding-seen-v1';
const TOTAL_STEPS = 3;

/**
 * First-run onboarding wizard.
 *
 * Three logical steps (the third one is the Trees picker — a different modal —
 * because rebuilding the full search / directory UI inside the wizard would
 * duplicate ~2.8k lines from `sources.js`):
 *
 *   1. Welcome + language picker.
 *   2. Session: sign in, register, or continue without an account. All three
 *      sub-flows are inline panels so the user never leaves the wizard while
 *      making the choice. Register shows the freshly-generated secret and
 *      the CTA copy itself doubles as the data-loss acknowledgement
 *      ("I saved it — continue"); a checkbox is intentionally avoided
 *      because Arborito's design system has no styled variant and native
 *      checkboxes are poor on mobile.
 *   3. Trees picker (`{ type: 'sources' }`) — opened on completion. The user
 *      can pick / create / import a tree there; the existing `isSourcesDismissBlocked`
 *      gate keeps it open until they actually have a curriculum loaded.
 *
 * The whole flow is non-dismissable from inside the wizard (no × on the
 * shell, Escape is ignored for `type === 'onboarding'` in `modals.js`). Only
 * an explicit choice on step 2 advances out of the wizard, mirroring the
 * previous single-screen onboarding's behaviour.
 *
 * The class is a thin shell: per-step rendering and wiring lives in mixin
 * modules under `./onboarding-mixins/` (see the `Object.assign` at the
 * bottom). The shell owns lifecycle, top-level render orchestration, the
 * navbar, theming, step navigation, and `_complete()`.
 */
class ArboritoModalOnboarding extends HTMLElement {
    constructor() {
        super();
        /** @type {1|2} */
        this._step = 1;
        /** @type {'choose'|'login'|'register'|'registered'} — only meaningful when `_step === 2`. */
        this._sessionView = 'choose';
        this._sessionUsername = '';
        this._sessionSecret = '';
        /** @type {{ username: string, plainSecret: string, qrDataUrl: string }|null} */
        this._registerResult = null;
        this._busy = false;
        this._error = '';
        /** @type {string[]} - Suggested free usernames when current is taken. */
        this._usernameSuggestions = [];
        this._suggestTimer = null;
        this._lastLang = '';
        this._lastTheme = '';
    }

    connectedCallback() {
        this._lastLang = store.state.lang;
        this._lastTheme = store.state.theme;
        /* If `store.setModal({ type: 'onboarding', step: 2 })` was used (a
         * returning user who skipped before — see `store.js#initialize`),
         * jump straight to the session step. Otherwise we start at the
         * welcome screen as on the first-ever visit. The `step` payload is
         * read once and not honoured on later re-renders so the user's own
         * Back navigation still works. */
        try {
            const m = store.value && store.value.modal;
            if (m && typeof m === 'object' && Number(m.step) === 2) {
                this._step = 2;
                /* `view` lets a returning sub-view (e.g. cancel from the QR
                 * scanner) drop the user back where they were. Default to
                 * the choice screen. */
                const v = m.view;
                this._sessionView =
                    v === 'login' || v === 'register' || v === 'registered' ? v : 'choose';
            }
        } catch {
            /* ignore */
        }
        const langs = Array.isArray(store.availableLanguages) ? store.availableLanguages : [];
        void Promise.all(langs.map((l) => fetchLocalePack(l.code).catch(() => null)));
        this.render();
        this._onStateChange = () => this._onStoreChange();
        store.addEventListener('state-change', this._onStateChange);
    }

    disconnectedCallback() {
        if (this._onStateChange) {
            store.removeEventListener('state-change', this._onStateChange);
        }
        if (this._finishTapGuardTimer) {
            clearTimeout(this._finishTapGuardTimer);
            this._finishTapGuardTimer = null;
        }
        if (this._suggestTimer) {
            clearTimeout(this._suggestTimer);
            this._suggestTimer = null;
        }
    }

    _onStoreChange() {
        const lang = store.state.lang;
        const theme = store.state.theme;
        const shell = this.querySelector('.arborito-onboarding-shell');
        if (shell) {
            if (lang !== this._lastLang) {
                this._lastLang = lang;
                this.render();
                return;
            }
            if (theme !== this._lastTheme) {
                this._lastTheme = theme;
                this._syncThemeButton(theme);
            }
            return;
        }
        this.render();
    }

    _syncThemeButton(theme) {
        const icon = theme === 'light' ? '🌙' : '☀️';
        this.querySelectorAll('.js-onb-theme [aria-hidden="true"]').forEach((el) => {
            el.textContent = icon;
        });
    }

    close() {
        // Onboarding is gated — user must complete it. close() is only called
        // from the X button (which we don't render); kept for parity.
        store.dismissModal();
    }

    _goToStep(n) {
        /* While a network call is in flight (sign-in / register) we
         * ignore navigation requests: the in-flight Promise still owns the
         * `_error` slot and may render itself onto the new view, leaving
         * the wizard in an inconsistent state. Buttons are disabled in
         * the markup, but the navbar back chevron is keyboard-reachable
         * and Android back-gesture can also fire — this guard is the
         * single source of truth. */
        if (this._busy) return;
        this._step = Math.max(1, Math.min(2, Number(n) || 1));
        this._error = '';
        this.render();
    }

    /** Finishes the wizard: mark seen, open Trees picker (step 3).
     *
     * The Sources modal is ALWAYS tagged with `fromOnboarding` when the user
     * gets here — so the back button in Sources returns them to the session
     * step regardless of whether they skipped, signed in, or just registered.
     * The user explicitly asked for "ir hacia atras en la seleccion de
     * arboles en el proceso de onboarding" to be possible "pero solo ahi"
     * (i.e. only during the onboarding flow). The `view` hint is set to the
     * sub-view they came from so the wizard re-opens at the same place. The
     * sources modal also uses this flag to render an explicit Back affordance
     * even on desktop (where the chrome usually has only an × close).
     *
     * Idempotent: ghost-taps on the freshly rendered "Continue" button and
     * back-to-back state-change events could otherwise fire `setModal` /
     * dispatch `arborito-start-tour` several times in a row — the user
     * reported the Trees picker re-opening "varias veces solo". The
     * `_completed` flag pins the wizard to a single completion. */
    _complete() {
        if (this._completed) return;
        this._completed = true;
        try {
            localStorage.setItem(ONBOARDING_SEEN_KEY, 'true');
        } catch {
            /* ignore */
        }
        /* Always land back at the choose sub-view: after a successful login
         * or register, "back" to the form they just submitted is meaningless,
         * so we send them to the choice screen instead. */
        const payload = {
            type: 'sources',
            instantOpen: true,
            fromOnboarding: { step: 2, view: 'choose' }
        };
        store.setModal(payload);
        requestAnimationFrame(() => {
            window.dispatchEvent(
                new CustomEvent('arborito-start-tour', {
                    detail: { source: 'onboarding', force: true, skipDockForOpenTrees: true }
                })
            );
        });
    }

    render() {
        const mob = shouldShowMobileUI();
        const ui = store.ui;
        const themeIcon = store.value.theme === 'light' ? '🌙' : '☀️';
        const themeLbl = esc(ui.themeToggle || 'Toggle theme');

        const navbar = this._renderNavbar(ui, themeIcon, themeLbl);
        const stepBody = this._step === 1 ? this._renderStep1(ui) : this._renderStep2(ui);

        const onbBody = `
            ${navbar}
            <div class="arborito-onboarding-inner flex flex-col">
                ${stepBody}
            </div>`;
        this.innerHTML = modalShellHtml({
            bodyHtml: onbBody,
            mobile: mob,
            layout: 'dock',
            scrim: 'none',
            panelClass: 'arborito-onboarding-shell',
            panelAttrs: 'aria-busy="false"',
            rootFlags: 'arborito-modal--onboarding',
        });

        this._wireCommonControls();
        this._wireNavbar();
        if (this._step === 1) this._wireStep1();
        else this._wireStep2();
    }

    /** Unified top navbar: [‹ back] [● ● dots + label] [theme toggle].
     *
     * The back chevron replaces every per-view bottom link so navigation is
     * consistent across step 1, step 2 choose, and the step 2 sub-views.
     * `_canGoBack()` decides whether the chevron is visible / interactive
     * based on the current state. */
    _renderNavbar(ui, themeIcon, themeLbl) {
        const backLbl = esc(ui.onboardingBack || 'Back');
        const canBack = this._canGoBack();
        const backBtn = canBack
            ? `<button type="button" class="arborito-onb-nav__btn arborito-onb-nav__btn--back js-onb-nav-back" aria-label="${backLbl}" title="${backLbl}">
                    <span aria-hidden="true">‹</span>
                </button>`
            : `<span class="arborito-onb-nav__btn arborito-onb-nav__btn--ghost" aria-hidden="true"></span>`;

        const stepLbl = String(ui.onboardingStepLabel || 'Step {n} of {total}')
            .replace('{n}', String(this._step))
            .replace('{total}', String(TOTAL_STEPS));
        const dots = Array.from({ length: TOTAL_STEPS })
            .map((_, i) => {
                const n = i + 1;
                const cls =
                    n < this._step
                        ? 'arborito-onb-dot arborito-onb-dot--done'
                        : n === this._step
                          ? 'arborito-onb-dot arborito-onb-dot--active'
                          : 'arborito-onb-dot';
                return `<span class="${cls}" aria-hidden="true"></span>`;
            })
            .join('');

        const themeBtn = `<button type="button" class="arborito-onb-nav__btn arborito-onb-nav__btn--theme js-onb-theme" aria-label="${themeLbl}" title="${themeLbl}">
            <span aria-hidden="true">${themeIcon}</span>
        </button>`;

        return `<div class="arborito-onb-nav" role="navigation">
            ${backBtn}
            <div class="arborito-onb-nav__center" role="status" aria-live="polite">
                <div class="arborito-onb-steps__dots">${dots}</div>
                <p class="arborito-onb-steps__label">${esc(stepLbl)}</p>
            </div>
            ${themeBtn}
        </div>`;
    }

    /** Whether the navbar back chevron is shown. The "registered" view is
     * intentionally a dead-end: the user must tap Continue (which opens a
     * styled confirm dialog) so they pass through the explicit "did you
     * save the code?" check before leaving — otherwise navigating back
     * would erase the freshly-generated secret with no way to recover.
     *
     * Also hidden while a Nostr publish/read is in flight (`_busy`): the
     * `_navBack` handler is already gated by `_busy`, but rendering an
     * actionable-looking chevron while the user is supposed to wait for
     * the spinner banner sends a confusing signal. Hiding it makes the
     * "can't navigate yet" state unambiguous. */
    _canGoBack() {
        if (this._step === 1) return false;
        if (this._sessionView === 'registered') return false;
        if (this._busy) return false;
        return true;
    }

    /** Single back handler driven by current step/view. */
    _navBack() {
        if (this._step === 2 && this._sessionView !== 'choose') {
            this._setSessionView('choose');
            return;
        }
        if (this._step === 2) {
            this._goToStep(1);
        }
    }

    _wireNavbar() {
        this.querySelectorAll('.js-onb-nav-back').forEach((b) =>
            bindMobileTap(b, () => this._navBack())
        );
    }

    _wireCommonControls() {
        this.querySelectorAll('.js-onb-theme').forEach((b) =>
            bindMobileTap(b, () => store.toggleTheme())
        );
    }
}

Object.assign(
    ArboritoModalOnboarding.prototype,
    welcomeMixin,
    languageMixin,
    chooseMixin,
    signinMixin
);

customElements.define('arborito-modal-onboarding', ArboritoModalOnboarding);
