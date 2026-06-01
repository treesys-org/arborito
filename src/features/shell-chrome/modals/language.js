import { store } from '../../../core/store.js';
import { bindMobileTap, bindCloseTaps } from '../../../shared/ui/mobile-tap.js';
import { modalShellHtml } from '../../../shared/ui/modal-shell.js';
import { modalHeroHtml } from '../../../shared/ui/modal-hero.js';

class ArboritoModalLanguage extends HTMLElement {
    connectedCallback() {
        this.render();
    }

    close() {
        store.dismissModal();
    }

    render() {
        const ui = store.ui;
        const body = `
                ${modalHeroHtml(ui, { title: ui.languageTitle, leadingIcon: '<span class="text-2xl shrink-0" aria-hidden="true">🌍</span>', tagClass: 'btn-close' })}

                <div class="p-6 pt-2 grid grid-cols-1 gap-3 overflow-y-auto custom-scrollbar flex-1 min-h-0">
                    ${store.availableLanguages.map(l => `
                        <button class="btn-lang-sel p-4 border-2 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-all flex items-start gap-4 group ${store.value.lang === l.code ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-slate-100 dark:border-slate-700'}" data-code="${l.code}">
                            <span class="text-4xl shrink-0 leading-none mt-0.5 drop-shadow-sm group-hover:scale-110 transition-transform" aria-hidden="true">${l.flag}</span>
                            <div class="text-left flex-1 min-w-0">
                                <span class="font-bold text-slate-700 dark:text-slate-200 block text-lg leading-tight">${l.nativeName}</span>
                                <span class="text-xs text-slate-400 dark:text-slate-500 leading-tight">${l.name}</span>
                            </div>
                            <span class="w-10 shrink-0 flex items-start justify-center text-xl font-bold text-green-500 leading-none pt-1" aria-hidden="true">${store.value.lang === l.code ? '✓' : ''}</span>
                        </button>
                    `).join('')}
                </div>`;
        this.innerHTML = modalShellHtml({
            bodyHtml: body,
            panelSize: 'auto-h',
            panelClass: 'arborito-float-modal-card--narrow',
        });

        bindCloseTaps(this, () => this.close());

        this.querySelectorAll('.btn-lang-sel').forEach((b) => {
            const code = String((b && b.dataset && b.dataset.code) || '').trim();
            bindMobileTap(b, async () => {
                if (!code) return;
                try {
                    await store.setLanguage(code);
                } catch (e) {
                    console.error('[Arborito] language modal setLanguage', e);
                }
                this.close();
            });
        });
    }
}
customElements.define('arborito-modal-language', ArboritoModalLanguage);
