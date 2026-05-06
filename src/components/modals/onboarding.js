import { store } from '../../store.js';
import { bindMobileTap } from '../../utils/mobile-tap.js';
import { shouldShowMobileUI } from '../../utils/breakpoints.js';
import { iconArboritoPixelSvg } from '../sidebar-utils.js';

const ONBOARDING_SEEN_KEY = 'arborito-onboarding-seen-v1';
const OPEN_TREES_AFTER_TOUR_KEY = 'arborito-open-trees-after-tour-v1';

function esc(s) {
    return String(s != null ? s : '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

class ArboritoModalOnboarding extends HTMLElement {
    connectedCallback() {
        this.render();
        this._onStateChange = () => this.render();
        store.addEventListener('state-change', this._onStateChange);
    }

    disconnectedCallback() {
        if (this._onStateChange) {
            store.removeEventListener('state-change', this._onStateChange);
        }
    }

    close() {
        store.dismissModal();
    }

    _setLanguage(code) {
        const c = String(code || '').trim();
        if (!c) return;
        void store.setLanguage(c);
    }

    _start() {
        try {
            localStorage.setItem(ONBOARDING_SEEN_KEY, 'true');
            localStorage.setItem(OPEN_TREES_AFTER_TOUR_KEY, 'true');
        } catch {
            /* ignore */
        }
        this.close();
        queueMicrotask(() => {
            try {
                store.setModal({ type: 'sources' });
            } catch {
                /* ignore */
            }
            requestAnimationFrame(() => {
                window.dispatchEvent(
                    new CustomEvent('arborito-start-tour', {
                        detail: { source: 'onboarding', force: true, skipDockForOpenTrees: true }
                    })
                );
            });
        });
    }

    render() {
        const ui = store.ui;
        const title = ui.onboardingTitle;
        const welcome = String(ui.onboardingWelcome || '').trim();
        const tagline = ui.onboardingTagline;
        const body = ui.onboardingBody;
        const startLbl = ui.onboardingStart;
        const langLbl = ui.onboardingLanguage || ui.languageTitle;
        const betaWarnHead = String(ui.onboardingBetaWarningHead || '').trim();
        const betaWarn = String(ui.onboardingBetaWarning || '').trim();
        const privacyHeading = String(ui.onboardingPrivacyHeading || '').trim();
        const privacyText = String(ui.onboardingPrivacyText || '').trim();
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
                return `<button type="button" class="btn-onb-lang flex items-center gap-2 border border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100${activeCls}" data-code="${esc(l.code)}" aria-pressed="${active ? 'true' : 'false'}" aria-label="${esc(l.name || l.nativeName || l.code)}">
                    <span class="text-xl leading-none shrink-0" aria-hidden="true">${esc(l.flag || '🌍')}</span>
                    <span class="text-xs font-black truncate">${esc(l.nativeName || l.name || l.code)}</span>
                </button>`;
            })
            .join('');
        const busy = !!store.state.loading;
        const mob = shouldShowMobileUI();
        const backdropPad = mob ? 'p-0' : 'p-4';
        const backdropAlign = mob ? 'items-stretch justify-start min-h-0' : 'items-center justify-center';

        this.innerHTML = `
        <div id="modal-backdrop" class="arborito-modal--onboarding fixed inset-0 z-[70] flex ${backdropAlign} bg-slate-950/80 ${backdropPad} min-h-[100dvh] h-[100dvh] animate-in fade-in arborito-modal-root">
            <div class="arborito-onboarding-shell arborito-float-modal-card cursor-auto ${busy ? 'opacity-90 pointer-events-none' : ''}" aria-busy="${busy ? 'true' : 'false'}">
                <div class="arborito-onboarding-inner flex flex-col">
                    <div class="arborito-onboarding-hero">
                        <div class="arborito-onboarding-mascot" aria-hidden="true">${iconArboritoPixelSvg({ size: 36, className: 'arborito-onboarding-logo' })}</div>
                        ${
                            welcome
                                ? `<h1 class="arborito-onboarding-welcome">${esc(welcome)}</h1>`
                                : ''
                        }
                        <p class="arborito-onboarding-tagline">${esc(tagline || '')}</p>
                        <p class="arborito-onboarding-body">${esc(body || '')}</p>
                        ${betaWarnBlock}
                    </div>

                    <div class="arborito-onboarding-lang">
                        <p class="arborito-onboarding-lang-label">${esc(langLbl || '')}</p>
                        <div class="arborito-onboarding-lang-grid">${langButtons}</div>
                    </div>

                    ${privacyHeading && privacyText ? `<div class="arborito-onboarding-privacy text-xs text-slate-500 dark:text-slate-400 mt-4 mb-2 leading-relaxed">
                        <strong>${esc(privacyHeading)}</strong><br>
                        ${esc(privacyText)}
                    </div>` : ''}

                    <div class="arborito-onboarding-actions">
                        <button type="button" class="btn-onb-start text-sm text-white">${esc(startLbl || '')}</button>
                    </div>
                </div>
            </div>
        </div>`;

        /* First-run: only “Start learning” advances (no backdrop dismiss — matches desktop gate). */
        this.querySelectorAll('.btn-onb-lang').forEach((b) => {
            const code = String((b && b.dataset && b.dataset.code) || '').trim();
            bindMobileTap(b, () => {
                if (code) this._setLanguage(code);
            });
        });
        this.querySelectorAll('.btn-onb-start').forEach((b) => bindMobileTap(b, () => this._start()));
    }
}

customElements.define('arborito-modal-onboarding', ArboritoModalOnboarding);

