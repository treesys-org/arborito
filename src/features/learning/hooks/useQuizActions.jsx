import { useCallback } from 'react';
import {
    validateChipsOrder,
    validateClozeAnswers,
    validateStepsOrder,
} from '../api/quiz-player.js';
import { normalizeChallenge, QUIZ_MODE_RECALL } from '../api/quiz-schema.js';
import { getQuizState, buildAnswerQuizPatch } from '../api/content-panel-quiz.js';

/** Quiz interaction handlers for React QuizChallenge (no DOM bindings). */
export function useQuizActions({ panel, patchPanel, startQuiz, answerQuiz, advanceQuizSession, isLessonConstructEdit, persistExamPass }) {
    const patchQuizState = useCallback(
        (id, partial) => {
            const st = getQuizState(panel.quizStates, id);
            patchPanel({ quizStates: { ...panel.quizStates, [id]: { ...st, ...partial } } });
        },
        [panel.quizStates, patchPanel]
    );

    const checkCloze = useCallback(
        (blockId, block, inputs) => {
            const c = normalizeChallenge(block);
            const ok = validateClozeAnswers(c, inputs);
            const patch = buildAnswerQuizPatch(
                { ...panel, isLessonConstructEdit, persistExamPass },
                blockId,
                ok
            );
            patchPanel(patch);
        },
        [panel, patchPanel, isLessonConstructEdit, persistExamPass]
    );

    const checkChips = useCallback(
        (blockId, block, picked) => {
            const c = normalizeChallenge(block);
            const ok = validateChipsOrder(c, picked);
            const patch = buildAnswerQuizPatch(
                { ...panel, isLessonConstructEdit, persistExamPass },
                blockId,
                ok
            );
            patchPanel(patch);
        },
        [panel, patchPanel, isLessonConstructEdit, persistExamPass]
    );

    const checkSteps = useCallback(
        (blockId, block, order) => {
            const c = normalizeChallenge(block);
            const ok = validateStepsOrder(c, order);
            const patch = buildAnswerQuizPatch(
                { ...panel, isLessonConstructEdit, persistExamPass },
                blockId,
                ok
            );
            patchPanel(patch);
        },
        [panel, patchPanel, isLessonConstructEdit, persistExamPass]
    );

    const revealRecall = useCallback(
        (blockId) => {
            patchQuizState(blockId, { v2RecallRevealed: true });
        },
        [patchQuizState]
    );

    const pickChip = useCallback(
        (blockId, word) => {
            const st = getQuizState(panel.quizStates, blockId);
            patchQuizState(blockId, { chipOrder: [...(st.chipOrder || []), word] });
        },
        [panel.quizStates, patchQuizState]
    );

    const unpickChip = useCallback(
        (blockId, pickIdx) => {
            const st = getQuizState(panel.quizStates, blockId);
            const next = [...(st.chipOrder || [])];
            next.splice(pickIdx, 1);
            patchQuizState(blockId, { chipOrder: next });
        },
        [panel.quizStates, patchQuizState]
    );

    const pickStep = useCallback(
        (blockId, step, pos, currentOrder) => {
            const st = getQuizState(panel.quizStates, blockId);
            const order = currentOrder || st.v2StepsOrder || [];
            const next = order.filter((s, i) => i !== pos);
            next.push(step);
            patchQuizState(blockId, { v2StepsOrder: next });
        },
        [panel.quizStates, patchQuizState]
    );

    const answerRecall = useCallback(
        (blockId, remembered) => {
            answerQuiz(blockId, remembered);
        },
        [answerQuiz]
    );

    return {
        startQuiz,
        answerQuiz,
        advanceQuizSession,
        checkCloze,
        checkChips,
        checkSteps,
        revealRecall,
        pickChip,
        unpickChip,
        pickStep,
        answerRecall,
    };
}
