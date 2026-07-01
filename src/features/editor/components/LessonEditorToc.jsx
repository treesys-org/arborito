import { useEffect, useRef } from 'react';
import { getToc, tocIdOrdinalBefore } from '../../learning/api/content-toc.js';
import {
    reorderTocSectionRange,
    setTocSectionLevel
} from '../../learning/api/lesson-toc-mutations.js';
import { parseOutline, moveSubtree } from '../../learning/api/lesson-toc-tree.js';
import { constructSectionMarkers } from '../api/logic/lesson-editor-dom.js';

function tocRowDepth(toc, idx) {
    const item = toc[idx];
    if (!item) return 1;
    const lv = Math.min(8, Math.max(1, item.level || 1));
    return Math.min(6, Math.max(0, lv - 2) + 1);
}

/** Scroll the visual editor to a construct section marker. */
export function scrollConstructSectionIntoView(editorEl, idx, getContentForTocParse) {
    if (!editorEl) return;
    const toc = getToc({ content: getContentForTocParse() });
    const item = toc[idx];
    if (!item) return;
    if (item.id === 'intro') {
        editorEl.scrollIntoView({ block: 'start' });
        return;
    }
    const markers = constructSectionMarkers(editorEl);
    const ord = tocIdOrdinalBefore(toc, idx);
    let el = markers[idx];
    if (!el && item.id) {
        const withSameId = markers.filter(
            (m) => m.id === item.id || m.getAttribute('data-arborito-section-id') === item.id
        );
        el = withSameId[ord] || (item.id ? document.getElementById(item.id) : null);
    }
    if (!el) return;
    let target = el;
    if (target.classList?.contains('arborito-authoring-outline')) {
        let next = target.nextElementSibling;
        while (next?.classList?.contains('arborito-authoring-outline')) {
            next = next.nextElementSibling;
        }
        if (next) target = next;
    }
    target.scrollIntoView({ block: 'start' });
}

/** TOC drag-to-reorder (construction edit). Click/rename handled in LessonToc.jsx. */
export function useLessonEditorToc({
    tocNavRef,
    tocScrollRef,
    panel,
    constructApiRef,
    isLessonConstructEdit,
    patchPanel,
    scheduleUpdate,
    getContentForTocParse,
    getLessonParseModel,
    setTocDropTarget
}) {
    const dragFromIdxRef = useRef(null);
    const dragOriginXRef = useRef(null);
    const dndAbortRef = useRef(null);

    useEffect(() => {
        const nav = tocNavRef?.current;
        if (!nav || !isLessonConstructEdit()) {
            dndAbortRef.current?.abort();
            dndAbortRef.current = null;
            setTocDropTarget?.(null);
            return undefined;
        }

        const api = constructApiRef.current;
        const contentForParse = getContentForTocParse();
        const { toc } = getLessonParseModel(contentForParse, false);

        dndAbortRef.current?.abort();
        const ac = new AbortController();
        dndAbortRef.current = ac;
        const { signal } = ac;

        const clearDropState = () => {
            nav.classList.remove('arborito-lesson-toc-nav--dragging');
            setTocDropTarget?.(null);
        };

        const rowFromEvent = (e) => {
            const t = e.target;
            return t instanceof Element ? t.closest('.arborito-lesson-toc-row[data-toc-idx]') : null;
        };

        const rowAtPoint = (x, y) => {
            const el = document.elementFromPoint(x, y);
            return el instanceof Element ? el.closest('.arborito-lesson-toc-row[data-toc-idx]') : null;
        };

        const dropIntent = (rowDepth, clientX, forceNest = false, parentDepthOverride = null, fromIdx = null) => {
            const fromDepth =
                fromIdx != null && Number.isFinite(fromIdx) ? tocRowDepth(toc, fromIdx) : null;
            const originX = Number.isFinite(dragOriginXRef.current) ? dragOriginXRef.current : clientX;
            const horizontal = clientX - originX;
            const NEST_THRESHOLD = 22;
            const INDENT_W = 16;
            const EXTRA_LEVEL_STEP = 60;
            const leftPx = Math.max(0, -horizontal);
            const outdentSteps = Math.floor(leftPx / INDENT_W);
            const outdentMode = outdentSteps > 0;
            const nestMode = !outdentMode && (forceNest || horizontal > NEST_THRESHOLD);
            const extraSteps = nestMode
                ? Math.max(0, Math.floor((horizontal - NEST_THRESHOLD) / EXTRA_LEVEL_STEP))
                : 0;
            const parentDepth =
                parentDepthOverride != null && Number.isFinite(parentDepthOverride)
                    ? parentDepthOverride
                    : rowDepth;
            const fromDepth0 = Math.max(0, (fromDepth || rowDepth) - 1);
            const desiredDepth = outdentMode
                ? Math.max(0, fromDepth0 - outdentSteps)
                : Math.max(0, Math.min(5, parentDepth - 1 + 1 + extraSteps));
            return { nestMode, outdentMode, desiredDepth };
        };

        const autoScrollToc = (clientY) => {
            const scroller = tocScrollRef?.current || nav.closest('.arborito-lesson-toc-sheet__scroll');
            if (!scroller) return;
            const r = scroller.getBoundingClientRect();
            const edge = 42;
            if (clientY < r.top + edge) scroller.scrollTop -= 12;
            else if (clientY > r.bottom - edge) scroller.scrollTop += 12;
        };

        const paintDropState = (row, intent) => {
            const idx = parseInt(row.getAttribute('data-toc-idx') || '', 10);
            if (Number.isNaN(idx)) return;
            setTocDropTarget?.({
                idx,
                nestMode: intent.nestMode,
                desiredDepth: Math.max(1, intent.desiredDepth + 1)
            });
        };

        const insertionIndexAtPoint = (row, clientY) => {
            const idx = parseInt(row.getAttribute('data-toc-idx') || '', 10);
            if (Number.isNaN(idx)) return null;
            const r = row.getBoundingClientRect();
            const after = clientY > r.top + r.height / 2;
            return idx + (after ? 1 : 0);
        };

        const applyTocDrop = (from, row, clientX, clientY, forceNest = false) => {
            if (!row || !nav.contains(row)) return false;
            const insertIndex = insertionIndexAtPoint(row, clientY);
            if (Number.isNaN(from) || insertIndex == null) return false;

            api?._captureLessonDraftFromDom?.();
            const body0 = api?._getLessonBodyForToc?.() ?? '';
            const outline0 = parseOutline(body0);
            const movedId = outline0[from]?.id;
            if (!movedId) return false;

            const rowIdx = parseInt(row.getAttribute('data-toc-idx') || '', 10);
            const rowDepth = tocRowDepth(toc, rowIdx);
            const intent0 = dropIntent(rowDepth, clientX, forceNest, null, from);
            const { nextNodes: outline1 } = moveSubtree(outline0, from, insertIndex);
            const movedIdx = outline1.findIndex((n) => n.id === movedId);
            if (movedIdx === -1) return false;
            const prev = movedIdx > 0 ? outline1[movedIdx - 1] : null;
            const maxDepthAllowed = prev ? Math.min(5, prev.depth + 1) : 0;
            const proposedDepth = Math.max(0, Math.min(intent0.desiredDepth, maxDepthAllowed));

            let body1 = reorderTocSectionRange(body0, from, insertIndex);
            const toc1 = getToc({ content: body1 });
            const movedIdx2 = toc1.findIndex((t) => t.id === movedId);
            if (movedIdx2 === -1) return false;

            const targetHeadingLevel = proposedDepth + 2;
            const body2 = setTocSectionLevel(body1, movedIdx2, targetHeadingLevel);
            if (body2 === body0) return false;

            const tocAfter = getToc({ content: body2 });
            let newActive = movedIdx2;
            const j = tocAfter.findIndex((t) => t.id === movedId);
            if (j !== -1) newActive = j;

            patchPanel({
                lessonBodyMarkdown: body2,
                lessonDraftLessonId: panel.currentNode?.id ?? null,
                lessonDraftNonce: panel.lessonDraftNonce + 1,
                activeSectionIndex: Math.max(0, Math.min(newActive, tocAfter.length - 1)),
                lessonUserHasEdited: true
            });
            api._skipLessonDraftDomCapture = true;
            api.lastRenderKey = null;
            scheduleUpdate(true);
            return true;
        };

        const resolveDropTarget = (row, clientX, forceNest, fromIdx) => {
            const idx = parseInt(row.getAttribute('data-toc-idx') || '', 10);
            if (Number.isNaN(idx)) return null;
            const rowDepth = tocRowDepth(toc, idx);
            if (Number.isFinite(fromIdx) && fromIdx === idx) {
                const fastIntent = dropIntent(rowDepth, clientX, forceNest, null, fromIdx);
                if (fastIntent.outdentMode) return { row, intent: fastIntent };
                if (!fastIntent.nestMode || fromIdx <= 0) return null;
                const prevRow = [...nav.children].find(
                    (child) =>
                        child instanceof Element &&
                        child.getAttribute('data-toc-idx') === String(fromIdx - 1)
                );
                if (!prevRow) return null;
                const intent = dropIntent(rowDepth, clientX, forceNest, tocRowDepth(toc, fromIdx - 1), fromIdx);
                return { row: prevRow, intent };
            }
            const intent = dropIntent(rowDepth, clientX, forceNest, null, fromIdx);
            return { row, intent };
        };

        nav.addEventListener(
            'dragstart',
            (e) => {
                const h = e.target instanceof Element ? e.target.closest('.js-toc-drag-handle') : null;
                if (!h || !nav.contains(h) || h.getAttribute('draggable') !== 'true') return;
                const from = parseInt(h.getAttribute('data-idx') || '', 10);
                if (Number.isNaN(from)) return;
                try {
                    e.dataTransfer?.setData('application/x-arborito-toc', String(from));
                    e.dataTransfer?.setData('text/plain', String(from));
                } catch {
                    /* ignore */
                }
                if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
                dragOriginXRef.current = e.clientX;
                dragFromIdxRef.current = from;
                nav.classList.add('arborito-lesson-toc-nav--dragging');
            },
            { signal }
        );

        nav.addEventListener(
            'dragend',
            () => {
                clearDropState();
                dragOriginXRef.current = null;
                dragFromIdxRef.current = null;
            },
            { signal }
        );

        nav.addEventListener(
            'dragover',
            (e) => {
                const row = rowFromEvent(e);
                if (!row || !nav.contains(row)) return;
                e.preventDefault();
                const fromIdx = Number.isFinite(dragFromIdxRef.current) ? dragFromIdxRef.current : NaN;
                const resolved = resolveDropTarget(row, e.clientX, e.shiftKey, fromIdx);
                if (!resolved) {
                    setTocDropTarget?.(null);
                    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
                    autoScrollToc(e.clientY);
                    return;
                }
                if (e.dataTransfer) {
                    e.dataTransfer.dropEffect = resolved.intent.outdentMode
                        ? 'move'
                        : resolved.intent.nestMode
                          ? 'copy'
                          : 'move';
                }
                paintDropState(resolved.row, resolved.intent);
                autoScrollToc(e.clientY);
            },
            { signal }
        );

        nav.addEventListener(
            'dragleave',
            (e) => {
                const rel = e.relatedTarget;
                if (rel instanceof Node && nav.contains(rel)) return;
                setTocDropTarget?.(null);
            },
            { signal }
        );

        nav.addEventListener(
            'drop',
            (e) => {
                const row = rowFromEvent(e);
                if (!row || !nav.contains(row)) return;
                e.preventDefault();
                let from = NaN;
                try {
                    from = parseInt(e.dataTransfer?.getData('application/x-arborito-toc') || '', 10);
                } catch {
                    from = NaN;
                }
                if (Number.isNaN(from)) return;
                clearDropState();
                applyTocDrop(from, row, e.clientX, e.clientY, e.shiftKey);
            },
            { signal }
        );

        nav.addEventListener(
            'pointerdown',
            (e) => {
                const h = e.target instanceof Element ? e.target.closest('.js-toc-drag-handle') : null;
                if (!h || !nav.contains(h)) return;
                const from = parseInt(h.getAttribute('data-idx') || '', 10);
                if (Number.isNaN(from)) return;
                e.preventDefault();
                e.stopPropagation();
                dragOriginXRef.current = e.clientX;
                dragFromIdxRef.current = from;
                nav.classList.add('arborito-lesson-toc-nav--dragging');
                h.setPointerCapture?.(e.pointerId);

                const onMove = (ev) => {
                    const row = rowAtPoint(ev.clientX, ev.clientY);
                    if (!row || !nav.contains(row)) {
                        setTocDropTarget?.(null);
                        return;
                    }
                    const resolved = resolveDropTarget(row, ev.clientX, ev.shiftKey, from);
                    if (!resolved) setTocDropTarget?.(null);
                    else paintDropState(resolved.row, resolved.intent);
                    autoScrollToc(ev.clientY);
                };
                const onUp = (ev) => {
                    document.removeEventListener('pointermove', onMove, true);
                    document.removeEventListener('pointerup', onUp, true);
                    document.removeEventListener('pointercancel', onUp, true);
                    const row = rowAtPoint(ev.clientX, ev.clientY);
                    clearDropState();
                    applyTocDrop(from, row, ev.clientX, ev.clientY, ev.shiftKey);
                    dragOriginXRef.current = null;
                    dragFromIdxRef.current = null;
                };
                document.addEventListener('pointermove', onMove, true);
                document.addEventListener('pointerup', onUp, true);
                document.addEventListener('pointercancel', onUp, true);
            },
            { signal }
        );

        return () => {
            ac.abort();
            if (dndAbortRef.current === ac) dndAbortRef.current = null;
            setTocDropTarget?.(null);
        };
    }, [
        tocNavRef,
        tocScrollRef,
        panel,
        constructApiRef,
        isLessonConstructEdit,
        patchPanel,
        scheduleUpdate,
        getContentForTocParse,
        getLessonParseModel,
        setTocDropTarget
    ]);
}
