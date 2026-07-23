import { getArboritoStore as store } from '../../../core/store-singleton.js';
import { parseContent } from './parser.js';
import { parseArboritoFile } from '../../editor/api/editor-engine.js';
import { lessonContentHasCompleteQuiz } from './quiz-status.js';
import { isExamLesson } from './exam-context.js';
import {
    getExpandedQuestionIdsForExam,
    makeBlockSessionKey,
} from './content-toc.js';
import { updateCareFromQuiz } from '../../garden-progress/api/care-schedule.js';
import { didPassQuizSession, quizSessionScore, resolveQuizPassRate } from './quiz-pass.js';
import {
    pickStudyQuizMode,
    pickNextQuizMode,
    normalizeChallenge,
    getPlayableModes,
    expandAllQuizQuestions,
    expandQuizBlock,
    QUIZ_MODE_STEPS,
    QUIZ_MODE_RECALL,
} from './quiz-schema.js';
import { RECALL_ADVANCE_MS } from './quiz-player.js';

export { makeBlockSessionKey } from './content-toc.js';

/** Stable session key for a linear exam (all @quiz blocks in one run). */
export function makeExamSessionKey(nodeId) {
    return `exam:${nodeId ?? ''}`;
}

/** True while the student is mid-evaluation (between start and summary). */
export function isExamSessionActive(panel, nodeId) {
    if (!panel?.examStarted || nodeId == null) return false;
    const session = panel.blockSessions?.[makeExamSessionKey(nodeId)];
    return !!(session && !session.finished);
}

/** Quiz lifecycle helpers. */

export function createDefaultQuizState() {
    return {
        started: false,
        finished: false,
        currentIdx: 0,
        score: 0,
        results: [],
    };
}

export function getQuizState(quizStates, id) {
    return quizStates[id] || createDefaultQuizState();
}

export function findBlockSessionKeyForQuestionId(blockSessions, questionId) {
    if (!blockSessions || !questionId) return null;
    for (const [key, session] of Object.entries(blockSessions)) {
        if (session?.quizIds?.includes(questionId)) return key;
    }
    return null;
}

export function getBlockSession(blockSessions, key) {
    return blockSessions?.[key] || null;
}

/** True when the section has an unfinished inline @quiz session (lesson or exam). */
export function sectionHasLiveBlockSession(blockSessions, nodeId, sectionIndex) {
    if (!blockSessions || nodeId == null || sectionIndex == null) return false;
    const prefix = `${nodeId}:${sectionIndex}:`;
    return Object.entries(blockSessions).some(
        ([key, session]) => key.startsWith(prefix) && session && !session.finished
    );
}

export function isQuizBlockComplete(block, quizStates) {
    const ids = expandQuizBlock(block).map((q) => q.id || 'quiz');
    if (!ids.length) return true;
    return ids.every((id) => {
        const st = getQuizState(quizStates, id);
        return st.finished;
    });
}

/** All questions finished; block passes at its configured pass rate (default 80%). */
export function isQuizBlockPassed(block, quizStates) {
    const ids = expandQuizBlock(block).map((q) => q.id || 'quiz');
    if (!ids.length) return true;
    const getState = (id) => getQuizState(quizStates, id);
    if (!ids.every((id) => getState(id).finished)) return false;
    return didPassQuizSession(ids, getState, resolveQuizPassRate(block));
}

export function hasActiveQuizInProgress(ctx) {
    if (ctx.isLessonConstructEdit?.()) return false;
    const states = Object.values(ctx.quizStates || {});
    if (states.some((s) => s.started && !s.finished)) return true;
    for (const session of Object.values(ctx.blockSessions || {})) {
        if (!session || session.finished) continue;
        if (
            session.quizIds?.some((id) => {
                const st = getQuizState(ctx.quizStates, id);
                return st.started && !st.finished;
            })
        ) {
            return true;
        }
    }
    return false;
}

/** Exam started but final summary not shown — warn only when closing, not between sections. */
export function hasExamAttemptInProgress(ctx) {
    if (ctx.isLessonConstructEdit?.()) return false;
    return !!(
        ctx.currentNode &&
        isExamLesson(ctx.currentNode) &&
        ctx.examStarted &&
        !ctx.examShowResults
    );
}

/** True when leaving the lesson should confirm (mid-quiz or unfinished exam attempt). */
export function shouldConfirmLessonLeave(ctx) {
    return hasActiveQuizInProgress(ctx) || hasExamAttemptInProgress(ctx);
}

/** Restore persisted quiz pass flags from local storage. */
export function hydrateQuizPassRecord(quizPassedIds) {
    const out = {};
    if (!Array.isArray(quizPassedIds)) return out;
    for (const id of quizPassedIds) {
        if (id) out[String(id)] = true;
    }
    return out;
}

/** Quiz state for TOC / gating: live attempt wins, else persisted pass. */
export function getEffectiveQuizState(quizStates, quizPassRecord, id) {
    const live = getQuizState(quizStates, id);
    if (live.started || live.finished) return live;
    if (quizPassRecord?.[id]) {
        return {
            ...createDefaultQuizState(),
            started: true,
            finished: true,
            correct: true,
            v2Answered: true,
            score: 1,
            results: [true],
        };
    }
    return live;
}

export function makeQuizStateGetter(quizStates, quizPassRecord) {
    return (id) => getEffectiveQuizState(quizStates, quizPassRecord, id);
}

export function isQuizBlockPassedFromRecord(block, quizPassRecord) {
    const ids = expandQuizBlock(block).map((q) => q.id || 'quiz');
    if (!ids.length) return true;
    return ids.every((id) => !!quizPassRecord?.[id]);
}

export function persistLessonReadingPosition(
    storeApi,
    { nodeId, index, visitedSections, contentRaw, quizPassRecord, updateIndex = true, isExam = false }
) {
    if (!nodeId) return;
    const quizPassed = isExam
        ? []
        : Object.entries(quizPassRecord || {})
              .filter(([, passed]) => passed)
              .map(([id]) => id);
    let saveIndex = index;
    if (!updateIndex && contentRaw) {
        const recent = storeApi.getRecentLessonPosition?.(nodeId, contentRaw);
        if (recent && typeof recent.index === 'number') saveIndex = recent.index;
    }
    storeApi.recordRecentLesson(nodeId, saveIndex, visitedSections, contentRaw, quizPassed);
}

function mergeQuizPassRecord(prev, quizStates, ids, passRate) {
    const next = { ...(prev || {}) };
    if (!ids?.length) return next;
    const getState = (id) => getQuizState(quizStates, id);
    if (!didPassQuizSession(ids, getState, passRate)) return next;
    for (const id of ids) next[id] = true;
    return next;
}

export function getQuizBlockById(ctx, id) {
    if (!ctx.currentNode) return null;
    const contentForParse = ctx.getContentForTocParse?.() || ctx.currentNode.content || '';
    const node = ctx.currentNode;
    const usingBodyDraft =
        ctx.lessonConstructDraft &&
        ctx.lessonDraftLessonId === node?.id &&
        ctx.lessonBodyMarkdown !== null;
    let bodyForBlocks;
    if (usingBodyDraft) {
        bodyForBlocks = ctx.lessonBodyMarkdown;
    } else {
        const parsed = parseArboritoFile(contentForParse);
        bodyForBlocks = parsed.body || contentForParse;
    }
    const blocks = parseContent(bodyForBlocks);
    for (const block of blocks) {
        if (block.type !== 'quiz') continue;
        for (const q of expandAllQuizQuestions([block])) {
            if ((q.id || 'quiz') === id) return q;
        }
    }
    return null;
}

function pickRetryQuizMode(challenge, blockId, previousMode, attempt) {
    return pickNextQuizMode(challenge, blockId, previousMode, attempt);
}

export function buildStartQuizState(id, block, prev) {
    const ch = block ? normalizeChallenge(block) : null;
    /* Retry only after a finished attempt — in-progress Back/Next must keep the mode. */
    const isRetry = !!(prev && prev.finished);
    const attempt = isRetry ? (prev.attemptCount || 0) + 1 : Number(prev?.attemptCount) || 0;
    const mode = ch
        ? isRetry && prev.v2Mode
            ? pickRetryQuizMode(ch, id, prev.v2Mode, attempt)
            : pickStudyQuizMode(ch, id, attempt)
        : 'multiple';
    return {
        started: true,
        finished: false,
        currentIdx: 0,
        score: 0,
        results: [],
        v2Answered: false,
        correct: null,
        v2Mode: mode,
        attemptCount: attempt,
        v2RecallRevealed: false,
        chipOrder: [],
        /* Steps mode: empty pick list; pool is shuffled in the UI (same pattern as chips). */
        v2StepsOrder: mode === QUIZ_MODE_STEPS ? [] : null,
    };
}

/** Keep an already-answered question state when navigating back/forward in a session. */
export function isQuestionAnswered(st) {
    return !!(st?.finished || st?.v2Answered);
}

export function resolveQuizStateForSessionNav(quizStates, id, block) {
    const prev = getQuizState(quizStates, id);
    if (isQuestionAnswered(prev)) return prev;
    /* Preserve an in-progress attempt (mode, chips, steps) across Back/Next. */
    if (prev?.started && prev.v2Mode && !prev.finished) return prev;
    return buildStartQuizState(id, block, prev);
}

export function sessionAwaitingForQuestion(quizStates, questionId) {
    return isQuestionAnswered(getQuizState(quizStates, questionId));
}

export function evaluateQuizSession(ctx, session) {
    const ids = session.quizIds || [];
    const getState = (id) => getQuizState(ctx.quizStates, id);
    const { correct, total } = quizSessionScore(ids, getState);
    const isExam = ctx.currentNode && isExamLesson(ctx.currentNode);
    const firstBlock = ids[0] ? getQuizBlockById(ctx, ids[0]) : null;
    const passRate = resolveQuizPassRate(firstBlock);
    const passed = didPassQuizSession(ids, getState, passRate);
    const patch = { careFeedbackMsg: ctx.careFeedbackMsg };

    if (isExam) {
        /* Exam pass is recorded when the full exam is finished (examShowResults), not per block. */
    } else if (total > 0 && passed) {
        let sessionXp = 0;
        for (const qid of ids) {
            const st = getState(qid);
            if (!st.correct) continue;
            const xpKey = ctx.currentNode ? `${ctx.currentNode.id}:${qid}` : qid;
            if (!store.userStore.settings.wasQuizXpAwarded(xpKey)) {
                store.userStore.settings.markQuizXpAwarded(xpKey);
                sessionXp += 5;
            }
        }
        if (sessionXp > 0) store.addXP(sessionXp);
        if (ctx.currentNode) {
            patch.visitedSections = new Set(ctx.visitedSections);
            patch.visitedSections.add(ctx.activeSectionIndex);
        }
    }
    if (ctx.currentNode) {
        const quizPassRecord = isExam
            ? ctx.quizPassRecord || {}
            : mergeQuizPassRecord(ctx.quizPassRecord, ctx.quizStates, ids, passRate);
        if (!isExam) patch.quizPassRecord = quizPassRecord;
        const visited = patch.visitedSections || ctx.visitedSections;
        persistLessonReadingPosition(store, {
            nodeId: ctx.currentNode.id,
            index: ctx.activeSectionIndex,
            visitedSections: visited,
            contentRaw: ctx.currentNode.content,
            quizPassRecord,
            updateIndex: false,
            isExam,
        });
    }
    if (
        !isExam &&
        ctx.currentNode &&
        total > 0 &&
        lessonContentHasCompleteQuiz(ctx.currentNode.content || '')
    ) {
        const mem = updateCareFromQuiz(store, ctx.currentNode.id, correct, total);
        if (mem && !mem.isDue && mem.interval > 0) {
            const ui = store.ui || {};
            const tpl = ui.careNextInDays || 'Next care in {days} days.';
            patch.careFeedbackMsg = String(tpl).replace(/\{days\}/g, String(mem.interval));
        } else {
            patch.careFeedbackMsg = null;
        }
    }
    return patch;
}

export function buildAnswerQuizPatch(ctx, id, isCorrect) {
    const st = getQuizState(ctx.quizStates, id);
    const isRecall = st.v2Mode === QUIZ_MODE_RECALL;
    const remembered = !!isCorrect;
    const nextStates = {
        ...ctx.quizStates,
        [id]: {
            ...st,
            started: true,
            finished: true,
            v2Answered: true,
            correct: remembered,
            v2RecallRemembered: isRecall ? remembered : undefined,
            score: remembered ? 1 : 0,
            results: [remembered],
        },
    };
    const patch = { quizStates: nextStates };
    const blockKey = findBlockSessionKeyForQuestionId(ctx.blockSessions, id);
    let quizPassRecord = ctx.quizPassRecord || {};
    const isExam = ctx.currentNode && isExamLesson(ctx.currentNode);
    if (remembered && !isExam && !blockKey) {
        quizPassRecord = { ...quizPassRecord, [id]: true };
        patch.quizPassRecord = quizPassRecord;
    }
    if (blockKey) {
        const session = ctx.blockSessions[blockKey];
        patch.blockSessions = {
            ...ctx.blockSessions,
            [blockKey]: { ...session, awaitingAdvance: true },
        };
        if (isRecall) patch.scheduleRecallAdvance = { id, blockKey };
        return patch;
    }

    if (isExam && remembered) {
        /* Defer exam pass until all sections are complete. */
    } else if (!isExam && remembered) {
        const xpKey = ctx.currentNode ? `${ctx.currentNode.id}:${id}` : id;
        if (!store.userStore.settings.wasQuizXpAwarded(xpKey)) {
            store.addXP(5);
            store.userStore.settings.markQuizXpAwarded(xpKey);
        }
        patch.visitedSections = new Set(ctx.visitedSections);
        patch.visitedSections.add(ctx.activeSectionIndex);
    }
    if (ctx.currentNode && (remembered || patch.visitedSections)) {
        persistLessonReadingPosition(store, {
            nodeId: ctx.currentNode.id,
            index: ctx.activeSectionIndex,
            visitedSections: patch.visitedSections || ctx.visitedSections,
            contentRaw: ctx.currentNode.content,
            quizPassRecord: patch.quizPassRecord || quizPassRecord,
            updateIndex: false,
            isExam,
        });
    }
    if (
        !isExam &&
        ctx.currentNode &&
        lessonContentHasCompleteQuiz(ctx.currentNode.content || '')
    ) {
        updateCareFromQuiz(store, ctx.currentNode.id, remembered ? 1 : 0, 1);
    }
    if (isRecall) patch.scheduleRecallAdvance = { id, blockKey: null };
    return patch;
}

export function evaluateExamSession(ctx, session) {
    return evaluateQuizSession(ctx, session);
}

export { getExpandedQuestionIdsForExam };

export const RECALL_ADVANCE_DELAY_MS = RECALL_ADVANCE_MS;
