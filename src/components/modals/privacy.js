
import { store } from '../../store.js';
import { modalWindowCloseXHtml, modalNavBackHtml } from '../../utils/dock-sheet-chrome.js';
import { escHtml } from '../../utils/html-escape.js';

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
        const aiOllama = ui.privacyAiOllamaLine || '';
        const aiBrowser = ui.privacyAiBrowserLine || '';
        const techHeading = ui.privacyTechStackHeading || '';
        const techHosting = ui.privacyTechHosting || '';
        const techCurriculum = ui.privacyTechCurriculum || '';
        const techFonts = ui.privacyTechFonts || '';
        const techGraph = ui.privacyTechGraph || '';
        const techAnalytics = ui.privacyTechAnalytics || '';
        const nostrRelaysHeading = ui.privacyNostrRelaysHeading || '';
        const nostrRelaysBody = ui.privacyNostrRelaysBody || '';

        this.innerHTML = `
        <div id="modal-backdrop" class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950 p-4 animate-in arborito-modal-root">
            <div class="arborito-float-modal-card arborito-float-modal-card--xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl relative overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800 cursor-auto">
                <div class="arborito-float-modal-head arborito-dock-modal-hero shrink-0 px-4 pt-4 pb-2 items-center gap-2">
                    ${modalNavBackHtml(ui, 'arborito-mmenu-back shrink-0', { tagClass: 'btn-privacy-mob-back' })}
                    <span class="text-2xl shrink-0" aria-hidden="true">🛡️</span>
                    <h2 class="arborito-mmenu-subtitle m-0 flex-1 min-w-0">${ui.privacyTitle || 'Privacy'}</h2>
                    ${modalWindowCloseXHtml(ui, 'btn-privacy-x')}
                </div>

                <div class="p-8 pt-6 overflow-y-auto custom-scrollbar flex-1 min-h-0">
                    <div class="prose prose-sm prose-slate dark:prose-invert max-w-none">

                        <div class="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800 mb-6 not-prose text-xs text-blue-800 dark:text-blue-300 font-bold leading-relaxed">
                            <p class="m-0">${calloutBody}</p>
                        </div>

                        ${nostrRelaysHeading || nostrRelaysBody ? `<h3 class="mt-0">${escHtml(nostrRelaysHeading)}</h3><div class="text-xs leading-relaxed text-slate-700 dark:text-slate-300 mb-6">${nostrRelaysBody}</div>` : ''}

                        ${privacyHtml}

                        <hr class="my-6 border-slate-200 dark:border-slate-700">

                        <h3>${aiHeading}</h3>
                        <div class="bg-slate-100 dark:bg-slate-800 p-4 rounded-xl text-xs space-y-2">
                            <p>${aiOllama}</p>
                            <p>${aiBrowser}</p>
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

                    </div>
                </div>

                <div class="shrink-0 border-t border-slate-100 bg-slate-50 px-4 pb-2 pt-4 dark:border-slate-800 dark:bg-slate-950 not-prose">
                    <h3 class="m-0 text-xs font-black uppercase tracking-widest text-slate-600 dark:text-slate-300">${escHtml(ui.privacyDeviceDataHeading || 'This device')}</h3>
                    <p class="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">${escHtml(ui.privacyDeviceDataLead || '')}</p>
                    <div class="mt-4 flex flex-col gap-3">
                        <button type="button" id="privacy-btn-reset-consents" class="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800 transition-colors hover:border-slate-400 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900">${escHtml(ui.privacyResetConsentButton)}</button>
                        <button type="button" id="privacy-btn-wipe-local" class="min-h-[44px] w-full rounded-xl border-2 border-red-300 bg-red-50 px-4 py-3 text-sm font-bold text-red-800 transition-colors hover:border-red-400 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200 dark:hover:border-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900">${escHtml(ui.privacyWipeLocalButton)}</button>
                    </div>
                </div>

                <div class="shrink-0 border-t border-slate-100 bg-slate-50 p-4 text-center dark:border-slate-800 dark:bg-slate-950">
                    <button type="button" class="btn-privacy-done min-h-[44px] w-full rounded-xl bg-slate-900 py-3 text-base font-bold text-white transition-opacity hover:opacity-90 dark:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900">
                        ${ui.close || 'Close'}
                    </button>
                </div>
            </div>
        </div>`;

        this.querySelectorAll('.btn-privacy-mob-back').forEach((b) => (b.onclick = () => this.close()));
        this.querySelectorAll('.btn-privacy-x').forEach((b) => (b.onclick = () => this.close()));
        const pd = this.querySelector('.btn-privacy-done');
        if (pd) pd.onclick = () => this.close();

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
    }
}
customElements.define('arborito-modal-privacy', ArboritoModalPrivacy);
