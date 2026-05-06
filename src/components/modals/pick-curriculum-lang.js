import { store } from '../../store.js';
import { modalWindowCloseXHtml, modalNavBackHtml } from '../../utils/dock-sheet-chrome.js';
import { CURRICULUM_LOCALE_PRESETS } from '../../config/curriculum-locale-presets.js';
import { shouldShowMobileUI } from '../../utils/breakpoints.js';
import { bindMobileTap } from '../../utils/mobile-tap.js';

function esc(s) {
    return String(s != null ? s : '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

class ArboritoModalPickCurriculumLang extends HTMLElement {
    connectedCallback() {
        this.render();
    }

    close() {
        store.dismissModal();
    }

    pick(code) {
        if (store.applyCurriculumPresetLanguage(code)) {
            store.dismissModal();
        }
    }

    render() {
        const ui = store.ui;
        const raw = store.value.rawGraphData;
        const existing = (raw && raw.languages) && typeof raw.languages === 'object' ? new Set(Object.keys(raw.languages)) : new Set();
        const available = CURRICULUM_LOCALE_PRESETS.filter((p) => !existing.has(p.code));
        const mobile = shouldShowMobileUI();

        const grid =
            available.length === 0
                ? `<p class="text-sm text-center text-slate-500 dark:text-slate-400 py-8 px-4">${esc(
                      ui.pickCurriculumLangAllPresent ||
                          'Every preset language is already in this tree.'
                  )}</p>`
                : `<div class="grid grid-cols-2 sm:grid-cols-3 gap-2 p-4 pt-2">
            ${available
                .map(
                    (p) => `
                <button type="button" class="pick-lang-btn flex flex-col items-center gap-1 p-3 rounded-2xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800/80 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors text-center min-h-[5.5rem] justify-center"
                    data-code="${esc(p.code)}">
                    <span class="text-2xl leading-none" aria-hidden="true">${p.flag}</span>
                    <span class="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wide">${esc(p.code)}</span>
                    <span class="text-xs font-semibold text-slate-700 dark:text-slate-200 leading-tight line-clamp-2">${esc(p.label)}</span>
                </button>`
                )
                .join('')}
        </div>`;

        const title = ui.pickCurriculumLangTitle || ui.addCurriculumLangTitle || 'Add curriculum language';
        const subtitle =
            ui.pickCurriculumLangSubtitle ||
            ui.addCurriculumLangBody ||
            'Choose a language. The folder structure is copied from the one you are editing now.';

        const headMobile = `
                <div class="arborito-sheet__hero arborito-sheet__hero--mmenu-sub arborito-dock-modal-hero shrink-0 flex items-center gap-2">
                    ${modalNavBackHtml(ui, 'arborito-mmenu-back shrink-0', { tagClass: 'btn-pick-lang-back' })}
                    <div class="min-w-0 flex-1">
                        <h2 class="arborito-mmenu-subtitle m-0">${esc(title)}</h2>
                        <p class="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">${esc(subtitle)}</p>
                    </div>
                    ${modalWindowCloseXHtml(ui, 'btn-pick-lang-x')}
                </div>`;
        const headDesktop = `
                <div class="arborito-float-modal-head arborito-dock-modal-hero shrink-0 px-4 pt-4 pb-2 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
                    <span class="w-0 shrink-0" aria-hidden="true"></span>
                    <h2 class="arborito-mmenu-subtitle m-0 flex-1 min-w-0">${esc(title)}</h2>
                    ${modalWindowCloseXHtml(ui, 'btn-pick-lang-x')}
                </div>
                <p class="text-xs text-slate-500 dark:text-slate-400 px-4 pt-3 leading-relaxed">${esc(subtitle)}</p>`;

        this.innerHTML = `
        <div id="modal-backdrop" class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950 p-3 md:p-4 animate-in arborito-modal-root">
            <div class="arborito-float-modal-card arborito-float-modal-card--auto-h w-full max-w-lg max-h-[90dvh] bg-white dark:bg-slate-900 rounded-3xl shadow-2xl relative overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800">
                ${mobile ? headMobile : headDesktop}
                <div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar">${grid}</div>
            </div>
        </div>`;

        this.querySelectorAll('.btn-pick-lang-back, .btn-pick-lang-x').forEach((b) => {
            bindMobileTap(b, () => this.close());
        });
        this.querySelectorAll('.pick-lang-btn').forEach((btn) => {
            bindMobileTap(btn, (ev) => {
                if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation();
                const c = btn.getAttribute('data-code');
                if (c) this.pick(c);
            });
        });
    }
}

customElements.define('arborito-modal-pick-curriculum-lang', ArboritoModalPickCurriculumLang);
