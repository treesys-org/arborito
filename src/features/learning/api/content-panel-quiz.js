import { getArboritoStore as store } from '../../../core/store-singleton.js';
import { parseContent } from './parser.js';
import { parseArboritoFile } from '../../editor/api/editor-engine.js';
import { lessonContentHasCompleteQuiz } from './quiz-status.js';
import { isExamLesson } from './exam-context.js';
import { getQuizBlocksForSection } from './content-toc.js';
import { updateCareFromQuiz } from '../../garden-progress/api/care-schedule.js';
import {
    pickStudyQuizMode,
    pickNextQuizMode,
    normalizeChallenge,
    QUIZ_MODE_STEPS,
    QUIZ_MODE_RECALL
} from './quiz-schema.js';
import { RECALL_ADVANCE_MS } from './quiz-player.js';

/** Quiz lifecycle helpers (from legacy quiz-mixin). */

export function createDefaultQuizState() {
    return {
        started: false,
        finished: false,
        currentIdx: 0,
        score: 0,
        results: []
    };
}

export function getQuizState(quizStates, id) {
    return quizStates[id] || createDefaultQuizState();
}

export function hasActiveQuizInProgress(ctx) {
    if (ctx.isLessonConstructEdit?.()) return false;
    const states = Object.values(ctx.quizStates || {});
    if (states.some((s) => s.started && !s.finished)) return true;
    const session = ctx.quizSession;
    if (!session || session.finished) return false;
    if (Array.isArray(session.quizIds) && session.quizIds.length > 1) {
        return session.quizIds.some((id) => {
            const st = getQuizState(ctx.quizStates, id);
            return st.started && !st.finished;
        });
    }
    return false;
}

export function quizSessionKey(ctx) {
    return `${ctx.currentNode?.id ?? ''}:${ctx.activeSectionIndex}`;
}

export function syncQuizSessionForSection(ctx, allBlocks, toc) {
    const key = quizSessionKey(ctx);
    let session = ctx.quizSession;
    if (session && session.key !== key) {
        session = null;
    }
    const quizzes = getQuizBlocksForSection(allBlocks, toc, ctx.activeSectionIndex);
    if (quizzes.length <= 1) return { quizzes, session };
    const ids = quizzes.map((b) => b.id || 'quiz');
    if (
        session &&
        session.key === key &&
        session.quizIds.length === ids.length &&
        session.quizIds.every((id, i) => id === ids[i])
    ) {
        return { quizzes, session };
    }
    session = { key, quizIds: ids, currentIndex: 0, awaitingAdvance: false, finished: false };
    const firstId = ids[0];
    if (firstId && !getQuizState(ctx.quizStates, firstId).started) {
        return { quizzes, session, autoStartId: firstId };
    }
    return { quizzes, session };
}

export function getActiveSessionQuizId(ctx) {
    const s = ctx.quizSession;
    if (!s || s.key !== quizSessionKey(ctx) || s.finished) return null;
    return s.quizIds[s.currentIndex] || null;
}

export function getQuizSessionForRender(ctx) {
    const s = ctx.quizSession;
    if (!s || s.key !== quizSessionKey(ctx)) return null;
    return s;
}

export function getQuizBlockById(ctx, id) {
    if (!ctx.currentNode) return null;
    const contentForParse = ctx.getContentForTocParse?.() || ctx.currentNode.content || '';
    const parsed = parseArboritoFile(contentForParse);
    const blocks = parseContent(parsed.body || contentForParse);
    return blocks.find((b) => b.type === 'quiz' && (b.id || 'quiz') === id) || null;
}

function shuffleStepsForQuiz(steps, seed) {
    const arr = [...steps];
    let h = 0;
    for (let i = 0; i < String(seed).length; i++) h = (h * 31 + String(seed).charCodeAt(i)) | 0;
    for (let i = arr.length - 1; i > 0; i--) {
        h = (h * 1103515245 + 12345) | 0;
        const j = Math.abs(h) % (i + 1);
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

export function buildStartQuizState(id, block, prev) {
    const ch = block ? normalizeChallenge(block) : null;
    const isRetry = !!(prev && (prev.finished || prev.started));
    const mode = ch
        ? isRetry && prev.v2Mode
            ? pickNextQuizMode(ch, id, prev.v2Mode)
            : pickStudyQuizMode(ch, id)
        : 'multiple';
    const stepsOrder =
        mode === QUIZ_MODE_STEPS && ch && ch.steps.length >= 2
            ? shuffleStepsForQuiz(ch.steps, id)
            : null;
    return {
        started: true,
        finished: false,
        currentIdx: 0,
        score: 0,
        results: [],
        v2Answered: false,
        correct: null,
        v2Mode: mode,
        v2RecallRevealed: false,
        chipOrder: [],
        v2StepsOrder: stepsOrder
    };
}

export function evaluateQuizSession(ctx, session) {
    const ids = session.quizIds || [];
    const correct = ids.filter((id) => !!getQuizState(ctx.quizStates, id).correct).length;
    const total = ids.length;
    const rate = total > 0 ? correct / total : 0;
    const isExam = ctx.currentNode && isExamLesson(ctx.currentNode);
    const patch = { careFeedbackMsg: ctx.careFeedbackMsg };

    if (isExam) {
        if (rate >= 0.8) ctx.persistExamPass?.();
    } else if (total > 0) {
        if (correct > 0) store.addXP(5 * correct);
        if (correct === total && ctx.currentNode) {
            patch.visitedSections = new Set(ctx.visitedSections);
            patch.visitedSections.add(ctx.activeSectionIndex);
            store.recordRecentLesson(
                ctx.currentNode.id,
                ctx.activeSectionIndex,
                patch.visitedSections
            );
        }
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
            results: [remembered]
        }
    };
    const patch = { quizStates: nextStates };
    const session = ctx.quizSession;
    const inSession =
        session &&
        session.key === quizSessionKey(ctx) &&
        session.quizIds.length > 1 &&
        session.quizIds.includes(id);

    if (inSession) {
        patch.quizSession = { ...session, awaitingAdvance: true };
        if (isRecall) patch.scheduleRecallAdvance = id;
        return patch;
    }

    const isExam = ctx.currentNode && isExamLesson(ctx.currentNode);
    if (isExam && remembered) {
        ctx.persistExamPass?.();
    } else if (!isExam && remembered) {
        store.addXP(5);
        patch.visitedSections = new Set(ctx.visitedSections);
        patch.visitedSections.add(ctx.activeSectionIndex);
        if (ctx.currentNode) {
            store.recordRecentLesson(
                ctx.currentNode.id,
                ctx.activeSectionIndex,
                patch.visitedSections
            );
        }
    }
    if (
        !isExam &&
        ctx.currentNode &&
        lessonContentHasCompleteQuiz(ctx.currentNode.content || '')
    ) {
        updateCareFromQuiz(store, ctx.currentNode.id, remembered ? 1 : 0, 1);
    }
    if (isRecall) patch.scheduleRecallAdvance = id;
    return patch;
}

export const RECALL_ADVANCE_DELAY_MS = RECALL_ADVANCE_MS;
