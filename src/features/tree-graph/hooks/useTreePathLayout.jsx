import { useLayoutEffect, useState, useCallback } from 'react';
import { measureTreePathLayout } from '../api/logic/path-geometry.js';

const EMPTY_LAYOUT = {
    trunkD: '',
    trunkActiveD: '',
    connectorD: '',
    svgWidth: 1,
    svgHeight: 1,
    svgLeft: 0,
};

function stripRetry(layout) {
    if (!layout) return layout;
    const { needsRetry: _needsRetry, ...rest } = layout;
    return rest;
}

function layoutsEqual(a, b) {
    if (a === b) return true;
    return (
        a.trunkD === b.trunkD &&
        a.trunkActiveD === b.trunkActiveD &&
        a.connectorD === b.connectorD &&
        a.svgWidth === b.svgWidth &&
        a.svgHeight === b.svgHeight &&
        a.svgLeft === b.svgLeft
    );
}

/**
 * Measure trunk + connector SVG paths for TreePathChrome.
 */
export function useTreePathLayout({ model, hostRefs, panelEl }) {
    const [layout, setLayout] = useState(EMPTY_LAYOUT);
    const pathLen = model?.pathNodes?.length ?? 0;
    const activeIndex = model?.activeIndex ?? -1;

    const commitLayout = useCallback((next) => {
        if (!next) return;
        const stripped = stripRetry(next);
        setLayout((prev) => (layoutsEqual(prev, stripped) ? prev : stripped));
    }, []);

    const measure = useCallback(() => {
        const scrollContent = hostRefs?.scrollContent?.current;
        const trunkCol = hostRefs?.trunkCol?.current;
        const trunkBody = hostRefs?.trunkBody?.current;
        const knotsContainer = hostRefs?.knots?.current;
        if (!scrollContent || !trunkCol || !knotsContainer) {
            setLayout((prev) => (layoutsEqual(prev, EMPTY_LAYOUT) ? prev : EMPTY_LAYOUT));
            return { needsRetry: true };
        }

        const next = measureTreePathLayout({
            scrollContent,
            trunkCol,
            trunkBody,
            knotsContainer,
            panelEl,
            activeIndex,
        });
        if (next) commitLayout(next);
        return next;
    }, [hostRefs, panelEl, activeIndex, commitLayout]);

    useLayoutEffect(() => {
        if (!pathLen) {
            setLayout((prev) => (layoutsEqual(prev, EMPTY_LAYOUT) ? prev : EMPTY_LAYOUT));
            return undefined;
        }

        let cancelled = false;
        let raf1 = 0;
        let raf2 = 0;

        const run = () => {
            if (cancelled) return;
            const next = measure();
            if (next?.needsRetry && !cancelled) {
                raf1 = requestAnimationFrame(() => {
                    raf2 = requestAnimationFrame(() => {
                        if (!cancelled) measure();
                    });
                });
            }
        };

        run();

        return () => {
            cancelled = true;
            if (raf1) cancelAnimationFrame(raf1);
            if (raf2) cancelAnimationFrame(raf2);
        };
    }, [pathLen, activeIndex, measure]);

    useLayoutEffect(() => {
        const scrollContent = hostRefs?.scrollContent?.current;
        const trunkBody = hostRefs?.trunkBody?.current;
        const trunkContainer = hostRefs?.trunkContainer?.current;
        if (!scrollContent) return undefined;

        let raf = 0;
        const onResize = () => {
            if (raf) cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
                raf = 0;
                measure();
            });
        };
        const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null;
        ro?.observe(scrollContent);
        if (trunkBody) ro?.observe(trunkBody);
        trunkContainer?.addEventListener('scroll', onResize, { passive: true });
        window.addEventListener('resize', onResize);
        window.addEventListener('orientationchange', onResize);

        return () => {
            if (raf) cancelAnimationFrame(raf);
            ro?.disconnect();
            trunkContainer?.removeEventListener('scroll', onResize);
            window.removeEventListener('resize', onResize);
            window.removeEventListener('orientationchange', onResize);
        };
    }, [hostRefs, measure, pathLen]);

    return layout;
}
