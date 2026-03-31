
import { store } from '../../store.js';
import { modalWindowCloseXHtml, modalNavBackHtml } from '../../utils/dock-sheet-chrome.js';

class ArboritoModalLanguage extends HTMLElement {
    connectedCallback() {
        this.render();
    }

    close() {
        store.dismissModal();
    }

    render() {
        const ui = store.ui;
        this.innerHTML = `
        <div id="modal-backdrop" class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950 p-4 animate-in arborito-modal-root">
            <div class="arborito-float-modal-card arborito-float-modal-card--auto-h arborito-float-modal-card--narrow bg-white dark:bg-slate-900 rounded-3xl shadow-2xl relative overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800 cursor-auto">
                <div class="arborito-float-modal-head arborito-dock-modal-hero shrink-0 px-4 pt-4 pb-2">
                    ${modalNavBackHtml(ui, 'arborito-mmenu-back shrink-0')}
                    <span class="text-2xl shrink-0" aria-hidden="true">🌍</span>
                    <h2 class="arborito-mmenu-subtitle m-0 flex-1 min-w-0">${ui.languageTitle}</h2>
                    ${modalWindowCloseXHtml(ui, 'btn-close')}
                </div>

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
                </div>
            </div>
        </div>`;

        this.querySelectorAll('.btn-close').forEach((b) => (b.onclick = () => this.close()));
        
        this.querySelectorAll('.btn-lang-sel').forEach(b => {
             b.onclick = (e) => {
                const code = e.currentTarget.dataset.code;
                this.close();
                // Ensure the stack clears for UI repaint before freezing with data processing
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        store.setLanguage(code);
                    });
                });
             };
        });
    }
}
customElements.define('arborito-modal-language', ArboritoModalLanguage);
