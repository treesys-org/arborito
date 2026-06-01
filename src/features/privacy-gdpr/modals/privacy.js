
import { store } from '../../../core/store.js';
import { injectOperatorEmailToken } from '../../../shared/lib/default-operator-email.js';
import { escHtml } from '../../../shared/lib/html-escape.js';
import { modalShellHtml } from '../../../shared/ui/modal-shell.js';
import { modalHeroHtml } from '../../../shared/ui/modal-hero.js';
import { calloutHtml } from '../../../shared/ui/callout.js';
import { isDesktopLlamacppBridgePresent } from '../../learning/ai-llamacpp-bridge.js';

class ArboritoModalPrivacy extends HTMLElement {
    connectedCallback() {
        this.render();
        this._storeListener = () => this.render();
        store.addEventListener('state-change', this._storeListener);
    }

    disconnectedCallback() {
        if (this._storeListener) {
            store.removeEventListener('state-change', this._storeListener);
        }
    }

    close() {
        store.dismissModal();
    }

    openImpressum() {
        store.setModal({ type: 'about', tab: 'legal' });
    }

    render() {
        const ui = store.ui;
        /* Readonly variant: opened from the Welcome / onboarding wizard, where the user has
         * nothing yet to wipe or reconsent. We hide the entire "This device" block so the
         * first thing a brand-new user sees about privacy isn't a red destructive button. */
        const m = store.value && store.value.modal;
        const readonly = !!(m && typeof m === 'object' && m.readonly);

        let privacyHtml = ui.privacyText || '';

        const controllerReference = `
            <div class="mb-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
                <p class="text-sm text-slate-600 dark:text-slate-300 mb-2 font-medium">
                    ${ui.impressumText || ''}
                </p>
                <button type="button" id="btn-link-impressum" class="text-blue-600 dark:text-blue-400 hover:underline text-xs font-bold flex items-center gap-2 transition-colors">
                    <span aria-hidden="true">⚖️</span> <span>${ui.privacyImpressumButton || 'Legal notice'}</span> <span aria-hidden="true">➜</span>
                </button>
            </div>
        `;

        privacyHtml = privacyHtml.replace('{impressum}', controllerReference);

        const calloutBody = ui.privacyLocalFirstCallout || '';
        const aiHeading = ui.privacyAiThirdPartiesHeading || '';
        // Only describe the inference path that is actually reachable on this build:
        // browser users never see the native llama.cpp line, desktop users never see wllama.
        const isDesktop = isDesktopLlamacppBridgePresent();
        const aiDisclosure = isDesktop
            ? (ui.privacyAiDesktopLine || '')
            : (ui.privacyAiBrowserLine || '');
        const techHeading = ui.privacyTechStackHeading || '';
        const techHosting = ui.privacyTechHosting || '';
        const techCurriculum = ui.privacyTechCurriculum || '';
        const techFonts = ui.privacyTechFonts || '';
        const techGraph = ui.privacyTechGraph || '';
        const techAnalytics = ui.privacyTechAnalytics || '';
        const nostrRelaysHeading = ui.privacyNostrRelaysHeading || '';
        const nostrRelaysBody = ui.privacyNostrRelaysBody || '';
        const webTorrentHeading = ui.privacyWebTorrentHeading || '';
        const webTorrentBody = ui.privacyWebTorrentBody || '';
        const secretsHeading = ui.privacySecretsHeading || '';
        const secretsBody = ui.privacySecretsBody || '';
        const legalBasisHeading = ui.privacyLegalBasisHeading || '';
        const legalBasisBody = injectOperatorEmailToken(ui.privacyLegalBasisBody || '', ui);

        /* GDPR network-consent status block. Symmetry with grant (onboarding step 1):
         * if consent is currently missing we expose a clear "Accept" CTA right next
         * to "Reset consents", so withdrawing is as easy as re-granting. */
        const hasNetCons =
            typeof store.hasGdprNetworkConsent === 'function' && store.hasGdprNetworkConsent();
        const consentStatus = readonly ? '' : `
                        <div class="not-prose mt-6 rounded-2xl border ${hasNetCons ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/30' : 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40'} p-4">
                            <h3 class="arborito-eyebrow arborito-eyebrow--md arborito-eyebrow--strong m-0">${escHtml(ui.privacyNetworkConsentHeading || 'Network consent')}</h3>
                            <p class="mt-2 text-xs leading-relaxed ${hasNetCons ? 'text-emerald-900 dark:text-emerald-100' : 'text-amber-900 dark:text-amber-100'}">${escHtml(hasNetCons ? (ui.privacyNetworkConsentGrantedBody || 'You accepted the privacy policy. Arborito can reach Nostr relays and the WebTorrent network on this device.') : (ui.privacyNetworkConsentMissingBody || 'You have not accepted (or you withdrew) the privacy policy. Arborito will NOT contact any Nostr relay or WebTorrent peer until you accept.'))}</p>
                            ${hasNetCons ? '' : `<div class="mt-4 flex flex-col gap-3">
                                <button type="button" id="privacy-btn-grant-network" class="min-h-[44px] w-full rounded-xl border-2 border-emerald-400 bg-emerald-500 px-4 py-3 text-sm font-black text-white transition-colors hover:bg-emerald-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900">${escHtml(ui.privacyNetworkConsentGrantButton || 'Accept privacy policy')}</button>
                            </div>`}
                        </div>`;

        /* "Este dispositivo" used to live in a sticky bottom bar that, on mobile fullscreen,
         * ate most of the visible viewport and visually "covered" the scrollable content.
         * Now it lives at the very end of the scroll body so the user reaches it by scrolling
         * and it doesn't compete with the header / main content for screen real estate. */
        const deviceBlock = readonly ? '' : `
                        <hr class="my-6 border-slate-200 dark:border-slate-700">
                        ${consentStatus}
                        <div class="not-prose mt-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/60 p-4">
                            <h3 class="arborito-eyebrow arborito-eyebrow--md arborito-eyebrow--strong m-0">${escHtml(ui.privacyDeviceDataHeading || 'This device')}</h3>
                            <p class="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">${escHtml(ui.privacyDeviceDataLead || '')}</p>
                            <div class="mt-4 flex flex-col gap-3">
                                <button type="button" id="privacy-btn-reset-consents" class="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800 transition-colors hover:border-slate-400 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900">${escHtml(ui.privacyResetConsentButton)}</button>
                                <button type="button" id="privacy-btn-wipe-local" class="min-h-[44px] w-full rounded-xl border-2 border-red-300 bg-red-50 px-4 py-3 text-sm font-bold text-red-800 transition-colors hover:border-red-400 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200 dark:hover:border-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900">${escHtml(ui.privacyWipeLocalButton)}</button>
                            </div>
                        </div>`;

        const body = `
                ${modalHeroHtml(ui, { title: ui.privacyTitle || 'Privacy', leadingIcon: '<span class="text-2xl shrink-0" aria-hidden="true">🛡️</span>', backTagClass: 'btn-privacy-mob-back', closeTagClass: 'btn-privacy-x' })}

                <div class="px-4 sm:px-8 pt-6 pb-8 overflow-y-auto custom-scrollbar flex-1 min-h-0">
                    <div class="prose prose-sm prose-slate dark:prose-invert max-w-none">

                        ${calloutHtml({ tone: 'blue', size: 'sm', extraClass: 'mb-6 not-prose text-xs font-bold leading-relaxed', htmlBody: `<p class="m-0">${calloutBody}</p>` })}

                        ${nostrRelaysHeading || nostrRelaysBody ? `<h3 class="mt-0">${escHtml(nostrRelaysHeading)}</h3><div class="text-xs leading-relaxed text-slate-700 dark:text-slate-300 mb-6">${nostrRelaysBody}</div>` : ''}

                        ${webTorrentHeading || webTorrentBody ? `<h3>${escHtml(webTorrentHeading)}</h3><div class="text-xs leading-relaxed text-slate-700 dark:text-slate-300 mb-6">${webTorrentBody}</div>` : ''}

                        ${secretsHeading || secretsBody ? `<h3>${escHtml(secretsHeading)}</h3><div class="text-xs leading-relaxed text-slate-700 dark:text-slate-300 mb-6">${secretsBody}</div>` : ''}

                        ${privacyHtml}

                        ${legalBasisHeading || legalBasisBody ? `<h3>${escHtml(legalBasisHeading)}</h3><div class="text-xs leading-relaxed text-slate-700 dark:text-slate-300 mb-6">${legalBasisBody}</div>` : ''}

                        <hr class="my-6 border-slate-200 dark:border-slate-700">

                        <h3>${aiHeading}</h3>
                        <div class="bg-slate-100 dark:bg-slate-800 p-4 rounded-xl text-xs space-y-2">
                            <p>${aiDisclosure}</p>
                        </div>

                        <hr class="my-6 border-slate-200 dark:border-slate-700">

                        <h3>${techHeading}</h3>
                        <ul class="text-xs font-mono bg-slate-100 dark:bg-slate-800 p-4 rounded-lg list-none space-y-2">
                            <li>${techHosting}</li>
                            <li>${techCurriculum}</li>
                            <li>${techFonts}</li>
                            <li>${techGraph}</li>
                            <li>${techAnalytics}</li>
                        </ul>

                        ${deviceBlock}

                    </div>
                </div>`;
        this.innerHTML = modalShellHtml({ bodyHtml: body, panelSize: 'xl' });

        this.querySelectorAll('.btn-privacy-mob-back').forEach((b) => (b.onclick = () => this.close()));
        this.querySelectorAll('.btn-privacy-x').forEach((b) => (b.onclick = () => this.close()));

        const btnLink = this.querySelector('#btn-link-impressum');
        if (btnLink) btnLink.onclick = () => this.openImpressum();

        const resetConsents = this.querySelector('#privacy-btn-reset-consents');
        if (resetConsents) {
            resetConsents.onclick = () => store.resetOptionalConsentsInteractive();
        }
        const wipeLocal = this.querySelector('#privacy-btn-wipe-local');
        if (wipeLocal) {
            wipeLocal.onclick = () => store.wipeAllLocalDataOnThisDeviceInteractive();
        }
        const grantNet = this.querySelector('#privacy-btn-grant-network');
        if (grantNet) {
            grantNet.onclick = () => {
                if (typeof store.grantGdprNetworkConsent === 'function') {
                    store.grantGdprNetworkConsent();
                }
                const ui = store.ui;
                store.notify(ui.privacyNetworkConsentGrantedToast || 'Privacy policy accepted.', false);
                this.render();
            };
        }
    }
}
customElements.define('arborito-modal-privacy', ArboritoModalPrivacy);
