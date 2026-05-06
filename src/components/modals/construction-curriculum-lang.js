import { store } from '../../store.js';
import { bindMobileTap } from '../../utils/mobile-tap.js';
import { modalWindowCloseXHtml, modalNavBackHtml } from '../../utils/dock-sheet-chrome.js';
import { shouldShowMobileUI } from '../../utils/breakpoints.js';
import { curriculumLangSelectOptionsHtml, bindCurriculumLangSelect } from '../../utils/construction-curriculum-lang-select.js';

function esc(s) {
    return String(s != null ? s : '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

class ArboritoModalConstructionCurriculumLang extends HTMLElement {
    connectedCallback() {
        this.render();
    }

    close() {
        store.dismissModal();
    }

    render() {
        const ui = store.ui;
        const raw = store.state.rawGraphData;
        const langKeys =
            (raw && raw.languages) && typeof raw.languages === 'object' ? Object.keys(raw.languages).sort() : [];
        const curriculumEditLang = store.state.curriculumEditLang || '';
        const mobile = shouldShowMobileUI();

        const langSelectInner = curriculumLangSelectOptionsHtml(
            ui,
            langKeys,
            curriculumEditLang,
            esc,
            store.state.lang || ''
        );
        const title =
            ui.conConstructionLangModalTitle || ui.conLangDockTab || ui.conCurriculumLangLabel || 'Language';
        const fieldLb = ui.conCurriculumLangLabel || 'Content language';

        const headMobile = `
                <div class="arborito-sheet__hero arborito-sheet__hero--mmenu-sub arborito-dock-modal-hero shrink-0 flex items-center gap-2">
                    ${modalNavBackHtml(ui, 'arborito-mmenu-back shrink-0', { tagClass: 'btn-construct-lang-close' })}
                    <div class="min-w-0 flex-1 flex items-center gap-2">
                        <span class="text-2xl shrink-0 leading-none" aria-hidden="true">🌐</span>
                        <h2 class="arborito-mmenu-subtitle m-0">${esc(title)}</h2>
                    </div>
                    ${modalWindowCloseXHtml(ui, 'btn-construct-lang-close')}
                </div>`;
        const headDesktop = `
                <div class="arborito-float-modal-head arborito-dock-modal-hero shrink-0 px-4 pt-4 pb-2 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
                    <span class="text-2xl shrink-0 leading-none" aria-hidden="true">🌐</span>
                    <h2 class="arborito-mmenu-subtitle m-0 flex-1 min-w-0">${esc(title)}</h2>
                    ${modalWindowCloseXHtml(ui, 'btn-construct-lang-close')}
                </div>`;

        this.innerHTML = `
        <div id="modal-backdrop" class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 p-3 md:p-4 animate-in fade-in arborito-modal-root">
            <div class="arborito-float-modal-card arborito-float-modal-card--auto-h w-full max-w-md max-h-[90dvh] bg-white dark:bg-slate-900 rounded-3xl shadow-2xl relative overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800">
                ${mobile ? headMobile : headDesktop}
                <div class="px-4 pt-4 pb-6 md:pb-5 flex flex-col gap-2">
                    <label class="block">
                        <span class="text-[0.625rem] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-2">${esc(fieldLb)}</span>
                        <select id="modal-construct-curriculum-lang" class="w-full text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 px-3 py-3 outline-none focus:ring-2 focus:ring-teal-500/40 font-mono" aria-label="${esc(fieldLb)}">${langSelectInner}</select>
                    </label>
                </div>
            </div>
        </div>`;

        this.querySelectorAll('.btn-construct-lang-close').forEach((b) => bindMobileTap(b, () => this.close()));

        const sel = this.querySelector('#modal-construct-curriculum-lang');
        bindCurriculumLangSelect(sel, {
            addLangOpts: { fromConstructionLangModal: true }
        });
    }
}

customElements.define('arborito-modal-construction-curriculum-lang', ArboritoModalConstructionCurriculumLang);
