import { store } from '../../store.js';
import { shouldShowMobileUI } from '../../utils/breakpoints.js';
import { bindMobileTap, isModalBackdropEmptyTap } from '../../utils/mobile-tap.js';
import { modalWindowCloseXHtml, modalNavBackHtml } from '../../utils/dock-sheet-chrome.js';

class ArboritoModalAuthorLicense extends HTMLElement {
    connectedCallback() {
        this.render();
    }

    render() {
        const ui = store.ui;
        const isMob = shouldShowMobileUI();

        const esc = (s) =>
            String(s != null ? s : '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');

        const section = (title, bodyHtml) => `
            <div class="mb-4">
                <h4 class="text-sm font-black text-slate-800 dark:text-slate-100 m-0 mb-2">${esc(title)}</h4>
                <div class="text-sm text-slate-600 dark:text-slate-300 leading-relaxed space-y-2">${bodyHtml}</div>
            </div>`;

        const ccBody = `<p class="m-0">${esc(ui.authorLicenseSectionCC)}</p>`;
        const youBody = `<p class="m-0">${esc(ui.authorLicenseSectionYou)}</p>`;
        const arbBody = `<p class="m-0">${esc(ui.authorLicenseSectionArborito)}</p>`;
        const notLegalAdvice = String(ui.authorLicenseNotLegalAdvice || '').trim();
        const notLegal = notLegalAdvice
            ? `<p class="text-xs text-amber-800 dark:text-amber-200/90 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 rounded-lg p-3 m-0">${esc(
                  notLegalAdvice
              )}</p>`
            : '';
        const refNote = ui.authorLicenseReferenceNote
            ? `<p class="text-xs text-slate-500 dark:text-slate-400 leading-snug m-0 mb-4">${esc(ui.authorLicenseReferenceNote)}</p>`
            : '';

        this.innerHTML = `
        <div id="modal-backdrop" class="fixed inset-0 z-[135] flex items-end sm:items-center justify-center bg-slate-950/90 p-0 sm:p-4 animate-in fade-in arborito-modal-root ${isMob ? 'arborito-modal--mobile' : ''}">
            <div class="arborito-float-modal-card arborito-float-modal-card--auto-h w-full sm:max-w-lg max-h-[min(92dvh,720px)] bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col border border-slate-200 dark:border-slate-800 overflow-hidden">
                <div class="arborito-float-modal-head shrink-0 px-4 pt-4 pb-3 border-b border-slate-100 dark:border-slate-800 items-start gap-2">
                    ${modalNavBackHtml(ui, 'arborito-mmenu-back shrink-0', { tagClass: 'js-authlic-back' })}
                    <div class="min-w-0 flex-1">
                        <h3 class="text-lg font-black text-slate-800 dark:text-white m-0">${esc(ui.authorLicenseTitle)}</h3>
                        <p class="text-xs text-slate-500 mt-1 font-semibold">${esc(ui.authorLicenseSubtitleReference || ui.authorLicenseSubtitle)}</p>
                    </div>
                    ${modalWindowCloseXHtml(ui, 'js-authlic-x')}
                </div>
                <div class="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar text-left pb-[max(1rem,env(safe-area-inset-bottom))]">
                    ${refNote}
                    ${section(ui.authorLicenseHeadingCC || 'Creative Commons', ccBody)}
                    ${section(ui.authorLicenseHeadingYou || 'Your responsibility', youBody)}
                    ${section(ui.authorLicenseHeadingArborito || 'Arborito software', arbBody)}
                    ${notLegal}
                </div>
            </div>
        </div>`;

        const dismiss = () => store.cancelAuthorLicenseModal();
        const backdrop = this.querySelector('#modal-backdrop');
        if (backdrop) {
            backdrop.addEventListener('click', (e) => {
                if (isModalBackdropEmptyTap(backdrop, e)) dismiss();
            });
        }
        const backBtn = this.querySelector('.js-authlic-back');
        if (backBtn) bindMobileTap(backBtn, dismiss);
        const xBtn = this.querySelector('.js-authlic-x');
        if (xBtn) bindMobileTap(xBtn, dismiss);
    }
}

customElements.define('arborito-modal-author-license', ArboritoModalAuthorLicense);
