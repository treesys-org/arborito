/**
 * Yield so the browser can paint spinners / loading chrome before heavy JS runs.
 * Double-rAF: first frame commits DOM, second frame paints, then we continue.
 */
export function yieldToPaint() {
    if (typeof requestAnimationFrame !== 'function') {
        return new Promise((resolve) => setTimeout(resolve, 16));
    }
    return new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
}

/** Schedule `fn` after the next painted frame. */
export function runAfterPaint(fn) {
    void yieldToPaint().then(() => {
        try {
            fn();
        } catch (e) {
            console.warn('[Arborito] runAfterPaint', e);
        }
    });
}

/** Low-priority background work, never gate core app features on this.
 * @returns {() => void} cancel handle
 */
export function scheduleIdle(fn, timeoutMs = 4000) {
    if (typeof window === 'undefined') {
        fn();
        return () => {};
    }
    let cancelled = false;
    let idleId = 0;
    let timerId = 0;
    const run = () => {
        if (cancelled) return;
        try {
            fn();
        } catch (e) {
            console.warn('[Arborito] scheduleIdle', e);
        }
    };
    if (typeof window.requestIdleCallback === 'function') {
        idleId = window.requestIdleCallback(run, { timeout: timeoutMs });
        return () => {
            cancelled = true;
            if (idleId && typeof window.cancelIdleCallback === 'function') {
                window.cancelIdleCallback(idleId);
            }
        };
    }
    timerId = setTimeout(run, Math.min(timeoutMs, 1500));
    return () => {
        cancelled = true;
        clearTimeout(timerId);
    };
}
