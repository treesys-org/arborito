import { useCallback, useEffect, useRef } from 'react';

/**
 * Bottom sentinel for infinite list growth inside scrollable hubs/modals.
 * Prefer passing `getScrollRoot` (e.g. `#tab-content-scroll`) so IO roots match the sheet.
 *
 * @param {{
 *   enabled?: boolean,
 *   busy?: boolean,
 *   onLoadMore?: () => void,
 *   getScrollRoot?: () => Element | null,
 *   rootMargin?: string,
 * }} opts
 */
export function useInfiniteScrollSentinel({
    enabled = true,
    busy = false,
    onLoadMore,
    getScrollRoot,
    rootMargin = '160px',
} = {}) {
    const sentinelRef = useRef(null);
    const busyRef = useRef(busy);
    const loadRef = useRef(onLoadMore);
    busyRef.current = busy;
    loadRef.current = onLoadMore;

    const stableGetRoot = useCallback(() => {
        if (typeof getScrollRoot === 'function') return getScrollRoot() || null;
        return null;
    }, [getScrollRoot]);

    useEffect(() => {
        if (!enabled) return undefined;
        const el = sentinelRef.current;
        if (!el) return undefined;

        let cancelled = false;
        let io = null;

        const attach = () => {
            if (cancelled) return;
            const root = stableGetRoot();
            io = new IntersectionObserver(
                (entries) => {
                    if (busyRef.current) return;
                    if (!entries.some((e) => e.isIntersecting)) return;
                    loadRef.current?.();
                },
                { root, rootMargin, threshold: 0 }
            );
            io.observe(el);
        };

        /* Scroll root may mount a frame later inside dock sheets. */
        const raf = requestAnimationFrame(attach);
        return () => {
            cancelled = true;
            cancelAnimationFrame(raf);
            io?.disconnect();
        };
    }, [enabled, rootMargin, stableGetRoot]);

    return sentinelRef;
}
