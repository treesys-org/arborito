import { useCallback } from 'react';
import { isExamLesson } from '../api/exam-context.js';
import { scrollLessonContentToQuiz } from '../api/content-panel-scroll.js';
import {
    getQuizState,
    getQuizBlockById,
    buildStartQuizState,
    buildAnswerQuizPatch,
    evaluateQuizSession,
    RECALL_ADVANCE_DELAY_MS,
    resolveQuizStateForSessionNav,
    sessionAwaitingForQuestion,
    findBlockSessionKeyForQuestionId,
} from '../api/content-panel-quiz.js';
import {
    advanceQuestionSession,
    backQuestionSession,
    canAdvanceSession,
    createQuestionSession
} from '../api/question-session.js';

export function useContentPanelQuizActions({
    panel,
    patchPanel,
    parseApi,
    scheduleUpdate,
    contentAreaRef,
    isLessonConstructEdit,
    persistExamPass,
    recallAdvanceTimerRef,
    contentScrollSnapshotRef,
    lastRenderKeyRef,
    scrollTocOnRenderRef,
}) {
    const startQuiz = useCallback(
        (id) => {
            contentScrollSnapshotRef.current = contentAreaRef?.current?.scrollTop ?? 0;
            const block = getQuizBlockById(
                { ...panel, getContentForTocParse: parseApi.getContentForTocParse },
                id
            );
            const prev = getQuizState(panel.quizStates, id);
            patchPanel({
                quizStates: { ...panel.quizStates, [id]: buildStartQuizState(id, block, prev) }
            });
            lastRenderKeyRef.current = null;
            scheduleUpdate(true);
        },
        [panel, parseApi, patchPanel, contentAreaRef, scheduleUpdate, contentScrollSnapshotRef, lastRenderKeyRef]
    );

    const startTheExam = useCallback(() => {
        if (!panel.currentNode) return;
        if (isLessonConstructEdit()) return;
        patchPanel({
            examStarted: true,
            examShowResults: false,
            activeSectionIndex: 0,
            visitedSections: new Set([0]),
            quizAttentionNonce: (panel.quizAttentionNonce || 0) + 1,
            quizStates: {},
            blockSessions: {},
            lessonBodyMarkdown: null,
            lessonDraftLessonId: null,
            lessonConstructDraft: false,
        });
        parseApi.invalidateLessonParseCache();
        scrollTocOnRenderRef.current = true;
        lastRenderKeyRef.current = null;
        scheduleUpdate(true);
    }, [panel.currentNode, panel.quizAttentionNonce, parseApi, patchPanel, scheduleUpdate, isLessonConstructEdit, scrollTocOnRenderRef, lastRenderKeyRef]);

    const resetExamAttempt = useCallback(() => {
        if (!panel.currentNode) return;
        patchPanel({
            examStarted: true,
            examShowResults: false,
            activeSectionIndex: 0,
            visitedSections: new Set([0]),
            quizStates: {},
            blockSessions: {},
            quizPassRecord: {},
        });
        scrollTocOnRenderRef.current = true;
        lastRenderKeyRef.current = null;
        scheduleUpdate(true);
    }, [panel.currentNode, patchPanel, scheduleUpdate, scrollTocOnRenderRef, lastRenderKeyRef]);

    const startBlockQuiz = useCallback(
        (blockKey, questionIds, opts = {}) => {
            if (!blockKey || !questionIds?.length) return;
            const ctx = { ...panel, getContentForTocParse: parseApi.getContentForTocParse };
            const nextQuizStates = { ...panel.quizStates };
            const retryHints = {};
            if (opts.retry) {
                for (const id of questionIds) {
                    const prev = getQuizState(panel.quizStates, id);
                    if (prev?.v2Mode) {
                        retryHints[id] = {
                            finished: true,
                            v2Mode: prev.v2Mode,
                            attemptCount: prev.attemptCount || 0,
                        };
                    }
                    delete nextQuizStates[id];
                }
            }
            const firstId = questionIds[0];
            if (firstId) {
                const block = getQuizBlockById(ctx, firstId);
                const prev = opts.retry
                    ? retryHints[firstId] || null
                    : getQuizState(nextQuizStates, firstId);
                nextQuizStates[firstId] = buildStartQuizState(firstId, block, prev);
            }
            const session = createQuestionSession(blockKey, questionIds);
            patchPanel({
                quizStates: nextQuizStates,
                blockSessions: { ...panel.blockSessions, [blockKey]: session },
                quizAttentionNonce: (panel.quizAttentionNonce || 0) + 1,
            });
            lastRenderKeyRef.current = null;
            scheduleUpdate(true);
            queueMicrotask(() =>
                scrollLessonContentToQuiz(contentAreaRef?.current, { attention: true })
            );
        },
        [panel, parseApi, patchPanel, scheduleUpdate, contentAreaRef, lastRenderKeyRef]
    );

    const advanceBlockSession = useCallback(
        (blockKey) => {
            if (recallAdvanceTimerRef.current) {
                clearTimeout(recallAdvanceTimerRef.current);
                recallAdvanceTimerRef.current = null;
            }
            const session = panel.blockSessions?.[blockKey];
            if (!session || !canAdvanceSession(session)) return;
            const next = advanceQuestionSession(session);
            if (!next) return;
            if (!next.finished) {
                const nextId = next.quizIds[next.currentIndex];
                const ctx = { ...panel, getContentForTocParse: parseApi.getContentForTocParse };
                const nextQuizStates = { ...panel.quizStates };
                if (nextId) {
                    const block = getQuizBlockById(ctx, nextId);
                    nextQuizStates[nextId] = resolveQuizStateForSessionNav(nextQuizStates, nextId, block);
                }
                const awaitingAdvance = nextId
                    ? sessionAwaitingForQuestion(nextQuizStates, nextId)
                    : false;
                contentScrollSnapshotRef.current = null;
                patchPanel({
                    blockSessions: {
                        ...panel.blockSessions,
                        [blockKey]: { ...next, awaitingAdvance },
                    },
                    quizStates: nextQuizStates,
                });
                lastRenderKeyRef.current = null;
                scheduleUpdate(true);
                return;
            }
            const evalPatch = evaluateQuizSession(
                {
                    ...panel,
                    blockSessions: { ...panel.blockSessions, [blockKey]: next },
                },
                next
            );
            const visited = new Set(panel.visitedSections);
            visited.add(panel.activeSectionIndex);
            const isExam = panel.currentNode && isExamLesson(panel.currentNode);
            if (isExam) {
                patchPanel({
                    blockSessions: { ...panel.blockSessions, [blockKey]: next },
                    visitedSections: visited,
                    ...evalPatch,
                });
            } else {
                const nextSessions = { ...panel.blockSessions };
                delete nextSessions[blockKey];
                patchPanel({
                    blockSessions: nextSessions,
                    visitedSections: visited,
                    ...evalPatch,
                });
            }
            lastRenderKeyRef.current = null;
            scheduleUpdate(true);
        },
        [panel, parseApi, patchPanel, scheduleUpdate, recallAdvanceTimerRef, contentScrollSnapshotRef, lastRenderKeyRef]
    );

    const backBlockSession = useCallback(
        (blockKey) => {
            const session = panel.blockSessions?.[blockKey];
            if (!session) return;
            const prev = backQuestionSession(session);
            if (!prev || prev === session) return;
            const id = prev.quizIds[prev.currentIndex];
            const ctx = { ...panel, getContentForTocParse: parseApi.getContentForTocParse };
            const nextQuizStates = { ...panel.quizStates };
            if (id) {
                const block = getQuizBlockById(ctx, id);
                nextQuizStates[id] = resolveQuizStateForSessionNav(nextQuizStates, id, block);
            }
            const awaitingAdvance = id ? sessionAwaitingForQuestion(nextQuizStates, id) : false;
            contentScrollSnapshotRef.current = null;
            patchPanel({
                blockSessions: {
                    ...panel.blockSessions,
                    [blockKey]: { ...prev, awaitingAdvance },
                },
                quizStates: nextQuizStates,
            });
            lastRenderKeyRef.current = null;
            scheduleUpdate(true);
        },
        [panel, parseApi, patchPanel, scheduleUpdate, contentScrollSnapshotRef, lastRenderKeyRef]
    );

    const dismissBlockSession = useCallback(
        (blockKey) => {
            if (!blockKey) return;
            const next = { ...panel.blockSessions };
            delete next[blockKey];
            patchPanel({ blockSessions: next });
            lastRenderKeyRef.current = null;
            scheduleUpdate(true);
        },
        [panel.blockSessions, patchPanel, scheduleUpdate, lastRenderKeyRef]
    );

    const answerQuiz = useCallback(
        (id, isCorrect) => {
            const sessionsBefore = panel.blockSessions;
            const sessionBlockKeyBefore = findBlockSessionKeyForQuestionId(sessionsBefore, id);
            if (!sessionBlockKeyBefore) {
                contentScrollSnapshotRef.current = contentAreaRef?.current?.scrollTop ?? 0;
            } else {
                contentScrollSnapshotRef.current = null;
            }
            const patch = buildAnswerQuizPatch(
                { ...panel, isLessonConstructEdit, persistExamPass },
                id,
                isCorrect
            );
            const deferAdvanceForRecall = !!patch.scheduleRecallAdvance;
            if (deferAdvanceForRecall) {
                const { blockKey } = patch.scheduleRecallAdvance;
                if (recallAdvanceTimerRef.current) clearTimeout(recallAdvanceTimerRef.current);
                recallAdvanceTimerRef.current = setTimeout(() => {
                    recallAdvanceTimerRef.current = null;
                    if (blockKey) advanceBlockSession(blockKey);
                }, RECALL_ADVANCE_DELAY_MS);
                delete patch.scheduleRecallAdvance;
            }
            patchPanel(patch);
            lastRenderKeyRef.current = null;
            scheduleUpdate(true);
        },
        [panel, isLessonConstructEdit, persistExamPass, patchPanel, contentAreaRef, scheduleUpdate, advanceBlockSession, recallAdvanceTimerRef, contentScrollSnapshotRef, lastRenderKeyRef]
    );

    return {
        startQuiz,
        startTheExam,
        resetExamAttempt,
        startBlockQuiz,
        advanceBlockSession,
        backBlockSession,
        dismissBlockSession,
        answerQuiz,
    };
}
