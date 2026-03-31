
import { store } from '../../store.js';
import { shouldShowMobileUI } from '../../utils/breakpoints.js';
import { modalWindowCloseXHtml, modalNavBackHtml } from '../../utils/dock-sheet-chrome.js';
class ArboritoModalImpressum extends HTMLElement {
    constructor() {
        super();
        this.showDetails = false;
    }

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

    render() {
        const ui = store.ui;
        const impressumBody = ui.impressumText || '';
        const impressumDetailsDecoded = ui.impressumDetails || '';
        const mob = shouldShowMobileUI();
        const chrome = `
                <div class="arborito-float-modal-head arborito-dock-modal-hero shrink-0 px-4 pt-4 pb-2">
                    ${modalNavBackHtml(ui, 'arborito-mmenu-back shrink-0')}
                    <span class="text-2xl shrink-0" aria-hidden="true">⚖️</span>
                    <h2 class="arborito-mmenu-subtitle m-0 flex-1 min-w-0">${ui.impressumTitle}</h2>
                    ${modalWindowCloseXHtml(ui, 'btn-close')}
                </div>`;

        this.innerHTML = `
        <div id="modal-backdrop" class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950 p-4 animate-in arborito-modal-root">
            <div class="arborito-float-modal-card arborito-float-modal-card--lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl relative overflow-hidden flex flex-col border border-slate-200 dark:border-slate-800 cursor-auto">
                ${chrome}

                <div class="p-8 ${mob ? 'pt-2' : 'pt-4'} overflow-y-auto custom-scrollbar flex-1 min-h-0">
                    <div class="bg-slate-50 dark:bg-slate-950/50 p-6 rounded-2xl border border-slate-100 dark:border-slate-800">
                        <p class="text-slate-600 dark:text-slate-300 mb-4 leading-relaxed">${impressumBody}</p>
                        
                        <button id="btn-show-imp" class="${this.showDetails ? 'hidden' : 'block'} text-sky-500 hover:text-sky-600 dark:text-sky-400 dark:hover:text-sky-300 font-bold text-sm flex items-center gap-1 transition-colors">
                            <span>${ui.showImpressumDetails}</span>
                            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
                        </button>

                        <div class="${this.showDetails ? 'block' : 'hidden'} mt-6 pt-6 border-t border-slate-200 dark:border-slate-700 animate-in slide-in-from-top-2 fade-in">
                             <div class="flex flex-row flex-nowrap items-center justify-start gap-2.5 mb-6 w-full pl-0.5">
                                 <div class="w-12 h-12 shrink-0 bg-white dark:bg-slate-900 rounded-xl shadow-sm flex items-center justify-center text-xl border border-slate-100 dark:border-slate-800">🌲</div>
                                 <p class="font-black text-slate-800 dark:text-white m-0 leading-none whitespace-nowrap">treesys.org</p>
                             </div>
                             <pre class="whitespace-pre-wrap font-mono text-xs text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-100 dark:border-slate-800">${impressumDetailsDecoded}</pre>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;

        this.querySelectorAll('.btn-close').forEach((b) => (b.onclick = () => this.close()));
        
        const btnShow = this.querySelector('#btn-show-imp');
        if (btnShow) {
            btnShow.onclick = () => {
                this.showDetails = true;
                this.render();
            };
        }
    }
}
customElements.define('arborito-modal-impressum', ArboritoModalImpressum);
