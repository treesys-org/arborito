import { useEffect, useState } from 'react';

const OVERSCAN = 4;

/**
 * Window a scrollable list by scroll position (lightweight alternative to @tanstack/react-virtual).
 * @param {unknown[]} items
 * @param {import('react').RefObject<HTMLElement|null>} scrollRef
 * @param {{ rowHeight?: number, threshold?: number }} [opts]
 */
export function useVirtualScrollSlice(items, scrollRef, { rowHeight = 44, threshold = 25 } = {}) {
    const [range, setRange] = useState({ start: 0, end: items.length });

    useEffect(() => {
        if (!Array.isArray(items) || items.length <= threshold) {
            setRange({ start: 0, end: items.length });
            return undefined;
        }
        const el = scrollRef?.current;
        if (!el) return undefined;

        const update = () => {
            const start = Math.max(0, Math.floor(el.scrollTop / rowHeight) - OVERSCAN);
            const visible = Math.ceil(el.clientHeight / rowHeight) + OVERSCAN * 2;
            const end = Math.min(items.length, start + visible);
            setRange({ start, end });
        };

        update();
        el.addEventListener('scroll', update, { passive: true });
        window.addEventListener('resize', update);
        return () => {
            el.removeEventListener('scroll', update);
            window.removeEventListener('resize', update);
        };
    }, [items.length, scrollRef, rowHeight, threshold]);

    if (!Array.isArray(items) || items.length <= threshold) {
        return { items, paddingTop: 0, paddingBottom: 0, virtualized: false };
    }

    const slice = items.slice(range.start, range.end);
    return {
        items: slice,
        paddingTop: range.start * rowHeight,
        paddingBottom: Math.max(0, (items.length - range.end) * rowHeight),
        virtualized: true,
    };
}
