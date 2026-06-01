import { store } from '../../../core/store.js';
import { getToc } from '../../learning/content-toc.js';
import {
    reorderTocSectionRange,
    setTocSectionLevel
} from '../../learning/lesson-toc-mutations.js';
import { parseOutline, moveSubtree, impliedParentId } from '../../learning/lesson-toc-tree.js';

/** Handlers for TOC actions: row click/rename, drag-to-reorder/nest. */
export const tocBindingsMixin = {
    bindTocRowHandlers() {
        const nav = this.querySelector('#lesson-toc-nav');
        if (!nav) {
            this._abortTocDnD();
            return;
        }

        if (this._tocRenameDocPtr) {
            document.removeEventListener('pointerdown', this._tocRenameDocPtr, true);
            this._tocRenameDocPtr = null;
        }

        const editInp = this.querySelector('.js-toc-edit-title');
        if (editInp && this._tocInlineEditIdx != null && Number.isInteger(this._tocInlineEditIdx)) {
            const editIdx = this._tocInlineEditIdx;
            const disarmDoc = () => {
                if (!this._tocRenameDocPtr) return;
                document.removeEventListener('pointerdown', this._tocRenameDocPtr, true);
                this._tocRenameDocPtr = null;
            };
            const commitTitle = () => {
                if (this._tocInlineEditIdx !== editIdx) return;
                disarmDoc();
                this._applyTocRename(editIdx, editInp.value, '');
            };
            const cancelInline = () => {
                if (this._tocInlineEditIdx !== editIdx) return;
                disarmDoc();
                this._tocInlineEditIdx = null;
                this.lastRenderKey = null;
                this.render();
            };
            const onDocPtr = (ev) => {
                const el = ev.target;
                if (!(el instanceof Node)) return;
                if (el === editInp || editInp.contains(el)) return;
                commitTitle();
            };
            this._tocRenameDocPtr = onDocPtr;
            document.addEventListener('pointerdown', onDocPtr, true);
            editInp.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter') {
                    ev.preventDefault();
                    commitTitle();
                } else if (ev.key === 'Escape') {
                    ev.preventDefault();
                    cancelInline();
                }
            });
            requestAnimationFrame(() => {
                try {
                    editInp.focus();
                    editInp.select();
                } catch {
                    /* ignore */
                }
            });
        }

        nav.onclick = (e) => {
            const rootEl =
                (typeof e.composedPath === 'function' ? e.composedPath().find((n) => n instanceof Element) : null) ||
                (e.target instanceof Element ? e.target : (e.target && e.target.parentElement));
            const renameBtn = rootEl && rootEl.closest ? rootEl.closest('.js-toc-rename') : null;
            if (renameBtn && this._isLessonConstructEdit()) {
                e.preventDefault();
                e.stopPropagation();
                const ridx = parseInt(renameBtn.dataset.idx, 10);
                if (!Number.isNaN(ridx)) {
                    this._tocInlineEditIdx = ridx;
                    this.lastRenderKey = null;
                    this.render();
                }
                return;
            }
            const btn = (rootEl && rootEl.closest ? rootEl.closest('.btn-toc') : null);
            if (!btn) return;

            const idx = parseInt(btn.dataset.idx, 10);

            if ((rootEl && rootEl.closest ? rootEl.closest('.js-toc-tick') : null)) {
                e.stopPropagation();

                if (this.visitedSections.has(idx)) {
                    this.visitedSections.delete(idx);
                    if (this.currentNode && store.isCompleted(this.currentNode.id)) {
                        store.markComplete(this.currentNode.id, false);
                    }
                } else {
                    this.visitedSections.add(idx);
                }

                if (this.currentNode) {
                    store.saveBookmark(
                        this.currentNode.id,
                        this.currentNode.content,
                        this.activeSectionIndex,
                        this.visitedSections
                    );
                }
                this._tryCompleteLessonFromTocProgress();
                this.render();
                return;
            }

            if (idx === this.activeSectionIndex) {
                const ca = this.querySelector('#content-area');
                const savedTop = ca ? ca.scrollTop : 0;
                this.isTocVisible = false;
                this.lastRenderKey = null;
                this.scheduleUpdate(true);
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        const next = this.querySelector('#content-area');
                        if (next) next.scrollTop = savedTop;
                    });
                });
                return;
            }
            this.isTocVisible = false;
            this.scrollToSection(idx);
        };

        if (this._isLessonConstructEdit()) this.bindTocDragConstruct();
        else this._abortTocDnD();
    },

    _abortTocDnD() {
        if (this._tocDnDAbort) {
            this._tocDnDAbort.abort();
            this._tocDnDAbort = null;
        }
    },

    bindTocDragConstruct() {
        const nav = this.querySelector('#lesson-toc-nav');
        if (!nav || !this._isLessonConstructEdit()) {
            this._abortTocDnD();
            return;
        }
        this._abortTocDnD();
        const ac = new AbortController();
        this._tocDnDAbort = ac;
        const { signal } = ac;
        this._tocDragOriginX = null;

        const clearDropState = () => {
            nav.classList.remove('arborito-lesson-toc-nav--dragging');
            nav.querySelectorAll('.arborito-lesson-toc-row.is-toc-drop-target').forEach((el) => {
                el.classList.remove('is-toc-drop-target');
                el.classList.remove('is-toc-drop-nest');
                el.style.removeProperty('--toc-drop-depth');
            });
            const ind = nav.querySelector('.arborito-lesson-toc-drop-indicator');
            if (ind) {
                ind.classList.add('hidden');
                ind.style.marginLeft = '';
                ind.style.top = '';
            }
        };

        const rowAtPoint = (x, y) => {
            const el = document.elementFromPoint(x, y);
            return el instanceof Element ? el.closest('.arborito-lesson-toc-row[data-toc-idx]') : null;
        };

        const depthOfRowIdx = (idx) => {
            const row = nav.querySelector(`.arborito-lesson-toc-row[data-toc-idx="${idx}"]`);
            if (!row) return 1;
            const d = parseInt(row.getAttribute('data-toc-depth') || '1', 10);
            return Number.isFinite(d) ? d : 1;
        };

        const dropIntent = (row, clientX, forceNest = false, parentDepthOverride = null, fromIdx = null) => {
            const rowDepth = parseInt(row.getAttribute('data-toc-depth') || '1', 10);
            const fromDepth =
                fromIdx != null && Number.isFinite(fromIdx) ? depthOfRowIdx(fromIdx) : null;
            const originX = Number.isFinite(this._tocDragOriginX) ? this._tocDragOriginX : clientX;
            const horizontal = clientX - originX;

            // Nest when user drags right (22px threshold for comfortable
            // mobile without accidental triggers) or holds Shift.
            const NEST_THRESHOLD = 22;
            // Indent per level (must match `buildTocListMarkup`).
            const INDENT_W = 16;
            // Each extra nesting level needs a clear extra push (60px),
            // so a small move nests one level only and does not jump to deepest tree.
            const EXTRA_LEVEL_STEP = 60;
            const leftPx = Math.max(0, -horizontal);
            const outdentSteps = Math.floor(leftPx / INDENT_W);
            const outdentMode = outdentSteps > 0;
            const nestMode = !outdentMode && (forceNest || horizontal > NEST_THRESHOLD);
            const extraSteps = nestMode
                ? Math.max(0, Math.floor((horizontal - NEST_THRESHOLD) / EXTRA_LEVEL_STEP))
                : 0;

            // "Parent" may be target row (drop on another row)
            // or previous sibling (same row, push right).
            const parentDepth =
                parentDepthOverride != null && Number.isFinite(parentDepthOverride)
                    ? parentDepthOverride
                    : rowDepth;
            // data-toc-depth = depth+1 (depth=0 => 1). Convert to depth.
            const fromDepth0 = Math.max(0, ((fromDepth || rowDepth) - 1));
            const desiredDepth = outdentMode
                ? Math.max(0, fromDepth0 - outdentSteps)
                : Math.max(0, Math.min(5, (parentDepth - 1) + 1 + extraSteps));

            return { nestMode, outdentMode, desiredDepth };
        };

        const previousRowDepth = (idx) => {
            if (idx <= 0) return 1;
            const prev = nav.querySelector(`.arborito-lesson-toc-row[data-toc-idx="${idx - 1}"]`);
            return prev ? parseInt(prev.getAttribute('data-toc-depth') || '1', 10) : 1;
        };

        const autoScrollToc = (clientY) => {
            const scroller = nav.closest('.arborito-lesson-toc-sheet__scroll');
            if (!scroller) return;
            const r = scroller.getBoundingClientRect();
            const edge = 42;
            if (clientY < r.top + edge) scroller.scrollTop -= 12;
            else if (clientY > r.bottom - edge) scroller.scrollTop += 12;
        };

        const paintDropState = (row, intent) => {
            nav.querySelectorAll('.arborito-lesson-toc-row.is-toc-drop-target').forEach((el) => {
                if (el !== row) {
                    el.classList.remove('is-toc-drop-target');
                    el.classList.remove('is-toc-drop-nest');
                    el.style.removeProperty('--toc-drop-depth');
                }
            });
            row.classList.add('is-toc-drop-target');
            row.classList.toggle('is-toc-drop-nest', intent.nestMode);
            row.style.setProperty('--toc-drop-depth', String(Math.max(1, (intent.desiredDepth + 1))));
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

            this._captureLessonDraftFromDom();
            const body0 = this._getLessonBodyForToc();
            const outline0 = parseOutline(body0);
            const movedId = (outline0[from] ? outline0[from].id : undefined);
            if (!movedId) return false;

            // Compute intent against reordered outline (source of truth).
            const intent0 = dropIntent(row, clientX, forceNest, null, from);
            const { nextNodes: outline1 } = moveSubtree(outline0, from, insertIndex);
            const movedIdx = outline1.findIndex((n) => n.id === movedId);
            if (movedIdx === -1) return false;
            const prev = movedIdx > 0 ? outline1[movedIdx - 1] : null;
            const maxDepthAllowed = prev ? Math.min(5, prev.depth + 1) : 0;
            const proposedDepth = Math.max(0, Math.min(intent0.desiredDepth, maxDepthAllowed));
            // parentId is implied by depth (grandparent chain) after outdent.
            // Computed on outline already reordered with proposed depth.
            const parentId =
                proposedDepth === 0
                    ? null
                    : impliedParentId(
                          outline1.map((n, i) => (i === movedIdx ? { ...n, depth: proposedDepth } : n)),
                          movedIdx
                      );

            // Step 1: reorder on Y axis.
            let body1 = body0;
            body1 = reorderTocSectionRange(body0, from, insertIndex);

            // Real index of moved block after reorder.
            const toc1 = getToc({ content: body1 });
            const movedIdx2 = toc1.findIndex((t) => t.id === movedId);
            if (movedIdx2 === -1) return false;

            // Step 2: apply depth on X axis (depth=0 => '##').
            let body2 = body1;
            const targetHeadingLevel = proposedDepth + 2;
            body2 = setTocSectionLevel(body1, movedIdx2, targetHeadingLevel);

            if (body2 === body0) return false;
            this._lessonBodyMarkdown = body2;
            this._lessonDraftLessonId = this.currentNode.id;
            this._lessonDraftNonce += 1;
            const tocAfter = getToc({ content: body2 });
            let newActive = movedIdx2;
            if (movedId) {
                const j = tocAfter.findIndex((t) => t.id === movedId);
                if (j !== -1) newActive = j;
            }
            this.activeSectionIndex = Math.max(0, Math.min(newActive, tocAfter.length - 1));
            this._skipLessonDraftDomCapture = true;
            this.lastRenderKey = null;
            this._lessonSaveState = 'idle';
            this.render();
            return true;
        };

        nav.addEventListener(
            'dragstart',
            (e) => {
                const h = e.target instanceof Element ? e.target.closest('.js-toc-drag-handle') : null;
                if (!h || !nav.contains(h) || h.getAttribute('draggable') !== 'true') return;
                const from = parseInt(h.getAttribute('data-idx') || '', 10);
                if (Number.isNaN(from)) return;
                try {
                    (e.dataTransfer && e.dataTransfer.setData)('application/x-arborito-toc', String(from));
                    (e.dataTransfer && e.dataTransfer.setData)('text/plain', String(from));
                } catch {
                    /* ignore */
                }
                if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
                this._tocDragOriginX = e.clientX;
                this._tocDragFromIdx = from;
                nav.classList.add('arborito-lesson-toc-nav--dragging');
            },
            { signal }
        );

        nav.addEventListener(
            'dragend',
            () => {
                clearDropState();
                this._tocDragOriginX = null;
                this._tocDragFromIdx = null;
            },
            { signal }
        );

        // Compute row that will receive drop and matching intent
        // (aligned with `applyTocDrop` so visual feedback is truthful: if pushing right
        // on same row nests under previous sibling, that row is highlighted).
        const resolveDropTarget = (row, clientX, forceNest, fromIdx) => {
            const idx = parseInt(row.getAttribute('data-toc-idx') || '', 10);
            if (Number.isNaN(idx)) return null;
            if (Number.isFinite(fromIdx) && fromIdx === idx) {
                const fastIntent = dropIntent(row, clientX, forceNest, null, fromIdx);
                if (fastIntent.outdentMode) {
                    return { row, intent: fastIntent };
                }
                if (!fastIntent.nestMode || fromIdx <= 0) return null;
                const prev = nav.querySelector(`.arborito-lesson-toc-row[data-toc-idx="${fromIdx - 1}"]`);
                if (!prev) return null;
                const intent = dropIntent(row, clientX, forceNest, previousRowDepth(fromIdx), fromIdx);
                return { row: prev, intent };
            }
            const intent = dropIntent(row, clientX, forceNest, null, fromIdx);
            return { row, intent };
        };

        const clearDropPaintOnly = () => {
            nav.querySelectorAll('.arborito-lesson-toc-row.is-toc-drop-target').forEach((el) => {
                el.classList.remove('is-toc-drop-target');
                el.classList.remove('is-toc-drop-nest');
                el.style.removeProperty('--toc-drop-depth');
            });
            const ind = nav.querySelector('.arborito-lesson-toc-drop-indicator');
            if (ind) {
                ind.classList.add('hidden');
                ind.style.marginLeft = '';
                ind.style.top = '';
            }
        };

        nav.addEventListener(
            'dragover',
            (e) => {
                const row = e.target instanceof Element ? e.target.closest('.arborito-lesson-toc-row[data-toc-idx]') : null;
                if (!row || !nav.contains(row)) return;
                e.preventDefault();
                const fromIdx = Number.isFinite(this._tocDragFromIdx) ? this._tocDragFromIdx : NaN;
                const resolved = resolveDropTarget(row, e.clientX, e.shiftKey, fromIdx);
                if (!resolved) {
                    /* No valid target yet (e.g. user has not pushed far enough
                     * on same row): clear paint to avoid misleading UI. */
                    clearDropPaintOnly();
                    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
                    autoScrollToc(e.clientY);
                    return;
                }
                if (e.dataTransfer) {
                    e.dataTransfer.dropEffect = resolved.intent.outdentMode
                        ? 'move'
                        : (resolved.intent.nestMode ? 'copy' : 'move');
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
                /* Only clear when pointer truly leaves nav: if still inside,
                 * next `dragover` repaints correct target
                 * (may differ from leave row when redirecting drop to previous sibling). */
                if (rel instanceof Node && nav.contains(rel)) return;
                clearDropPaintOnly();
            },
            { signal }
        );

        nav.addEventListener(
            'drop',
            (e) => {
                const row = e.target instanceof Element ? e.target.closest('.arborito-lesson-toc-row[data-toc-idx]') : null;
                if (!row || !nav.contains(row)) return;
                e.preventDefault();
                row.classList.remove('is-toc-drop-target');
                row.classList.remove('is-toc-drop-nest');
                row.style.removeProperty('--toc-drop-depth');
                let from = NaN;
                try {
                    from = parseInt((e.dataTransfer && e.dataTransfer.getData)('application/x-arborito-toc') || '', 10);
                } catch {
                    from = NaN;
                }
                if (Number.isNaN(from)) return;
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
                this._tocDragOriginX = e.clientX;
                this._tocDragFromIdx = from;
                nav.classList.add('arborito-lesson-toc-nav--dragging');
                (h.setPointerCapture && h.setPointerCapture(e.pointerId));

                const onMove = (ev) => {
                    const row = rowAtPoint(ev.clientX, ev.clientY);
                    if (!row || !nav.contains(row)) {
                        clearDropPaintOnly();
                        return;
                    }
                    const resolved = resolveDropTarget(row, ev.clientX, ev.shiftKey, from);
                    if (!resolved) {
                        clearDropPaintOnly();
                    } else {
                        paintDropState(resolved.row, resolved.intent);
                    }
                    autoScrollToc(ev.clientY);
                };
                const onUp = (ev) => {
                    document.removeEventListener('pointermove', onMove, true);
                    document.removeEventListener('pointerup', onUp, true);
                    document.removeEventListener('pointercancel', onUp, true);
                    const row = rowAtPoint(ev.clientX, ev.clientY);
                    clearDropState();
                    applyTocDrop(from, row, ev.clientX, ev.clientY, ev.shiftKey);
                    this._tocDragOriginX = null;
                    this._tocDragFromIdx = null;
                };
                document.addEventListener('pointermove', onMove, true);
                document.addEventListener('pointerup', onUp, true);
                document.addEventListener('pointercancel', onUp, true);
            },
            { signal }
        );
    }
};
