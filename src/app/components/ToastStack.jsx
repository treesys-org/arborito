import { useShellUiSlice } from '../../stores/shell-ui-store.js';

/** Toast notifications from store.notify() — pure React. */
export function ToastStack() {
    const err = useShellUiSlice((s) => s.lastErrorMessage);
    const action = useShellUiSlice((s) => s.lastActionMessage);
    const msg = (err || action || '').trim();
    if (!msg) return null;

    const isErr = !!err;
    const live = isErr ? 'assertive' : 'polite';
    const boxCls = isErr
        ? 'bg-red-50 dark:bg-red-950/90 text-red-900 dark:text-red-100 border-red-200 dark:border-red-800'
        : 'bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-700 dark:border-slate-300';

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
                    className={`pointer-events-auto max-w-md w-full rounded-2xl border px-4 py-3 text-sm font-semibold leading-snug shadow-xl ${boxCls}`}
                >
                    {msg}
                </div>
            </div>
        </div>
    );
}
