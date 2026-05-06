import { store } from '../store.js';

/**
 * Shows store `lastActionMessage` / `lastErrorMessage` (e.g. from `notify()`),
 * which previously had no visible layer above modals.
 */
class ArboritoToastStack extends HTMLElement {
    connectedCallback() {
        this._onState = () => this._paint();
        store.addEventListener('state-change', this._onState);
        this._paint();
    }

    disconnectedCallback() {
        store.removeEventListener('state-change', this._onState);
    }

    _paint() {
        const err = store.state.lastErrorMessage;
        const action = store.state.lastActionMessage;
        const msg = (err || action || '').trim();
        if (!msg) {
            this.innerHTML = '';
            return;
        }
        const isErr = !!err;
        const live = isErr ? 'assertive' : 'polite';
        const boxCls = isErr
            ? 'bg-red-50 dark:bg-red-950/90 text-red-900 dark:text-red-100 border-red-200 dark:border-red-800'
            : 'bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-700 dark:border-slate-300';
        this.innerHTML = `
            <div class="arborito-toast-stack fixed top-0 left-0 right-0 z-[200] flex justify-center pt-[max(0.75rem,env(safe-area-inset-top))] px-3 pointer-events-none" aria-live="${live}" role="${isErr ? 'alert' : 'status'}">
                <div class="pointer-events-auto max-w-md w-full rounded-2xl border px-4 py-3 text-sm font-semibold leading-snug shadow-xl ${boxCls}">
                </div>
            </div>`;
        const inner = this.querySelector('.pointer-events-auto');
        if (inner) inner.textContent = msg;
    }
}

customElements.define('arborito-toast-stack', ArboritoToastStack);
