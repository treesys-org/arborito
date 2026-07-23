import { useCallback } from 'react';
import {
    validateChipsOrder,
    validateClozeAnswers,
    validateStepsOrder,
} from '../api/quiz-player.js';
import { normalizeChallenge, QUIZ_MODE_RECALL } from '../api/quiz-schema.js';
import { getQuizState } from '../api/content-panel-quiz.js';

/** Quiz interaction handlers for React QuizChallenge (no DOM bindings). */
export function useQuizActions({ panel, patchPanel, startQuiz, answerQuiz, isLessonConstructEdit, persistExamPass }) {
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
            answerQuiz(blockId, ok);
        },
        [answerQuiz]
    );

    const checkChips = useCallback(
        (blockId, block, picked) => {
            const c = normalizeChallenge(block);
            const ok = validateChipsOrder(c, picked);
            answerQuiz(blockId, ok);
        },
        [answerQuiz]
    );

    const checkSteps = useCallback(
        (blockId, block, order) => {
            const c = normalizeChallenge(block);
            const ok = validateStepsOrder(c, order);
            answerQuiz(blockId, ok);
        },
        [answerQuiz]
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
        (blockId, step) => {
            const st = getQuizState(panel.quizStates, blockId);
            patchQuizState(blockId, { v2StepsOrder: [...(st.v2StepsOrder || []), step] });
        },
        [panel.quizStates, patchQuizState]
    );

    const unpickStep = useCallback(
        (blockId, pickIdx) => {
            const st = getQuizState(panel.quizStates, blockId);
            const next = [...(st.v2StepsOrder || [])];
            next.splice(pickIdx, 1);
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
        checkCloze,
        checkChips,
        checkSteps,
        revealRecall,
        pickChip,
        unpickChip,
        pickStep,
        unpickStep,
        answerRecall,
    };
}
