import { useEffect, useRef, useState } from 'react';

function prefersReducedMotion() {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    try {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
        return false;
    }
}

/**
 * Reveal `count` items one-by-one (1…count). Resets when `resetKey` changes.
 * Used so real graph knots/rows mount in order from the root — same chrome, staggered paint.
 *
 * @param {string|number|null|undefined} resetKey
 * @param {number} count
 * @param {number} [stepMs]
 * @param {{ instant?: boolean }} [opts] when true, show everything immediately (back / revisit)
 * @returns {number} how many items to show
 */
export function useGrowReveal(resetKey, count, stepMs = 85, opts = {}) {
    const instant = !!opts?.instant;
    const cap = Math.max(0, Number(count) || 0);
    const startShown = () => (prefersReducedMotion() || instant ? cap : Math.min(1, cap));
    /* Start at 1 so the root knot/SVG never blanks when structure first paints. */
    const [shown, setShown] = useState(startShown);
    const keyRef = useRef(resetKey);
    const instantRef = useRef(instant);

    useEffect(() => {
        const keyChanged = keyRef.current !== resetKey;
        const instantChanged = instantRef.current !== instant;
        keyRef.current = resetKey;
        instantRef.current = instant;
        if (!keyChanged && !instantChanged) return;
        const nextCap = Math.max(0, Number(count) || 0);
        setShown(prefersReducedMotion() || instant ? nextCap : Math.min(1, nextCap));
    }, [resetKey, count, instant]);

    useEffect(() => {
        if (prefersReducedMotion() || instant) {
            setShown(cap);
            return undefined;
        }
        if (shown > cap) {
            setShown(cap);
            return undefined;
        }
        if (shown >= cap) return undefined;
        const delay = shown === 0 ? 16 : Math.max(32, Number(stepMs) || 85);
        const t = setTimeout(() => setShown((s) => Math.min(cap, s + 1)), delay);
        return () => clearTimeout(t);
    }, [shown, cap, stepMs, resetKey, instant]);

    return Math.min(Math.max(shown, cap > 0 ? 1 : 0), cap);
}
