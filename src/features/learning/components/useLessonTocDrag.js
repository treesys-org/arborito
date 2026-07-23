import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { resolveTocDropTarget, TOC_INDENT_PX } from '../api/lesson-toc-drag.js';
import { tocSubtreeExclusiveEnd } from '../api/lesson-toc-mutations.js';
import {
    collectVisibleRowRects,
    syncTocTreeStemLifts,
    tocDropNestAccentVar,
} from './lesson-toc-row-utils.js';

const DRAG_ACTIVATE_PX = 6;

export function useLessonTocDrag({
    constructEdit,
    filterActive,
    tocNavRef,
    headingRanges,
    onTocDragTo,
    ui,
    toc,
    collapsedIds,
    outlineBody,
    tocFilter,
    filteredToc,
}) {
    const [dragUi, setDragUi] = useState(null);
    const dragSessionRef = useRef(null);
    const dropLineRef = useRef(null);
    const dropBadgeRef = useRef(null);
    const rangesRef = useRef([]);
    rangesRef.current = headingRanges;

    const clearDragUi = useCallback(() => {
        setDragUi(null);
        dragSessionRef.current = null;
        const line = dropLineRef.current;
        if (line) line.style.display = 'none';
        const badge = dropBadgeRef.current;
        if (badge) badge.style.display = 'none';
    }, []);

    useEffect(() => {
        if (!constructEdit) clearDragUi();
    }, [constructEdit, clearDragUi]);

    useLayoutEffect(() => {
        if (!constructEdit) return undefined;
        const nav = tocNavRef?.current;
        syncTocTreeStemLifts(nav);
        const onResize = () => syncTocTreeStemLifts(tocNavRef?.current);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, [
        constructEdit,
        tocNavRef,
        toc,
        collapsedIds,
        dragUi?.active,
        dragUi?.fromIdx,
        outlineBody,
        tocFilter,
        filteredToc,
    ]);

    const updateDropVisual = useCallback(
        (clientY, clientX) => {
            const session = dragSessionRef.current;
            const nav = tocNavRef?.current;
            const ranges = rangesRef.current;
            if (!session?.active || !nav || !ranges.length) return;
            const rowRects = collectVisibleRowRects(nav);
            const navRect = nav.getBoundingClientRect();
            const drop = resolveTocDropTarget({
                ranges,
                fromIdx: session.fromIdx,
                clientY,
                clientX,
                startClientX: session.startX,
                rowRects,
            });
            session.drop = drop;
            const line = dropLineRef.current;
            const badge = dropBadgeRef.current;
            if (!drop) {
                setDragUi((prev) =>
                    prev
                        ? {
                              ...prev,
                              dropLevel: null,
                              dropBase: null,
                              dropAnchor: -1,
                          }
                        : prev
                );
                if (line) line.style.display = 'none';
                if (badge) badge.style.display = 'none';
                return;
            }
            setDragUi((prev) =>
                prev
                    ? {
                          ...prev,
                          dropLevel: drop.targetLevel,
                          dropBase: drop.baseLevel,
                          dropAnchor: drop.anchorIdx,
                      }
                    : prev
            );

            const anchorEl = nav.querySelector(
                `.arborito-lesson-toc-row--construct[data-toc-idx="${drop.anchorIdx}"]`
            );
            if (!line || !anchorEl) {
                if (line) line.style.display = 'none';
                if (badge) badge.style.display = 'none';
                return;
            }
            const ar = anchorEl.getBoundingClientRect();
            const y = drop.insertBefore ? ar.top : ar.bottom;
            const depthIndent = Math.max(0, (drop.targetLevel - 2) * TOC_INDENT_PX);
            const topPx = Math.max(0, y - navRect.top - 1);
            line.style.display = 'block';
            line.style.top = `${topPx}px`;
            line.style.left = `${depthIndent}px`;
            line.style.right = '0.35rem';
            line.dataset.level = String(drop.targetLevel);
            const dropAccent = tocDropNestAccentVar(drop.targetLevel);
            line.style.setProperty('--toc-drop-accent', dropAccent);
            line.classList.remove('is-deeper', 'is-shallower');

            if (badge) {
                const depthLabel = Math.max(1, drop.targetLevel - 1);
                let label;
                if (drop.targetLevel > drop.baseLevel) {
                    label = (ui.lessonTocDropNestLevel || 'Nest deeper · depth {n}').replace(
                        '{n}',
                        String(depthLabel)
                    );
                } else if (drop.targetLevel < drop.baseLevel) {
                    label = (ui.lessonTocDropOutdentLevel || 'Nest less · depth {n}').replace(
                        '{n}',
                        String(depthLabel)
                    );
                } else {
                    label = (ui.lessonTocDropSameLevel || 'Depth {n}').replace(
                        '{n}',
                        String(depthLabel)
                    );
                }
                badge.textContent = label;
                badge.style.display = 'inline-flex';
                badge.style.top = `${Math.max(0, topPx - 22)}px`;
                badge.style.left = `${depthIndent}px`;
                badge.style.setProperty('--toc-drop-accent', dropAccent);
                badge.classList.remove('is-deeper', 'is-shallower');
            }
        },
        [tocNavRef, ui]
    );

    const endDrag = useCallback(
        (commit) => {
            const session = dragSessionRef.current;
            if (!session) {
                clearDragUi();
                return;
            }
            const drop = session.drop;
            clearDragUi();
            if (!commit || !session.active || !drop) return;
            onTocDragTo?.(session.fromIdx, drop.insertIndex, drop.targetLevel);
        },
        [clearDragUi, onTocDragTo]
    );

    const onDragPointerDown = useCallback(
        (e, fromIdx) => {
            if (!constructEdit || filterActive) return;
            if (e.button != null && e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            const ranges = rangesRef.current;
            const pointerId = e.pointerId;
            const startX = e.clientX;
            const startY = e.clientY;
            const subEnd =
                fromIdx >= 0 && fromIdx < ranges.length
                    ? tocSubtreeExclusiveEnd(ranges, fromIdx)
                    : fromIdx + 1;
            dragSessionRef.current = {
                fromIdx,
                subEnd,
                pointerId,
                startX,
                startY,
                active: false,
                drop: null,
            };
            setDragUi({
                fromIdx,
                subEnd,
                active: false,
                dropLevel: null,
                dropBase: null,
                dropAnchor: -1,
            });

            const onMove = (ev) => {
                const session = dragSessionRef.current;
                if (!session || session.pointerId !== ev.pointerId) return;
                const dx = ev.clientX - session.startX;
                const dy = ev.clientY - session.startY;
                if (!session.active && Math.hypot(dx, dy) < DRAG_ACTIVATE_PX) return;
                if (!session.active) {
                    session.active = true;
                    setDragUi((prev) => (prev ? { ...prev, active: true } : prev));
                }
                ev.preventDefault();
                updateDropVisual(ev.clientY, ev.clientX);
            };
            const onUp = (ev) => {
                if (dragSessionRef.current?.pointerId !== ev.pointerId) return;
                window.removeEventListener('pointermove', onMove);
                window.removeEventListener('pointerup', onUp);
                window.removeEventListener('pointercancel', onUp);
                endDrag(true);
            };
            window.addEventListener('pointermove', onMove, { passive: false });
            window.addEventListener('pointerup', onUp);
            window.addEventListener('pointercancel', onUp);
        },
        [constructEdit, filterActive, updateDropVisual, endDrag]
    );

    return {
        dragUi,
        dropLineRef,
        dropBadgeRef,
        onDragPointerDown,
    };
}
