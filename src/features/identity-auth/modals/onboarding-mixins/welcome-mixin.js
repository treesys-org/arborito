import { store } from '../../../../core/store.js';
import { bindMobileTap } from '../../../../shared/ui/mobile-tap.js';
import { iconArboritoPixelSvg } from '../../../shell-chrome/sidebar-utils.js';
import {
    hasGdprNetworkConsent,
    grantGdprNetworkConsent
} from '../../../privacy-gdpr/gdpr-network-consent.js';
import { escHtml as esc } from '../../../../shared/lib/html-escape.js';

/** Step 1 of the onboarding wizard: welcome / hero copy, the language picker
 * (rendered inline so the user can switch UI language while still on the
 * welcome screen), the privacy callout, and the GDPR-consent CTA that
 * advances to step 2. The language buttons themselves only call
 * `_setLanguage` (in `language-mixin`); everything else lives here. */
export const welcomeMixin = {
    _renderStep1(ui) {
        const welcome = String(ui.onboardingWelcome || '').trim();
        const tagline = ui.onboardingTagline;
        const body = ui.onboardingBody;
        const langLbl = ui.onboardingLanguage || ui.languageTitle;
        const betaWarnHead = String(ui.onboardingBetaWarningHead || '').trim();
        const betaWarn = String(ui.onboardingBetaWarning || '').trim();
        const privacyHeading = String(ui.onboardingPrivacyHeading || '').trim();
        const privacyText = String(ui.onboardingPrivacyText || '').trim();
        const privacyReadLbl = String(ui.onboardingPrivacyReadButton || ui.privacyTitle || 'Privacy policy').trim();
        /* GDPR: a single click on the primary CTA both records the privacy
         * consent and advances to step 2 — no extra checkbox. Mobile-friendly
         * and unambiguous because the button copy itself says "Accept and
         * continue", with the privacy callout right above it. */
        const continueLbl = String(ui.onboardingAcceptAndContinue || ui.onboardingStart || 'Accept and continue').trim();

        const betaWarnBlock =
            betaWarnHead && betaWarn
                ? `<div class="arborito-onboarding-warning" role="alert">
                        <p class="arborito-onboarding-warning__head">${esc(betaWarnHead)}</p>
                        <p class="arborito-onboarding-warning__detail">${esc(betaWarn)}</p>
                    </div>`
                : betaWarn
                  ? `<p class="arborito-onboarding-warning" role="alert">${esc(betaWarn)}</p>`
                  : '';

        const langs = Array.isArray(store.availableLanguages) ? store.availableLanguages : [];
        const langButtons = langs
            .map((l) => {
                const active = store.value.lang === l.code;
                const activeCls = active ? ' arborito-onboarding-lang--active' : '';
                return `<button type="button" class="btn-onb-lang flex items-center gap-2 border${activeCls}" data-code="${esc(l.code)}" aria-pressed="${active ? 'true' : 'false'}" aria-label="${esc(l.name || l.nativeName || l.code)}">
                    <span class="text-xl leading-none shrink-0" aria-hidden="true">${esc(l.flag || '🌍')}</span>
                    <span class="text-xs font-black truncate">${esc(l.nativeName || l.name || l.code)}</span>
                </button>`;
            })
            .join('');

        return `
            <div class="arborito-onboarding-hero">
                <div class="arborito-onboarding-mascot" aria-hidden="true">${iconArboritoPixelSvg({ size: 44, className: 'arborito-onboarding-logo' })}</div>
                ${welcome ? `<h1 class="arborito-onboarding-welcome">${esc(welcome)}</h1>` : ''}
                <p class="arborito-onboarding-tagline">${esc(tagline || '')}</p>
                <p class="arborito-onboarding-body">${esc(body || '')}</p>
                ${betaWarnBlock}
            </div>

            <div class="arborito-onboarding-lang">
                <p class="arborito-onboarding-lang-label">${esc(langLbl || '')}</p>
                <div class="arborito-onboarding-lang-grid">${langButtons}</div>
            </div>

            ${privacyHeading && privacyText ? `<div class="arborito-onboarding-privacy">
                <p class="arborito-onboarding-privacy__head">${esc(privacyHeading)}</p>
                <p class="arborito-onboarding-privacy__text">${esc(privacyText)}</p>
                <button type="button" class="arborito-onboarding-privacy__link js-onb-privacy" aria-label="${esc(privacyReadLbl)}">${esc(privacyReadLbl)} ›</button>
            </div>` : ''}

            <div class="arborito-onboarding-actions">
                <button type="button" class="btn-onb-start text-sm text-white js-onb-next">${esc(continueLbl)}</button>
            </div>`;
    },

    _wireStep1() {
        this.querySelectorAll('.btn-onb-lang').forEach((b) => {
            const code = String((b && b.dataset && b.dataset.code) || '').trim();
            bindMobileTap(b, () => {
                if (code) this._setLanguage(code);
            });
        });
        this.querySelectorAll('.js-onb-next').forEach((b) =>
            bindMobileTap(b, () => this._acceptAndAdvance())
        );
        /* Privacy "Read more" CTA: opens the dedicated privacy modal in `readonly` mode so
         * the destructive "wipe local data" / consent-reset block stays hidden (the user
         * hasn't even completed onboarding — nothing to wipe yet). The privacy modal's own
         * close button just calls `store.dismissModal()`, which leaves us with no modal;
         * we listen once for the modal becoming null and re-open onboarding at the same
         * step we left off (step 1, welcome). */
        this.querySelectorAll('.js-onb-privacy').forEach((b) =>
            bindMobileTap(b, () => this._openPrivacyFromWelcome())
        );
    },

    /** Tap on "Accept and continue": records GDPR network consent (idempotent) and
     * moves to step 2. The button label is the consent affordance — no checkbox,
     * because Arborito UI never uses native checkboxes (mobile-unfriendly + the
     * design system has no styled variant). */
    _acceptAndAdvance() {
        if (!hasGdprNetworkConsent()) grantGdprNetworkConsent();
        this._goToStep(2);
    },

    _openPrivacyFromWelcome() {
        if (this._busy) return;
        /* Idempotent: if the user clicks "Privacy policy" twice
         * before any state change settles, only one return-to-welcome
         * listener is registered. Without this guard each click stacks a
         * new listener and the wizard re-opens itself N times when the
         * user finally closes everything. */
        if (this._returnToWelcomeListener) {
            store.removeEventListener('state-change', this._returnToWelcomeListener);
            this._returnToWelcomeListener = null;
        }
        store.setModal({ type: 'privacy', readonly: true, fromOnboarding: { step: 1 } });
        /* The user can navigate **inside** the privacy modal (e.g. open the
         * Impressum / "Aviso legal" → that swaps to the About modal at the
         * `legal` tab). The previous listener treated *any* modal that was
         * not `privacy` as "user closed privacy" and immediately replaced it
         * with onboarding, so clicking Impressum from welcome made the
         * About modal flash invisible to the user (the bug report:
         * "al apretar en impressum en el welcome no deja ver nada").
         *
         * The right fix is: only re-open onboarding when the modal is
         * actually CLOSED (`null`). While the user navigates between
         * privacy → about → privacy → … we leave them alone, and pick the
         * onboarding flow back up only when they fully dismiss everything. */
        const onChange = () => {
            const cur = store.value && store.value.modal;
            if (cur != null) return;
            store.removeEventListener('state-change', onChange);
            this._returnToWelcomeListener = null;
            /* Re-open onboarding at step 1 (welcome). The wizard component
             * reads `m.step` in connectedCallback; passing no `step` (or 1)
             * lands the user back where they started. */
            store.setModal({ type: 'onboarding' });
        };
        this._returnToWelcomeListener = onChange;
        store.addEventListener('state-change', onChange);
    }
};
