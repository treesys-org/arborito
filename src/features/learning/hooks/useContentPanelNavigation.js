import { useCallback, useRef } from 'react';
import { useLearningStore } from './useLearning.js';
import { isExamLesson } from '../api/exam-context.js';
import {
    getToc,
    findFirstIncompleteSectionIndex,
    sectionHasIncompleteQuiz,
    isSectionQuizSatisfied,
    isTocSectionCompleted,
    getExpandedQuestionIdsForSection,
    isTocSectionAccessible,
    appendExamFinalTocItem,
    isExamFinalSectionIndex,
    areAllExamQuestionsFinished,
    getContentTocLength,
    buildExamSectionOpts,
    getTocAccess,
} from '../api/content-toc.js';
import {
    scrollLessonContentToQuiz,
    pulseTocRowAttention
} from '../api/content-panel-scroll.js';
import {
    hasActiveQuizInProgress,
    makeQuizStateGetter,
    persistLessonReadingPosition,
} from '../api/content-panel-quiz.js';

export function useContentPanelNavigation({
    panel,
    patchPanel,
    parseApi,
    scheduleUpdate,
    isLessonConstructEdit,
    confirmPanelLeaveIfNeeded,
    panelLiveRef,
    constructApiRef,
    contentScrollSnapshotRef,
    scrollTocOnRenderRef,
    lastRenderKeyRef,
    pendingTocAttentionIdxRef,
    pendingQuizScrollRef,
    contentAreaRef,
    tocNavRef,
    scrollToSectionRef,
}) {
    const store = useLearningStore();
    /** Lesson soft-gate: first Next with unfinished quiz → warn+scroll; second → continue. */
    const softQuizWarnedSectionRef = useRef(-1);

    const scrollToSection = useCallback(
        async (idx, opts = {}) => {
            const visitedForPersist = opts.visitedSections ?? panel.visitedSections;
            const contentForParse = parseApi.getContentForTocParse();
            const isExam = panel.currentNode && isExamLesson(panel.currentNode);
            const { blocks, toc } = parseApi.getLessonParseModel(contentForParse, !!isExam);
            const tocAccess = getTocAccess(!!isExam, panel.examStarted);
            const sectionOpts = isExam
                ? buildExamSectionOpts({
                      examStarted: panel.examStarted,
                      examShowResults: panel.examShowResults,
                  })
                : {};
            const construct = isLessonConstructEdit();
            const getQuizStateFn = makeQuizStateGetter(panel.quizStates, panel.quizPassRecord);
            if (
                !construct &&
                !isTocSectionAccessible(
                    tocAccess,
                    idx,
                    toc,
                    blocks,
                    panel.visitedSections,
                    getQuizStateFn,
                    sectionOpts
                )
            ) {
                return;
            }
            if (
                idx !== panel.activeSectionIndex &&
                !construct &&
                !(isExam && panel.examStarted) &&
                hasActiveQuizInProgress({ ...panel, isLessonConstructEdit })
            ) {
                const fromIdx = panel.activeSectionIndex;
                const ok = await confirmPanelLeaveIfNeeded();
                if (!ok) return;
                if (panelLiveRef.current.activeSectionIndex !== fromIdx) return;
            }
            const switchingSection = construct && idx !== panel.activeSectionIndex;
            if (switchingSection) {
                const ed = constructApiRef.current?._getEditorEl?.();
                if (ed?.dataset?.arboritoEditorDirty === '1') {
                    const flushed = constructApiRef.current._flushConstructSectionToBody?.(
                        { force: true }
                    );
                    if (
                        flushed == null ||
                        flushed.ok === false ||
                        flushed.aborted ||
                        ed?.dataset?.arboritoEditorDirty === '1'
                    ) {
                        return;
                    }
                }
            }
            const sectionChanging = idx !== panel.activeSectionIndex;
            if (sectionChanging) contentScrollSnapshotRef.current = null;
            patchPanel({
                activeSectionIndex: idx,
                ...(switchingSection
                    ? { lessonHistoryStack: [], lessonHistoryRedoStack: [] }
                    : {}),
            });
            if (sectionChanging) scrollTocOnRenderRef.current = true;
            if (panel.currentNode) {
                const bookmark = store.getBookmark(panel.currentNode.id, panel.currentNode.content);
                if (bookmark && bookmark.index === idx) {
                    const tocForBookmark = getToc({ content: panel.currentNode.content });
                    store.saveBookmark(panel.currentNode.id, panel.currentNode.content, idx, panel.visitedSections, {
                        manual: true,
                        sectionTitle: String(tocForBookmark[idx]?.text || bookmark.sectionTitle || '').trim()
                    });
                }
                persistLessonReadingPosition(store, {
                    nodeId: panel.currentNode.id,
                    index: idx,
                    visitedSections: visitedForPersist,
                    contentRaw: panel.currentNode.content,
                    quizPassRecord: panel.quizPassRecord,
                    isExam: !!isExam,
                });
            }
            lastRenderKeyRef.current = null;
            scheduleUpdate(true);
        },
        [panel, parseApi, isLessonConstructEdit, patchPanel, scheduleUpdate, confirmPanelLeaveIfNeeded, panelLiveRef, constructApiRef, contentScrollSnapshotRef, scrollTocOnRenderRef, lastRenderKeyRef]
    );

    scrollToSectionRef.current = scrollToSection;

    const focusPendingSection = useCallback(
        (targetIdx, { scrollQuiz = false } = {}) => {
            if (targetIdx < 0) return;
            pendingTocAttentionIdxRef.current = targetIdx;
            if (scrollQuiz) pendingQuizScrollRef.current = true;
            if (targetIdx !== panel.activeSectionIndex) {
                scrollToSection(targetIdx);
                return;
            }
            pulseTocRowAttention(tocNavRef?.current, targetIdx);
            if (scrollQuiz) {
                scrollLessonContentToQuiz(contentAreaRef?.current, { attention: true });
                patchPanel({ quizAttentionNonce: (panel.quizAttentionNonce || 0) + 1 });
            }
            pendingTocAttentionIdxRef.current = null;
            pendingQuizScrollRef.current = false;
        },
        [panel.activeSectionIndex, panel.quizAttentionNonce, scrollToSection, contentAreaRef, tocNavRef, patchPanel, pendingTocAttentionIdxRef, pendingQuizScrollRef]
    );

    const completeAndNext = useCallback(() => {
        if (!panel.currentNode) return;
        const contentForParse = parseApi.getContentForTocParse();
        const isExam = isExamLesson(panel.currentNode);
        const sectionOpts = isExam
            ? buildExamSectionOpts({
                  examStarted: panel.examStarted,
                  examShowResults: panel.examShowResults,
              })
            : {};
        const { blocks: allBlocks, toc: rawToc } = parseApi.getLessonParseModel(contentForParse, isExam);
        const toc = isExam ? appendExamFinalTocItem(rawToc, true) : rawToc;
        const idx = panel.activeSectionIndex;
        const questionIds = getExpandedQuestionIdsForSection(allBlocks, toc, idx);
        const getQuizStateFn = makeQuizStateGetter(panel.quizStates, panel.quizPassRecord);
        const focusFirstIncomplete = (pendingIdx) => {
            if (pendingIdx < 0) return;
            const scrollQuiz = sectionHasIncompleteQuiz(
                pendingIdx,
                allBlocks,
                toc,
                getQuizStateFn,
                sectionOpts
            );
            focusPendingSection(pendingIdx, { scrollQuiz });
        };
        if (isExamFinalSectionIndex(toc, idx)) return;
        if (questionIds.length > 0) {
            const quizOk = isExam
                ? questionIds.every((qid) => {
                      const st = getQuizStateFn(qid);
                      return !!(st && st.finished);
                  })
                : isSectionQuizSatisfied(idx, allBlocks, toc, getQuizStateFn);
            if (!quizOk) {
                if (isExam) {
                    store.notify(
                        store.ui.lessonQuizRequired ||
                            'Answer every question in this section before continuing.',
                        true
                    );
                    focusPendingSection(idx, { scrollQuiz: true });
                    return;
                }
                /* Lesson: optional quiz — amber nudge once, then allow Next. */
                if (softQuizWarnedSectionRef.current !== idx) {
                    softQuizWarnedSectionRef.current = idx;
                    store.notify(
                        store.ui.lessonQuizOptionalHint ||
                            "There's a quiz here. Tap Next again to skip.",
                        false,
                        4000
                    );
                    focusPendingSection(idx, { scrollQuiz: true });
                    return;
                }
            } else {
                softQuizWarnedSectionRef.current = -1;
            }
        }
        softQuizWarnedSectionRef.current = -1;
        const visited = new Set(panel.visitedSections);
        visited.add(idx);
        const contentLen = getContentTocLength(toc);
        if (idx < contentLen - 1) {
            patchPanel({ visitedSections: visited, examShowResults: false });
            scrollToSection(idx + 1, { visitedSections: visited });
            return;
        }
        if (isExam && panel.examStarted && idx === contentLen - 1) {
            if (!areAllExamQuestionsFinished(allBlocks, getQuizStateFn)) {
                store.notify(
                    store.ui.examCompleteAllQuizzes ||
                        store.ui.lessonQuizRequired ||
                        'Answer every exam question before viewing results.',
                    true
                );
                const pendingIdx = findFirstIncompleteSectionIndex(
                    toc,
                    allBlocks,
                    visited,
                    getQuizStateFn,
                    sectionOpts
                );
                focusFirstIncomplete(pendingIdx);
                return;
            }
            const finalIdx = toc.length - 1;
            visited.add(finalIdx);
            patchPanel({
                visitedSections: visited,
                examShowResults: true,
                activeSectionIndex: finalIdx,
            });
            scrollTocOnRenderRef.current = true;
            lastRenderKeyRef.current = null;
            scheduleUpdate(true);
            return;
        }
        const allDone = toc
            .slice(0, contentLen)
            .every((_, i) =>
                isTocSectionCompleted(i, toc, allBlocks, visited, getQuizStateFn, sectionOpts)
            );
        if (!allDone) {
            store.notify(
                store.ui.lessonSectionsIncomplete ||
                    'Mark every section of the outline before completing the lesson.',
                true
            );
            const pendingIdx = findFirstIncompleteSectionIndex(
                toc,
                allBlocks,
                visited,
                getQuizStateFn,
                sectionOpts
            );
            focusFirstIncomplete(pendingIdx);
            return;
        }
        if (isExam && panel.examStarted) {
            if (!areAllExamQuestionsFinished(allBlocks, getQuizStateFn)) {
                const pendingIdx = findFirstIncompleteSectionIndex(
                    toc,
                    allBlocks,
                    visited,
                    getQuizStateFn,
                    sectionOpts
                );
                focusFirstIncomplete(pendingIdx);
                return;
            }
            patchPanel({ visitedSections: visited, examShowResults: true, activeSectionIndex: toc.length - 1 });
            return;
        }
        patchPanel({ visitedSections: visited });
        if (!store.isCompleted(panel.currentNode.id)) {
            store.markComplete(panel.currentNode.id, true);
            store.checkForModuleCompletion(panel.currentNode.id);
        }
        store.closeContent({ skipConfirm: true });
    }, [panel, parseApi, patchPanel, scrollToSection, focusPendingSection, scrollTocOnRenderRef, lastRenderKeyRef, scheduleUpdate]);

    return { scrollToSection, focusPendingSection, completeAndNext };
}
