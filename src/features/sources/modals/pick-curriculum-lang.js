import { store } from '../../../core/store.js';
import { modalHeroHtml } from '../../../shared/ui/modal-hero.js';
import { CURRICULUM_LOCALE_PRESETS } from '../curriculum-locale-presets.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { bindMobileTap } from '../../../shared/ui/mobile-tap.js';
import { modalShellHtml } from '../../../shared/ui/modal-shell.js';
import { escHtml as esc } from '../../../shared/lib/html-escape.js';

class ArboritoModalPickCurriculumLang extends HTMLElement {
    connectedCallback() {
        if (typeof document !== 'undefined') {
            document.documentElement.classList.add('arborito-language-modal-open');
        }
        this.render();
    }

    disconnectedCallback() {
        if (typeof document !== 'undefined') {
            document.documentElement.classList.remove('arborito-language-modal-open');
        }
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
                ? `<p class="arborito-empty py-8 px-4">${esc(
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
                    <span class="arborito-eyebrow">${esc(p.code)}</span>
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

        const headerHtml = modalHeroHtml(ui, {
            mobile,
            title: esc(title),
            subtitle: mobile ? esc(subtitle) : undefined,
            backTagClass: 'btn-pick-lang-back',
            closeTagClass: 'btn-pick-lang-x',
            extraWrapClassDesktop: 'border-b border-slate-100 dark:border-slate-800',
        });
        const desktopSubtitle = mobile
            ? ''
            : `<p class="text-xs text-slate-500 dark:text-slate-400 px-4 pt-3 leading-relaxed">${esc(subtitle)}</p>`;

        const bodyHtml = `
                ${headerHtml}
                ${desktopSubtitle}
                <div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar">${grid}</div>`;
        this.innerHTML = modalShellHtml({
            bodyHtml,
            panelSize: 'lg-tight auto-h',
        });

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
