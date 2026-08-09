import { useCallback } from 'react';
import { useShellUiSlice } from '../../stores/shell-ui-store.js';
import { getArboritoStore } from '../../core/store-singleton.js';

/** Toast notifications from store.notify(), pure React. */
export function ToastStack() {
    const err = useShellUiSlice((s) => s.lastErrorMessage);
    const action = useShellUiSlice((s) => s.lastActionMessage);
    const msg = (err || action || '').trim();

    const dismiss = useCallback(() => {
        const store = getArboritoStore();
        store?.update?.({ lastActionMessage: null, lastErrorMessage: null });
    }, []);

    if (!msg) return null;

    const isErr = !!err;
    const live = isErr ? 'assertive' : 'polite';
    const boxCls = isErr
        ? 'bg-red-50 dark:bg-red-950/90 text-red-900 dark:text-red-100 border-red-200 dark:border-red-800'
        : 'bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-700 dark:border-slate-300';
    const btnCls = isErr
        ? 'text-red-700 dark:text-red-200 hover:bg-red-100/80 dark:hover:bg-red-900/50'
        : 'text-white/80 dark:text-slate-700 hover:bg-white/15 dark:hover:bg-slate-900/10';
    const ui = getArboritoStore()?.ui || {};
    const dismissLabel = ui.toastDismiss || ui.close || 'Close';

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 2147483000,
                pointerEvents: 'none',
            }}
            data-arborito-panel="toast-stack"
        >
            <div
                className="arborito-toast-stack fixed top-0 left-0 right-0 z-[9999] flex justify-center pt-[max(0.75rem,env(safe-area-inset-top))] px-3 pointer-events-none"
                aria-live={live}
                role={isErr ? 'alert' : 'status'}
            >
                <div
                    className={`pointer-events-auto max-w-md w-full rounded-2xl border px-3 py-2.5 text-sm font-semibold leading-snug shadow-xl flex items-start gap-2 ${boxCls}`}
                >
                    <p className="m-0 flex-1 min-w-0 pt-0.5">{msg}</p>
                    <button
                        type="button"
                        className={`shrink-0 rounded-lg px-2 py-1 text-base leading-none font-bold ${btnCls}`}
                        aria-label={dismissLabel}
                        onClick={dismiss}
                    >
                        ×
                    </button>
                </div>
            </div>
        </div>
    );
}
