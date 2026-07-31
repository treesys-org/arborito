import { useLayoutEffect, useState, useCallback } from 'react';
import { measureTreePathLayout } from '../api/logic/path-geometry.js';

const EMPTY_LAYOUT = {
    trunkD: '',
    trunkActiveD: '',
    connectorD: '',
    svgWidth: 1,
    trunkSvgWidth: 1,
    svgHeight: 1,
    trunkSvgHeight: 1,
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
        a.trunkSvgWidth === b.trunkSvgWidth &&
        a.svgHeight === b.svgHeight &&
        a.trunkSvgHeight === b.trunkSvgHeight &&
        a.svgLeft === b.svgLeft
    );
}

/**
 * Live panel host: prefer the React ref (always current after commit), then DOM.
 * Stale `panelEl` state used to drop the branch arm after navigating into a node.
 */
function resolvePanelEl(panelRef, panelEl, hostRefs) {
    const fromRef = panelRef?.current;
    if (fromRef && typeof fromRef.getBoundingClientRect === 'function') {
        if (!fromRef.isConnected) {
            /* Detached between unmount/remount — fall through. */
        } else {
            return fromRef;
        }
    }
    if (panelEl && panelEl.isConnected) return panelEl;
    const body = hostRefs?.trunkBody?.current;
    return body?.querySelector?.('.mobile-children-panel') || null;
}

/**
 * Measure trunk + connector SVG paths for TreePathChrome.
 */
export function useTreePathLayout({ model, hostRefs, panelRef, panelEl }) {
    const [layout, setLayout] = useState(EMPTY_LAYOUT);
    const pathLen = model?.pathNodes?.length ?? 0;
    const activeIndex = model?.activeIndex ?? -1;
    const currentId = model?.current?.id != null ? String(model.current.id) : '';

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

        const panel = resolvePanelEl(panelRef, panelEl, hostRefs);
        const next = measureTreePathLayout({
            scrollContent,
            trunkCol,
            trunkBody,
            knotsContainer,
            panelEl: panel,
            activeIndex,
        });
        if (next) commitLayout(next);
        /* Growing path / remounted branch panel: keep retrying until the arm exists. */
        const expectConnector = pathLen > 0 && activeIndex >= 0;
        if (expectConnector && panel && next && !next.connectorD) {
            return { ...next, needsRetry: true };
        }
        if (expectConnector && !panel) {
            return { ...(next || { needsRetry: true }), needsRetry: true };
        }
        return next;
    }, [hostRefs, panelRef, panelEl, activeIndex, pathLen, commitLayout]);

    useLayoutEffect(() => {
        if (!pathLen) {
            setLayout((prev) => (layoutsEqual(prev, EMPTY_LAYOUT) ? prev : EMPTY_LAYOUT));
            return undefined;
        }

        let cancelled = false;
        let raf1 = 0;
        let raf2 = 0;
        let raf3 = 0;
        let timer = 0;

        const run = () => {
            if (cancelled) return;
            const next = measure();
            if (next?.needsRetry && !cancelled) {
                raf1 = requestAnimationFrame(() => {
                    raf2 = requestAnimationFrame(() => {
                        if (cancelled) return;
                        measure();
                        /* Grow-reveal / panel remount can land after 2 frames. */
                        raf3 = requestAnimationFrame(() => {
                            if (!cancelled) measure();
                        });
                        timer = window.setTimeout(() => {
                            if (!cancelled) measure();
                        }, 100);
                    });
                });
            }
        };

        run();

        return () => {
            cancelled = true;
            if (raf1) cancelAnimationFrame(raf1);
            if (raf2) cancelAnimationFrame(raf2);
            if (raf3) cancelAnimationFrame(raf3);
            if (timer) clearTimeout(timer);
        };
    }, [pathLen, activeIndex, currentId, measure]);

    useLayoutEffect(() => {
        const scrollContent = hostRefs?.scrollContent?.current;
        const trunkBody = hostRefs?.trunkBody?.current;
        const trunkCol = hostRefs?.trunkCol?.current;
        const panel = resolvePanelEl(panelRef, panelEl, hostRefs);
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
        if (trunkCol) ro?.observe(trunkCol);
        if (panel) ro?.observe(panel);
        window.addEventListener('resize', onResize);
        window.addEventListener('orientationchange', onResize);

        return () => {
            if (raf) cancelAnimationFrame(raf);
            ro?.disconnect();
            window.removeEventListener('resize', onResize);
            window.removeEventListener('orientationchange', onResize);
        };
    }, [hostRefs, measure, pathLen, panelRef, panelEl, currentId]);

    return layout;
}
