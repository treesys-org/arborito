import { store } from '../../../core/store.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { bindMobileTap, isModalBackdropEmptyTap } from '../../../shared/ui/mobile-tap.js';
import { modalShellHtml } from '../../../shared/ui/modal-shell.js';
import { modalHeroHtml } from '../../../shared/ui/modal-hero.js';
import { calloutHtml } from '../../../shared/ui/callout.js';
import { escHtml as esc } from '../../../shared/lib/html-escape.js';

class ArboritoModalAuthorLicense extends HTMLElement {
    connectedCallback() {
        this.render();
    }

    render() {
        const ui = store.ui;
        const isMob = shouldShowMobileUI();

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
            ? calloutHtml({ tone: 'amber', size: 'sm', inline: true, extraClass: 'm-0', body: esc(notLegalAdvice) })
            : '';
        const refNote = ui.authorLicenseReferenceNote
            ? `<p class="text-xs text-slate-500 dark:text-slate-400 leading-snug m-0 mb-4">${esc(ui.authorLicenseReferenceNote)}</p>`
            : '';

        const authLicBody = `
                ${modalHeroHtml(ui, {
                    align: 'start',
                    title: esc(ui.authorLicenseTitle),
                    titleClass: 'text-lg font-black text-slate-800 dark:text-white m-0',
                    subtitle: esc(ui.authorLicenseSubtitleReference || ui.authorLicenseSubtitle),
                    subtitleClass: 'text-xs text-slate-500 mt-1 font-semibold',
                    backTagClass: 'js-authlic-back', closeTagClass: 'js-authlic-x',
                    extraWrapClass: 'pb-3 border-b border-slate-100 dark:border-slate-800',
                })}
                <div class="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar text-left pb-[max(1rem,env(safe-area-inset-bottom))]">
                    ${refNote}
                    ${section(ui.authorLicenseHeadingCC || 'Creative Commons', ccBody)}
                    ${section(ui.authorLicenseHeadingYou || 'Your responsibility', youBody)}
                    ${section(ui.authorLicenseHeadingArborito || 'Arborito software', arbBody)}
                    ${notLegal}
                </div>`;
        this.innerHTML = modalShellHtml({
            bodyHtml: authLicBody,
            layout: 'bottom-sheet',
            z: 135,
            enter: 'fade',
            scrim: 'translucent-strong',
            panelSize: 'lg-tight auto-h',
        });

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
