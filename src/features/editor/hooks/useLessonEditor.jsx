import { useCallback, useMemo, useRef } from 'react';
import {
    extractTocSectionMarkdown,
    replaceTocSectionMarkdown,
    sanitiseConstructSectionMarkdown,
} from '../../learning/api/lesson-section-slices.js';
import { readQuizWizard } from '../api/quiz-wizard-block.js';
import { execCmdOnEditor, insertBlockInEditor } from '../api/editor-commands.js';
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
        const metaProxy = ed.getElementsByClassName('arborito-quiz-edit')[0];
        const metaProxyEl =
            metaProxy?.getAttribute?.('data-quiz-meta-proxy') === '1' ? metaProxy : null;
        let headerMetaDraft = panel.headerMetaDraft;
        if (metaProxyEl) {
            const ch = readQuizWizard(metaProxyEl);
            headerMetaDraft = {
                ...(headerMetaDraft?.nodeId === panel.currentNode.id ? headerMetaDraft : {}),
                nodeId: panel.currentNode.id,
                challenge: ch
            };
        }
        const sectionMd = sanitiseConstructSectionMarkdown(captureEditorSectionMarkdown(ed));
        const full = getLessonBodyForToc();
        const nextBody = replaceTocSectionMarkdown(full, flushIdx, sectionMd);
        return { bodyMarkdown: nextBody, headerMetaDraft };
    }, [editorRef, isLessonConstructEdit, panel, getLessonBodyForToc]);

    const flushSectionToBody = useCallback(() => {
        const ed = editorRef?.current;
        if (!ed || !isLessonConstructEdit() || !panel.currentNode) return;
        const flushIdx = Number.isInteger(boundSectionRef.current)
            ? boundSectionRef.current
            : panel.activeSectionIndex;
        const metaProxy = ed.getElementsByClassName('arborito-quiz-edit')[0];
        const metaProxyEl =
            metaProxy?.getAttribute?.('data-quiz-meta-proxy') === '1' ? metaProxy : null;
        let headerMetaDraft = panel.headerMetaDraft;
        if (metaProxyEl) {
            const ch = readQuizWizard(metaProxyEl);
            headerMetaDraft = {
                ...(headerMetaDraft?.nodeId === panel.currentNode.id ? headerMetaDraft : {}),
                nodeId: panel.currentNode.id,
                challenge: ch
            };
            invalidateLessonParseCache?.();
        }
        const sectionMd = sanitiseConstructSectionMarkdown(captureEditorSectionMarkdown(ed));
        const full = getLessonBodyForToc();
        const nextBody = replaceTocSectionMarkdown(full, flushIdx, sectionMd);
        const metaChanged = headerMetaDraft !== panel.headerMetaDraft;
        if (nextBody === panel.lessonBodyMarkdown && !metaChanged) return;
        const patch = {
            lessonBodyMarkdown: nextBody,
            lessonDraftLessonId: panel.currentNode.id
        };
        if (metaChanged) patch.headerMetaDraft = headerMetaDraft;
        patchPanel(patch);
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

    const getEditorEl = useCallback(() => editorRef?.current ?? null, [editorRef]);

    const runToolCmd = useCallback(
        (cmd, val) => {
            const editorEl = getEditorEl();
            if (!editorEl) return;
            pushHistory(editorEl);
            restoreSelection(editorEl);
            editorEl.focus({ preventScroll: true });
            restoreSelection(editorEl);
            execCmdOnEditor(editorEl, cmd, val);
            markUserEdited();
        },
        [getEditorEl, pushHistory, restoreSelection, markUserEdited]
    );

    const insertBlock = useCallback(
        (type) => {
            const editorEl = getEditorEl();
            if (!editorEl) return;
            pushHistory(editorEl);
            insertBlockInEditor(editorEl, type);
            markUserEdited();
        },
        [getEditorEl, pushHistory, markUserEdited]
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
            undoDisabled: panel.lessonHistoryStack.length === 0
        }),
        [handleUndo, runToolCmd, insertBlock, panel.lessonHistoryStack.length]
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
