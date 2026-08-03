import { useCallback, useEffect, useRef } from 'react';

/**
 * Bottom sentinel for infinite list growth inside scrollable hubs/modals.
 * Prefer passing `getScrollRoot` (e.g. `#tab-content-scroll`) so IO roots match the sheet.
 *
 * Pass `armKey` (e.g. visible count / filter key) so we re-check after the list grows
 * while the sentinel stays on-screen — IntersectionObserver alone only fires on edge
 * crossings. Keep cool-down long enough that load-more / catalog widen cannot thrash.
 *
 * @param {{
 *   enabled?: boolean,
 *   busy?: boolean,
 *   onLoadMore?: () => void,
 *   getScrollRoot?: () => Element | null,
 *   rootMargin?: string,
 *   armKey?: string | number,
 *   coolDownMs?: number,
 * }} opts
 */
function rootMarginTopPx(rootMargin, root) {
    const raw = String(rootMargin || '0').trim().split(/\s+/)[0] || '0';
    if (raw.endsWith('px')) return Number.parseFloat(raw) || 0;
    if (raw.endsWith('%')) {
        const pct = Number.parseFloat(raw);
        const h =
            (root && typeof root.getBoundingClientRect === 'function'
                ? root.getBoundingClientRect().height
                : 0) ||
            (typeof window !== 'undefined' ? window.innerHeight : 0) ||
            600;
        return (h * (Number.isFinite(pct) ? pct : 70)) / 100;
    }
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) ? n : 160;
}

function isNearScrollRoot(el, root, marginPx) {
    if (!el) return false;
    const er = el.getBoundingClientRect();
    const rr = root
        ? root.getBoundingClientRect()
        : { top: 0, left: 0, bottom: window.innerHeight, right: window.innerWidth };
    return (
        er.top < rr.bottom + marginPx &&
        er.bottom > rr.top - marginPx &&
        er.left < rr.right + marginPx &&
        er.right > rr.left - marginPx
    );
}

export function useInfiniteScrollSentinel({
    enabled = true,
    busy = false,
    onLoadMore,
    getScrollRoot,
    rootMargin = '160px',
    armKey = 0,
    coolDownMs = 400,
} = {}) {
    const sentinelRef = useRef(null);
    const busyRef = useRef(busy);
    const loadRef = useRef(onLoadMore);
    const enabledRef = useRef(enabled);
    const coolRef = useRef(false);
    const coolTimerRef = useRef(0);
    busyRef.current = busy;
    loadRef.current = onLoadMore;
    enabledRef.current = enabled;

    const stableGetRoot = useCallback(() => {
        if (typeof getScrollRoot === 'function') return getScrollRoot() || null;
        return null;
    }, [getScrollRoot]);

    const tryLoad = useCallback(() => {
        if (!enabledRef.current || busyRef.current || coolRef.current) return;
        coolRef.current = true;
        loadRef.current?.();
        if (coolTimerRef.current) window.clearTimeout(coolTimerRef.current);
        coolTimerRef.current = window.setTimeout(() => {
            coolRef.current = false;
            coolTimerRef.current = 0;
        }, Math.max(120, Number(coolDownMs) || 400));
    }, [coolDownMs]);

    useEffect(() => {
        return () => {
            if (coolTimerRef.current) window.clearTimeout(coolTimerRef.current);
        };
    }, []);

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
                    if (!entries.some((e) => e.isIntersecting)) return;
                    tryLoad();
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
    }, [enabled, rootMargin, stableGetRoot, tryLoad]);

    /*
     * Re-arm after pagination while the sentinel is still in view.
     * Without this, IO never fires again until the user scrolls away and back.
     */
    useEffect(() => {
        if (!enabled || busy) return undefined;
        const el = sentinelRef.current;
        if (!el) return undefined;
        const marginPx = rootMarginTopPx(rootMargin, stableGetRoot());
        const id = requestAnimationFrame(() => {
            const root = stableGetRoot();
            if (isNearScrollRoot(el, root, marginPx)) tryLoad();
        });
        return () => cancelAnimationFrame(id);
    }, [enabled, busy, armKey, rootMargin, stableGetRoot, tryLoad]);

    return sentinelRef;
}
