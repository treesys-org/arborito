import { escHtml as esc } from '../../../../shared/lib/html-escape.js';

/** Step 2 of the onboarding wizard: the "choose" sub-view that asks whether
 * the user wants to sign in to an existing account, register a new one, or
 * skip and continue without an online account.
 *
 * The actual login / register / registered sub-views are owned by
 * `signin-mixin`; this mixin just renders the dispatcher (`_renderStep2`),
 * the choice list (`_renderStep2Choose`), and the helper that swaps between
 * sub-views (`_setSessionView`). */
export const chooseMixin = {
    _setSessionView(view) {
        if (this._busy) return;
        this._sessionView = view;
        this._error = '';
        /* We keep `_sessionUsername` / `_sessionSecret` across views so the
         * username typed for "Create" can be reused for "Sign in" without
         * retyping. */
        this.render();
    },

    _renderStep2(ui) {
        const title = esc(ui.onboardingSessionTitle || 'Your account');
        const subtitle = esc(
            ui.onboardingSessionSubtitle ||
                'Sign in to bring your trees, create a new account, or continue without one. You can always change this later from Profile.'
        );

        let panel;
        if (this._sessionView === 'login') panel = this._renderStep2Login(ui);
        else if (this._sessionView === 'register') panel = this._renderStep2Register(ui);
        else if (this._sessionView === 'registered') panel = this._renderStep2Registered(ui);
        else panel = this._renderStep2Choose(ui);

        return `
            <div class="arborito-onboarding-hero arborito-onboarding-hero--step2">
                <h2 class="arborito-onb-step-title">${title}</h2>
                <p class="arborito-onb-step-subtitle">${subtitle}</p>
            </div>
            <div class="arborito-onb-session-panel">
                ${panel}
            </div>`;
    },

    _renderStep2Choose(ui) {
        const signInLbl = esc(ui.onboardingSessionSignIn || 'Sign in');
        const signInSub = esc(ui.onboardingSessionSignInSub || 'I already have an account on another device');
        const registerLbl = esc(ui.onboardingSessionRegister || 'Create account');
        const registerSub = esc(ui.onboardingSessionRegisterSub || 'Sync your trees across devices');
        const skipLbl = esc(ui.onboardingSessionSkip || 'Continue without an account');
        const skipSub = esc(ui.onboardingSessionSkipSub || 'This device only');
        const chev = '<span class="arborito-onb-choice__chev" aria-hidden="true">›</span>';
        return `
            <div class="arborito-onb-choice-list">
                <button type="button" class="arborito-onb-choice arborito-onb-choice--primary js-onb-choose-login">
                    <span class="arborito-onb-choice__ic-wrap arborito-onb-choice__ic-wrap--primary" aria-hidden="true">
                        <span class="arborito-onb-choice__ic">🔑</span>
                    </span>
                    <span class="arborito-onb-choice__txt">
                        <span class="arborito-onb-choice__title">${signInLbl}</span>
                        <span class="arborito-onb-choice__sub">${signInSub}</span>
                    </span>
                    ${chev}
                </button>
                <button type="button" class="arborito-onb-choice arborito-onb-choice--accent js-onb-choose-register">
                    <span class="arborito-onb-choice__ic-wrap arborito-onb-choice__ic-wrap--accent" aria-hidden="true">
                        <span class="arborito-onb-choice__ic">🆕</span>
                    </span>
                    <span class="arborito-onb-choice__txt">
                        <span class="arborito-onb-choice__title">${registerLbl}</span>
                        <span class="arborito-onb-choice__sub">${registerSub}</span>
                    </span>
                    ${chev}
                </button>
                <button type="button" class="arborito-onb-choice arborito-onb-choice--ghost js-onb-choose-skip">
                    <span class="arborito-onb-choice__ic-wrap arborito-onb-choice__ic-wrap--ghost" aria-hidden="true">
                        <span class="arborito-onb-choice__ic arborito-onb-choice__ic--globe-off">🌐</span>
                    </span>
                    <span class="arborito-onb-choice__txt">
                        <span class="arborito-onb-choice__title">${skipLbl}</span>
                        <span class="arborito-onb-choice__sub">${skipSub}</span>
                    </span>
                    ${chev}
                </button>
            </div>`;
    }
};
