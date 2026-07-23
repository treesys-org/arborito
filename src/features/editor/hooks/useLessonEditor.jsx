import { useCallback, useMemo, useRef } from 'react';
import { execCmdOnEditor, insertBlockInEditor } from '../api/editor-commands.js';
import { applyLessonFormatCommand } from '../api/editor-format-apply.js';
import {
    captureEditorSelection,
    restoreEditorSelection,
} from '../api/editor-selection.js';
import {
    captureEditorSectionMarkdown,
    applyEditorSectionMarkdown,
} from '../api/logic/lesson-editor-dom.js';
import {
    flushConstructEditor,
    resolveEditorSectionIndex,
    markConstructBodyEdited,
} from '../api/logic/lesson-construct-capture.js';

const OUTLINE_FORMAT_BLOCKS = new Set(['H1', 'H2', 'H3', 'h1', 'h2', 'h3']);

const HISTORY_MAX = 20;

/**
 * Lesson visual editor state: section markdown draft, markdown undo stack, DOM sync.
 */
export function useLessonEditor({
    editorRef,
    panel,
    patchPanel,
    isLessonConstructEdit,
    getLessonBodyForToc,
    invalidateLessonParseCache,
    scheduleDraftAutosave
}) {
    const savedRangeRef = useRef(null);
    const formatPinRef = useRef(null);

    const FORMAT_CMDS = useMemo(
        () =>
            new Set([
                'formatBlock',
                'inlineSize',
                'align',
                'insertUnorderedList',
                'insertOrderedList',
                'insertBr',
                'bold',
                'italic',
                'underline',
                'strikeThrough',
            ]),
        []
    );

    const buildFlushCtx = useCallback(
        (ed) => ({
            editorEl: ed,
            node: panel.currentNode,
            activeSectionIndex: panel.activeSectionIndex,
            lessonBodyMarkdown: panel.lessonBodyMarkdown,
            lessonConstructDraft: panel.lessonConstructDraft,
            lessonDraftLessonId: panel.lessonDraftLessonId,
            getLessonBodyForToc,
            patchPanel,
            invalidateLessonParseCache,
            scheduleDraftAutosave,
        }),
        [
            panel.currentNode,
            panel.activeSectionIndex,
            panel.lessonBodyMarkdown,
            panel.lessonConstructDraft,
            panel.lessonDraftLessonId,
            getLessonBodyForToc,
            patchPanel,
            invalidateLessonParseCache,
            scheduleDraftAutosave,
        ]
    );

    const markUserEdited = useCallback(() => {
        if (!isLessonConstructEdit()) return;
        patchPanel({
            lessonUserHasEdited: true,
            lessonSaveState: 'idle',
            lessonLocalDraftState: 'pending'
        });
        scheduleDraftAutosave?.();
    }, [isLessonConstructEdit, patchPanel, scheduleDraftAutosave]);

    const captureFullDraftBody = useCallback(() => {
        const ed = editorRef?.current;
        if (!ed || !isLessonConstructEdit() || !panel.currentNode) return null;
        const snap = flushConstructEditor(buildFlushCtx(ed), { commit: false });
        if (!snap) return null;
        return {
            bodyMarkdown: snap.bodyMarkdown,
            headerMetaDraft: panel.headerMetaDraft,
        };
    }, [editorRef, isLessonConstructEdit, panel.currentNode, panel.headerMetaDraft, buildFlushCtx]);

    const flushSectionToBody = useCallback((opts = {}) => {
        const ed = editorRef?.current;
        if (!ed || !isLessonConstructEdit() || !panel.currentNode) return null;
        const snap = flushConstructEditor(buildFlushCtx(ed), { commit: true });
        if (!snap) return null;
        return {
            ok: snap.ok,
            bodyMarkdown: snap.bodyMarkdown,
            flushIdx: snap.flushIdx,
            sectionMd: snap.sectionMd,
            nextSectionIdx: snap.nextSectionIdx,
            skipped: !!snap.skipped,
            aborted: !!snap.aborted,
        };
    }, [editorRef, isLessonConstructEdit, panel.currentNode, buildFlushCtx]);

    const pushHistory = useCallback(
        (editorEl) => {
            if (!editorEl) return;
            const md = captureEditorSectionMarkdown(editorEl);
            const sectionIdx = resolveEditorSectionIndex(editorEl, {
                activeSectionIndex: panel.activeSectionIndex,
            });
            const stack = [...panel.lessonHistoryStack];
            if (stack.length > HISTORY_MAX) stack.shift();
            stack.push({ sectionIndex: sectionIdx, markdown: md });
            /* New edit invalidates the redo timeline. */
            patchPanel({ lessonHistoryStack: stack, lessonHistoryRedoStack: [] });
        },
        [panel.lessonHistoryStack, panel.activeSectionIndex, patchPanel]
    );

    const undo = useCallback(
        (editorEl) => {
            if (!editorEl || panel.lessonHistoryStack.length === 0) return;
            const sectionIdx = resolveEditorSectionIndex(editorEl, {
                activeSectionIndex: panel.activeSectionIndex,
            });
            const stack = [...panel.lessonHistoryStack];
            let prev = null;
            for (let i = stack.length - 1; i >= 0; i--) {
                const entry = stack[i];
                if (!(entry && typeof entry === 'object' && 'sectionIndex' in entry)) {
                    stack.splice(i, 1);
                    continue;
                }
                if (entry.sectionIndex === sectionIdx) {
                    prev = entry.markdown;
                    stack.splice(i, 1);
                    break;
                }
            }
            if (prev == null) return;
            const current = captureEditorSectionMarkdown(editorEl);
            const redo = [...(panel.lessonHistoryRedoStack || [])];
            if (redo.length > HISTORY_MAX) redo.shift();
            redo.push({ sectionIndex: sectionIdx, markdown: current });
            patchPanel({ lessonHistoryStack: stack, lessonHistoryRedoStack: redo });
            applyEditorSectionMarkdown(editorEl, prev);
            markConstructBodyEdited(editorEl, { markUserEdited });
        },
        [
            panel.lessonHistoryStack,
            panel.lessonHistoryRedoStack,
            panel.activeSectionIndex,
            patchPanel,
            markUserEdited,
        ]
    );

    const redo = useCallback(
        (editorEl) => {
            if (!editorEl || !(panel.lessonHistoryRedoStack || []).length) return;
            const sectionIdx = resolveEditorSectionIndex(editorEl, {
                activeSectionIndex: panel.activeSectionIndex,
            });
            const redoStack = [...(panel.lessonHistoryRedoStack || [])];
            let next = null;
            for (let i = redoStack.length - 1; i >= 0; i--) {
                const entry = redoStack[i];
                if (!(entry && typeof entry === 'object' && 'sectionIndex' in entry)) {
                    redoStack.splice(i, 1);
                    continue;
                }
                if (entry.sectionIndex === sectionIdx) {
                    next = entry.markdown;
                    redoStack.splice(i, 1);
                    break;
                }
            }
            if (next == null) return;
            const current = captureEditorSectionMarkdown(editorEl);
            const undoStack = [...panel.lessonHistoryStack];
            if (undoStack.length > HISTORY_MAX) undoStack.shift();
            undoStack.push({ sectionIndex: sectionIdx, markdown: current });
            patchPanel({ lessonHistoryStack: undoStack, lessonHistoryRedoStack: redoStack });
            applyEditorSectionMarkdown(editorEl, next);
            markConstructBodyEdited(editorEl, { markUserEdited });
        },
        [
            panel.lessonHistoryStack,
            panel.lessonHistoryRedoStack,
            panel.activeSectionIndex,
            patchPanel,
            markUserEdited,
        ]
    );

    const restoreSelection = useCallback((editorEl) => {
        return restoreEditorSelection(editorEl, savedRangeRef);
    }, []);

    const getEditorEl = useCallback(() => {
        const el = editorRef?.current;
        if (el?.isConnected) return el;
        const byId = document.getElementById('lesson-visual-editor');
        return byId?.isConnected ? byId : el || byId || null;
    }, [editorRef]);

    const pinFormatSelection = useCallback(() => {
        const editorEl = getEditorEl();
        if (!editorEl) return;
        captureEditorSelection(editorEl, savedRangeRef);
        const saved = savedRangeRef.current;
        const inEditor =
            saved &&
            saved.commonAncestorContainer &&
            editorEl.contains(saved.commonAncestorContainer);
        if (!inEditor) {
            /* Don't wipe a good pin when focus already left the editor (Aa menu). */
            return;
        }
        if (saved.collapsed) {
            /* Collapsed caret: keep prior non-collapsed pin if we have one. */
            const prev = formatPinRef.current;
            if (prev && !prev.collapsed && editorEl.contains(prev.commonAncestorContainer)) {
                return;
            }
        }
        formatPinRef.current = saved.cloneRange();
        restoreEditorSelection(editorEl, savedRangeRef);
        try {
            editorEl.focus({ preventScroll: true });
        } catch {
            /* ignore */
        }
    }, [getEditorEl]);

    const runToolCmd = useCallback(
        (cmd, val) => {
            const editorEl = getEditorEl();
            if (!editorEl) return;
            if (cmd === 'formatBlock' && OUTLINE_FORMAT_BLOCKS.has(String(val || ''))) {
                return;
            }
            pushHistory(editorEl);

            let applied = false;
            if (FORMAT_CMDS.has(cmd)) {
                let pin = formatPinRef.current;
                if (!pin) {
                    captureEditorSelection(editorEl, savedRangeRef);
                    const saved = savedRangeRef.current;
                    pin =
                        saved && editorEl.contains(saved.commonAncestorContainer)
                            ? saved.cloneRange()
                            : null;
                }
                if (!pin) {
                    try {
                        const sel = window.getSelection();
                        if (sel?.rangeCount) {
                            const live = sel.getRangeAt(0);
                            if (editorEl.contains(live.commonAncestorContainer)) {
                                pin = live.cloneRange();
                                formatPinRef.current = pin;
                            }
                        }
                    } catch {
                        /* ignore */
                    }
                }
                if (pin) {
                    applied = applyLessonFormatCommand(editorEl, pin, cmd, val);
                }
                /* If pin/apply failed, fall back to live selection + exec path. */
                if (!applied) {
                    captureEditorSelection(editorEl, savedRangeRef);
                    const saved = savedRangeRef.current;
                    if (
                        saved &&
                        editorEl.contains(saved.commonAncestorContainer) &&
                        FORMAT_CMDS.has(cmd)
                    ) {
                        applied = applyLessonFormatCommand(editorEl, saved, cmd, val);
                    }
                }
                if (!applied) {
                    captureEditorSelection(editorEl, savedRangeRef);
                    restoreEditorSelection(editorEl, savedRangeRef);
                    editorEl.focus({ preventScroll: true });
                    restoreEditorSelection(editorEl, savedRangeRef);
                    /* inlineSize has no execCommand — retry apply with whatever selection we have. */
                    if (cmd === 'inlineSize') {
                        const saved = savedRangeRef.current;
                        if (saved && editorEl.contains(saved.commonAncestorContainer)) {
                            applied = applyLessonFormatCommand(editorEl, saved, cmd, val);
                        }
                    } else {
                        execCmdOnEditor(editorEl, cmd, val);
                        applied = true;
                    }
                }
                /* Keep caret/selection in the editor after B/I (toolbar must not keep focus). */
                try {
                    editorEl.focus({ preventScroll: true });
                } catch {
                    /* ignore */
                }
                /* Refresh pin after DOM mutation so toggles (lists / size) see live range. */
                captureEditorSelection(editorEl, savedRangeRef);
                const after = savedRangeRef.current;
                formatPinRef.current =
                    after && editorEl.contains(after.commonAncestorContainer)
                        ? after.cloneRange()
                        : formatPinRef.current;
                if (formatPinRef.current) {
                    restoreEditorSelection(editorEl, {
                        current: formatPinRef.current,
                    });
                }
            }
            if (!applied && !FORMAT_CMDS.has(cmd)) {
                captureEditorSelection(editorEl, savedRangeRef);
                restoreEditorSelection(editorEl, savedRangeRef);
                editorEl.focus({ preventScroll: true });
                restoreEditorSelection(editorEl, savedRangeRef);
                execCmdOnEditor(editorEl, cmd, val);
            }
            captureEditorSelection(editorEl, savedRangeRef);
            markConstructBodyEdited(editorEl);
            editorEl.dispatchEvent(new Event('input', { bubbles: true }));
            markUserEdited();
        },
        [getEditorEl, pushHistory, markUserEdited, FORMAT_CMDS]
    );

    const insertBlock = useCallback(
        (type) => {
            const editorEl = getEditorEl();
            if (!editorEl) return;
            pushHistory(editorEl);
            restoreSelection(editorEl);
            editorEl.focus({ preventScroll: true });
            restoreSelection(editorEl);
            insertBlockInEditor(editorEl, type);
            markConstructBodyEdited(editorEl, { markUserEdited });
        },
        [getEditorEl, pushHistory, restoreSelection, markUserEdited]
    );

    const handleUndo = useCallback(() => {
        const editorEl = getEditorEl();
        if (!editorEl) return;
        undo(editorEl);
        markConstructBodyEdited(editorEl);
        editorEl.dispatchEvent(new Event('input', { bubbles: true }));
        markUserEdited();
    }, [getEditorEl, undo, markUserEdited]);

    const handleRedo = useCallback(() => {
        const editorEl = getEditorEl();
        if (!editorEl) return;
        redo(editorEl);
        markConstructBodyEdited(editorEl);
        editorEl.dispatchEvent(new Event('input', { bubbles: true }));
        markUserEdited();
    }, [getEditorEl, redo, markUserEdited]);

    const toolbarHandlers = useMemo(
        () => ({
            onUndo: handleUndo,
            onRedo: handleRedo,
            onToolCmd: runToolCmd,
            onInsertBlock: insertBlock,
            onInsertQuiz: () => insertBlock('quiz'),
            stashFormatSelection: pinFormatSelection,
            pinFormatSelection,
            undoDisabled: !panel.lessonHistoryStack.some(
                (entry) =>
                    entry &&
                    typeof entry === 'object' &&
                    entry.sectionIndex === panel.activeSectionIndex
            ),
            redoDisabled: !(panel.lessonHistoryRedoStack || []).some(
                (entry) =>
                    entry &&
                    typeof entry === 'object' &&
                    entry.sectionIndex === panel.activeSectionIndex
            ),
        }),
        [
            handleUndo,
            handleRedo,
            runToolCmd,
            insertBlock,
            pinFormatSelection,
            panel.lessonHistoryStack,
            panel.lessonHistoryRedoStack,
            panel.activeSectionIndex,
        ]
    );

    const bridgeMethods = useMemo(
        () => ({
            _flushConstructSectionToBody: flushSectionToBody,
            _pushLessonHistory: pushHistory,
            _markLessonUserEdited: markUserEdited,
        }),
        [flushSectionToBody, pushHistory, markUserEdited]
    );

    return {
        savedRangeRef,
        markUserEdited,
        flushSectionToBody,
        pushHistory,
        undo,
        redo,
        restoreSelection,
        getEditorEl,
        captureFullDraftBody,
        toolbarHandlers,
        bridgeMethods
    };
}
