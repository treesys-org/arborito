import { useCallback } from 'react';
import { useShellUiSlice } from '../../stores/shell-ui-store.js';
import { getArboritoStore } from '../../core/store-singleton.js';

/** Toast from store.notify() — tap the chip to dismiss. Sits above the dock on mobile, not over the header. */
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
            <div className="arborito-toast-stack" aria-live={live}>
                <button
                    type="button"
                    className={`arborito-toast${isErr ? ' arborito-toast--error' : ''}`}
                    role={isErr ? 'alert' : 'status'}
                    aria-label={`${msg}. ${dismissLabel}`}
                    onClick={dismiss}
                >
                    <span className="arborito-toast__msg">{msg}</span>
                </button>
            </div>
        </div>
    );
}
