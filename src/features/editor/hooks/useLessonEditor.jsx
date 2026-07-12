import { useCallback, useMemo, useRef } from 'react';
import {
    extractTocSectionMarkdown,
    replaceTocSectionMarkdown,
    sanitiseConstructSectionMarkdown,
} from '../../learning/api/lesson-section-slices.js';
import { execCmdOnEditor, insertBlockInEditor } from '../api/editor-commands.js';
import { applyLessonFormatCommand } from '../api/editor-format-apply.js';
import {
    captureEditorSelection,
    restoreEditorSelection,
} from '../api/editor-selection.js';
import {
    constructSectionMarkers,
    assignHeadingIdsFromBlocks,
    captureEditorSectionMarkdown,
    applyEditorSectionMarkdown,
} from '../api/logic/lesson-editor-dom.js';

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
    const boundSectionRef = useRef(panel.activeSectionIndex);
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

    const getConstructEditorSectionMarkdown = useCallback(() => {
        const full = getLessonBodyForToc();
        return extractTocSectionMarkdown(full, panel.activeSectionIndex);
    }, [getLessonBodyForToc, panel.activeSectionIndex]);

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
        const flushIdx = Number.isInteger(boundSectionRef.current)
            ? boundSectionRef.current
            : panel.activeSectionIndex;
        const sectionMd = sanitiseConstructSectionMarkdown(captureEditorSectionMarkdown(ed));
        const full = getLessonBodyForToc();
        const nextBody = replaceTocSectionMarkdown(full, flushIdx, sectionMd);
        return { bodyMarkdown: nextBody, headerMetaDraft: panel.headerMetaDraft };
    }, [editorRef, isLessonConstructEdit, panel, getLessonBodyForToc]);

    const flushSectionToBody = useCallback(() => {
        const ed = editorRef?.current;
        if (!ed || !isLessonConstructEdit() || !panel.currentNode) return;
        /* Only persist DOM → markdown when the author actually edited this section.
           Round-tripping a seeded but untouched editor corrupts headings and @quiz blocks. */
        const dirty = ed.dataset.arboritoEditorDirty === '1' || panel.lessonUserHasEdited;
        if (!dirty) return;
        const flushIdx = Number.isInteger(boundSectionRef.current)
            ? boundSectionRef.current
            : panel.activeSectionIndex;
        const sectionMd = sanitiseConstructSectionMarkdown(captureEditorSectionMarkdown(ed));
        const full = getLessonBodyForToc();
        const nextBody = replaceTocSectionMarkdown(full, flushIdx, sectionMd);
        if (nextBody === panel.lessonBodyMarkdown) return;
        invalidateLessonParseCache?.();
        patchPanel({
            lessonBodyMarkdown: nextBody,
            lessonDraftLessonId: panel.currentNode.id,
            lessonConstructDraft: true,
        });
        scheduleDraftAutosave?.();
    }, [editorRef, isLessonConstructEdit, panel, patchPanel, getLessonBodyForToc, invalidateLessonParseCache, scheduleDraftAutosave]);

    const pushHistory = useCallback(
        (editorEl) => {
            if (!editorEl) return;
            const md = captureEditorSectionMarkdown(editorEl);
            const stack = [...panel.lessonHistoryStack];
            if (stack.length > HISTORY_MAX) stack.shift();
            stack.push(md);
            patchPanel({ lessonHistoryStack: stack });
        },
        [panel.lessonHistoryStack, patchPanel]
    );

    const undo = useCallback(
        (editorEl) => {
            if (!editorEl || panel.lessonHistoryStack.length === 0) return;
            const stack = [...panel.lessonHistoryStack];
            const prev = stack.pop();
            patchPanel({ lessonHistoryStack: stack });
            applyEditorSectionMarkdown(editorEl, prev);
        },
        [panel.lessonHistoryStack, patchPanel]
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
        formatPinRef.current =
            saved && editorEl.contains(saved.commonAncestorContainer) ? saved.cloneRange() : null;
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
                            if (
                                !live.collapsed &&
                                editorEl.contains(live.commonAncestorContainer)
                            ) {
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
            }
            if (!applied && !FORMAT_CMDS.has(cmd)) {
                captureEditorSelection(editorEl, savedRangeRef);
                restoreEditorSelection(editorEl, savedRangeRef);
                editorEl.focus({ preventScroll: true });
                restoreEditorSelection(editorEl, savedRangeRef);
                execCmdOnEditor(editorEl, cmd, val);
            }
            captureEditorSelection(editorEl, savedRangeRef);
            try {
                editorEl.dataset.arboritoEditorDirty = '1';
            } catch {
                /* ignore */
            }
            editorEl.dispatchEvent(new Event('input', { bubbles: true }));
            markUserEdited();
        },
        [getEditorEl, pushHistory, markUserEdited, FORMAT_CMDS]
    );

    const stashFormatSelection = pinFormatSelection;

    const insertBlock = useCallback(
        (type) => {
            const editorEl = getEditorEl();
            if (!editorEl) return;
            pushHistory(editorEl);
            restoreSelection(editorEl);
            editorEl.focus({ preventScroll: true });
            restoreSelection(editorEl);
            insertBlockInEditor(editorEl, type);
            markUserEdited();
        },
        [getEditorEl, pushHistory, restoreSelection, markUserEdited]
    );

    const handleUndo = useCallback(() => {
        const editorEl = getEditorEl();
        if (!editorEl) return;
        undo(editorEl);
        markUserEdited();
    }, [getEditorEl, undo, markUserEdited]);

    const toolbarHandlers = useMemo(
        () => ({
            onUndo: handleUndo,
            onToolCmd: runToolCmd,
            onInsertBlock: insertBlock,
            onInsertQuiz: () => insertBlock('quiz'),
            stashFormatSelection: pinFormatSelection,
            pinFormatSelection,
            undoDisabled: panel.lessonHistoryStack.length === 0
        }),
        [handleUndo, runToolCmd, insertBlock, pinFormatSelection, panel.lessonHistoryStack.length]
    );

    const bridgeMethods = useMemo(
        () => ({
            _constructEditorBoundSection: boundSectionRef.current,
            _flushConstructSectionToBody: flushSectionToBody,
            _captureLessonDraftFromDom: flushSectionToBody,
            _getConstructEditorSectionMarkdown: getConstructEditorSectionMarkdown,
            _pushLessonHistory: pushHistory,
            _lessonUndo: undo,
            _markLessonUserEdited: markUserEdited,
            _assignHeadingIdsFromBlocks: assignHeadingIdsFromBlocks,
            _constructSectionMarkers: constructSectionMarkers
        }),
        [
            flushSectionToBody,
            getConstructEditorSectionMarkdown,
            pushHistory,
            undo,
            markUserEdited
        ]
    );

    boundSectionRef.current = panel.activeSectionIndex;

    return {
        boundSectionRef,
        savedRangeRef,
        getConstructEditorSectionMarkdown,
        markUserEdited,
        flushSectionToBody,
        pushHistory,
        undo,
        restoreSelection,
        captureEditorSectionMarkdown,
        applyEditorSectionMarkdown,
        assignHeadingIdsFromBlocks,
        getEditorEl,
        captureFullDraftBody,
        toolbarHandlers,
        bridgeMethods
    };
}
