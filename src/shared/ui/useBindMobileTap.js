import { useEffect, useRef } from 'react';
import { bindMobileTap } from './mobile-tap.js';

/**
 * Attach mobile-tap wiring to a ref-backed element (WebKit drops click after parent scroll).
 *
 * @param {import('react').RefObject<Element | null>} ref
 * @param {(ev: Event) => void} handler
 * @param {boolean} [enabled=true]
 * @param {{ slopPx?: number }} [opts]
 */
export function useBindMobileTapRef(ref, handler, enabled = true, opts = undefined) {
    const handlerRef = useRef(handler);
    const slopPx = typeof opts?.slopPx === 'number' ? opts.slopPx : undefined;
    handlerRef.current = handler;

    useEffect(() => {
        const el = ref?.current;
        if (!el || !enabled) return undefined;
        return bindMobileTap(el, (ev) => handlerRef.current(ev), { slopPx });
        /* Only rebind when enablement flips — re-wiring every render drops mid-tap. */
    }, [ref, enabled, slopPx]);
}
