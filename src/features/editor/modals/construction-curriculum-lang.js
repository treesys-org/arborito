import { store } from '../../../core/store.js';
import { bindMobileTap } from '../../../shared/ui/mobile-tap.js';
import { modalHeroHtml } from '../../../shared/ui/modal-hero.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { curriculumLangSelectOptionsHtml, bindCurriculumLangSelect } from '../construction-curriculum-lang-select.js';
import { modalShellHtml } from '../../../shared/ui/modal-shell.js';
import { escHtml as esc } from '../../../shared/lib/html-escape.js';

class ArboritoModalConstructionCurriculumLang extends HTMLElement {
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

        const headerHtml = modalHeroHtml(ui, {
            mobile,
            title: esc(title),
            leadingIcon: '<span class="text-2xl shrink-0 leading-none" aria-hidden="true">🌐</span>',
            tagClass: 'btn-construct-lang-close',
            extraWrapClassDesktop: 'border-b border-slate-100 dark:border-slate-800',
        });

        const bodyHtml = `
                ${headerHtml}
                <div class="px-4 pt-4 pb-6 md:pb-5 flex flex-col gap-2">
                    <label class="block">
                        <span class="arborito-eyebrow block mb-2">${esc(fieldLb)}</span>
                        <select id="modal-construct-curriculum-lang" class="arborito-select font-semibold font-mono" aria-label="${esc(fieldLb)}">${langSelectInner}</select>
                    </label>
                </div>`;
        this.innerHTML = modalShellHtml({
            bodyHtml,
            panelSize: 'narrow auto-h',
            scrim: 'translucent',
        });

        this.querySelectorAll('.btn-construct-lang-close').forEach((b) => bindMobileTap(b, () => this.close()));

        const sel = this.querySelector('#modal-construct-curriculum-lang');
        bindCurriculumLangSelect(sel, {
            addLangOpts: { fromConstructionLangModal: true }
        });
    }
}

customElements.define('arborito-modal-construction-curriculum-lang', ArboritoModalConstructionCurriculumLang);
