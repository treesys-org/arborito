
import { store } from '../../store.js';
import { modalWindowCloseXHtml, modalNavBackHtml } from '../../utils/dock-sheet-chrome.js';

class ArboritoModalDialog extends HTMLElement {
    constructor() {
        super();
        this.value = '';
    }

    connectedCallback() {
        this.render();
        // Auto-focus input if it's a prompt
        setTimeout(() => {
            const inp = this.querySelector('input');
            if (inp) inp.focus();
            else {
                const btn = this.querySelector('.btn-confirm');
                if (btn) btn.focus();
            }
        }, 50);
        
        // Trap enter key for prompt
        this.addEventListener('keydown', (e) => {
            if(e.key === 'Enter') {
                e.preventDefault();
                this.confirm();
            }
            if(e.key === 'Escape') {
                this.cancel();
            }
        });
    }

    cancel() {
        store.closeDialog(null); // Resolve promise with null/false
    }

    confirm() {
        const type = store.value.modal.dialogType;
        if (type === 'prompt') {
            const val = this.querySelector('input').value;
            store.closeDialog(val || ''); // Return empty string if empty
        } else if (type === 'confirm') {
            store.closeDialog(true);
        } else {
            store.closeDialog(true); // Alert OK
        }
    }

    render() {
        const { title, body, dialogType, placeholder, confirmText, cancelText, danger } = store.value.modal;
        
        const isPrompt = dialogType === 'prompt';
        const isConfirm = dialogType === 'confirm';
        const isAlert = dialogType === 'alert';
        
        let icon = 'ℹ️';
        if (danger) icon = '⚠️';
        if (isPrompt) icon = '✍️';
        if (isConfirm && !danger) icon = '❓';

        let confirmBtnClass = danger 
            ? 'bg-red-600 hover:bg-red-500 text-white' 
            : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90';

        const ui = store.ui;
        const chromeRow = `<div class="arborito-float-modal-head arborito-dock-modal-hero shrink-0 px-4 pt-4 pb-2">
                ${modalNavBackHtml(ui, 'arborito-mmenu-back shrink-0', { tagClass: 'btn-dialog-mob-back' })}
                <h2 class="arborito-mmenu-subtitle m-0 flex-1 min-w-0">${title}</h2>
                ${modalWindowCloseXHtml(ui, 'btn-dialog-dismiss')}
            </div>`;

        this.innerHTML = `
        <div id="modal-backdrop" class="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950 p-4 animate-in fade-in duration-200 arborito-modal-root">
            <div class="arborito-float-modal-card arborito-float-modal-card--auto-h arborito-float-modal-card--narrow bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-200 relative overflow-hidden flex flex-col">
                ${chromeRow}
                <div class="p-6 pt-2">
                <div class="flex flex-col items-center text-center mb-6">
                    <div class="text-4xl mb-4">${icon}</div>
                    <p class="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">${body}</p>
                </div>

                ${isPrompt ? `
                <div class="mb-6">
                    <input type="text" class="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-xl px-4 py-3 text-sm font-bold text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" placeholder="${placeholder || ''}">
                </div>
                ` : ''}

                <div class="flex gap-3">
                    ${!isAlert ? `
                    <button class="btn-cancel flex-1 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold rounded-xl transition-colors text-xs uppercase tracking-wider">
                        ${cancelText || 'Cancel'}
                    </button>
                    ` : ''}
                    
                    <button class="btn-confirm flex-1 py-3 ${confirmBtnClass} font-bold rounded-xl shadow-lg transition-transform active:scale-95 text-xs uppercase tracking-wider">
                        ${confirmText || 'OK'}
                    </button>
                </div>
                </div>
            </div>
        </div>`;

        const cancelFn = () => this.cancel();
        const mobBackBtn = this.querySelector('.btn-dialog-mob-back');
        if (mobBackBtn) mobBackBtn.onclick = cancelFn;
        this.querySelectorAll('.btn-dialog-dismiss').forEach((b) => (b.onclick = cancelFn));

        const btnCancel = this.querySelector('.btn-cancel');
        if (btnCancel) btnCancel.onclick = () => this.cancel();
        
        const btnConfirm = this.querySelector('.btn-confirm');
        if (btnConfirm) btnConfirm.onclick = () => this.confirm();
        
        // Close on backdrop click if it's just an alert or non-critical confirm
        if (!danger) {
            this.querySelector('#modal-backdrop').onclick = (e) => {
                if (e.target === e.currentTarget) this.cancel();
            }
        }
    }
}

customElements.define('arborito-modal-dialog', ArboritoModalDialog);
