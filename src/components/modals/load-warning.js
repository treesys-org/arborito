
import { store } from '../../store.js';
import { modalWindowCloseXHtml, modalNavBackHtml } from '../../utils/dock-sheet-chrome.js';

class ArboritoModalLoadWarning extends HTMLElement {
    
    connectedCallback() {
        this.render();
    }

    cancel() {
        store.cancelUntrustedLoad();
    }

    confirm() {
        store.proceedWithUntrustedLoad();
    }

    render() {
        const ui = store.ui;
        const url = store.value.pendingUntrustedSource?.url;
        const mobBackCls =
            'arborito-mmenu-back shrink-0 w-10 h-10 flex items-center justify-center rounded-xl border border-red-200 dark:border-red-800/50 bg-white/80 dark:bg-slate-900/80 text-red-800 dark:text-red-200';

        this.innerHTML = `
        <div id="modal-backdrop" class="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950 p-4 animate-in arborito-modal-root">
            <div class="arborito-float-modal-card arborito-float-modal-card--auto-h arborito-float-modal-card--md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl relative overflow-hidden flex flex-col border border-red-500/50 dark:border-red-500/30 cursor-auto transition-all duration-300">
                <div class="arborito-float-modal-head shrink-0 px-4 pt-4 pb-3 border-b border-slate-100 dark:border-slate-800 bg-red-50 dark:bg-red-900/10">
                    ${modalNavBackHtml(ui, mobBackCls, { tagClass: 'btn-load-mob-back' })}
                    <div class="flex items-center gap-3 min-w-0 flex-1">
                        <span class="text-3xl shrink-0">⚠️</span>
                        <h3 class="font-black text-xl text-red-800 dark:text-red-300 truncate m-0">${ui.secLoadWarningTitle || "Load Unverified Tree?"}</h3>
                    </div>
                    ${modalWindowCloseXHtml(ui, 'btn-load-x')}
                </div>

                <div class="p-8 flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                    <p class="text-slate-600 dark:text-slate-300 mb-4 leading-relaxed">${ui.secLoadWarningBody}</p>
                    <p class="text-xs text-slate-500 dark:text-slate-400 mb-4">${ui.secWarningCheck}</p>
                    
                    <div class="bg-slate-100 dark:bg-slate-800 p-3 rounded-lg text-sm text-slate-700 dark:text-slate-300 font-mono break-all border border-slate-200 dark:border-slate-700">
                        ${url || 'N/A'}
                    </div>
                </div>
                
                <div class="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 flex flex-col md:flex-row gap-3">
                    <button class="btn-cancel w-full md:w-1/2 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold rounded-xl transition-colors">
                        ${ui.secLoadCancel || "No, take me to safety"}
                    </button>
                    <button class="btn-confirm w-full md:w-1/2 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl shadow-lg shadow-red-500/20 transition-transform active:scale-95">
                        ${ui.secLoadConfirm || "Yes, load this tree"}
                    </button>
                </div>
            </div>
        </div>`;

        this.querySelector('.btn-load-mob-back')?.addEventListener('click', () => this.cancel());
        this.querySelectorAll('.btn-load-x').forEach((b) => (b.onclick = () => this.cancel()));

        this.querySelector('.btn-cancel').onclick = () => this.cancel();
        this.querySelector('.btn-confirm').onclick = () => this.confirm();
    }
}

customElements.define('arborito-modal-load-warning', ArboritoModalLoadWarning);
