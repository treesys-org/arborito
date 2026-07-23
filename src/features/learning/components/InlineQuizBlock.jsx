import { useLearning } from '../hooks/useLearning.js';
import { useEffect } from 'react';
import { formatCountLabel } from '../../../shared/lib/format-count-label.js';
import {
    getExpandedQuestionsForQuizBlock,
    makeBlockSessionKey,
} from '../api/content-toc.js';
import {
    getBlockSession,
    isQuizBlockComplete,
    isQuizBlockPassed,
    isQuizBlockPassedFromRecord,
} from '../api/content-panel-quiz.js';
import { isQuizChallengeComplete } from '../api/quiz-status.js';
import { QuestionRunner } from './QuestionRunner.jsx';
import { QuizSessionSummaryConsolidated } from './QuizChallenge.jsx';

/** Inline @quiz block anchored in section prose (student view). */
export function InlineQuizBlock({
    block,
    nodeId,
    sectionIndex,
    variant = 'quiz',
    isExam = false,
    examPlayable = true,
    blockSessions,
    quizStates,
    quizPassRecord = {},
    quizActions,
    onStartBlock,
    onAdvanceBlock,
    onBackBlock,
    onDismissBlockSession,
    onViewCertificate,
    attentionNonce = 0,
}) {
    const { ui } = useLearning();

    const blockId = block?.id || 'quiz';
    const sessionKey = makeBlockSessionKey(nodeId, sectionIndex, blockId);
    const questionBlocks =
        block?.type === 'quiz' ? getExpandedQuestionsForQuizBlock(block) : [];
    const questionCount = questionBlocks.length;
    const session = getBlockSession(blockSessions, sessionKey);
    const blockAttempted = block?.type === 'quiz' ? isQuizBlockComplete(block, quizStates) : false;
    const blockPassed = block?.type === 'quiz' ? isQuizBlockPassed(block, quizStates) : false;
    const everPassed = block?.type === 'quiz' ? isQuizBlockPassedFromRecord(block, quizPassRecord) : false;
    const isExamMode = isExam || variant === 'exam';
    const questionIds = questionBlocks.map((q) => q.id || 'quiz');
    const questionIdsKey = questionIds.join('|');
    const sessionActive = !!(session && !session.finished);
    const sessionFinished = !!(session && session.finished);
    const showDone =
        !isExamMode &&
        !sessionActive &&
        !sessionFinished &&
        ((blockAttempted && blockPassed) || (everPassed && !blockAttempted));

    useEffect(() => {
        if (!block || block.type !== 'quiz' || !questionCount) return;
        if (!isExamMode || !examPlayable || sessionActive || blockAttempted || session) return;
        onStartBlock?.(sessionKey, questionIds);
    }, [
        block,
        questionCount,
        isExamMode,
        examPlayable,
        sessionActive,
        blockAttempted,
        session,
        onStartBlock,
        sessionKey,
        questionIdsKey,
    ]);

    if (!block || block.type !== 'quiz') return null;

    if (!isQuizChallengeComplete(block)) {
        return (
            <div
                className={`arborito-inline-quiz arborito-inline-quiz--incomplete not-prose my-8 rounded-2xl border-2 border-slate-200 dark:border-slate-600 bg-slate-50/90 dark:bg-slate-900/40 px-4 py-5 text-center`}
                data-quiz-block-id={blockId}
            >
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-1">
                    {ui.quizBlockIncomplete || "This quiz isn't available"}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                    {ui.quizBlockIncompleteHint ||
                        "The author hasn't finished this questionnaire yet."}
                </p>
            </div>
        );
    }

    if (!questionCount) return null;

    const borderClass = isExamMode
        ? 'border-red-200 dark:border-red-800'
        : 'border-indigo-200 dark:border-indigo-800';

    if (isExamMode && !examPlayable) {
        return (
            <div
                className={`arborito-inline-quiz arborito-inline-quiz--exam-locked not-prose my-8 rounded-2xl border-2 ${borderClass} bg-red-50/60 dark:bg-red-950/20 px-4 py-5 text-center`}
                data-quiz-block-id={blockId}
            >
                <span className="text-2xl mb-2 block" aria-hidden="true">
                    📝
                </span>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    {block.core_concept || ui.lessonQuizLabel || 'Quiz'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                    {ui.examQuizAwaitStart ||
                        'Tap «Start exam» below to begin the questionnaire.'}
                </p>
            </div>
        );
    }

    const correctCount = questionBlocks.filter(
        (q) => quizStates[q.id || 'quiz']?.correct
    ).length;

    if (showDone) {
        const restingAfterPass = everPassed && !blockAttempted;
        return (
            <div
                className="arborito-inline-quiz arborito-inline-quiz--active not-prose my-8"
                data-quiz-block-id={blockId}
                data-attention-nonce={attentionNonce}
            >
                <div
                    className={`arborito-question-runner arborito-question-runner--${variant} arborito-question-runner--live not-prose`}
                >
                    <QuizSessionSummaryConsolidated
                        variant={variant}
                        questionBlocks={questionBlocks}
                        quizStates={quizStates}
                        forcePass={restingAfterPass}
                        footerAction="practice"
                        onRetry={() => onStartBlock?.(sessionKey, questionIds, { retry: true })}
                    />
                </div>
            </div>
        );
    }

    if (blockAttempted && !blockPassed && !sessionActive && !sessionFinished && !isExamMode) {
        return (
            <div
                className="arborito-inline-quiz arborito-inline-quiz--active not-prose my-8"
                data-quiz-block-id={blockId}
                data-attention-nonce={attentionNonce}
            >
                <div
                    className={`arborito-question-runner arborito-question-runner--${variant} arborito-question-runner--live not-prose`}
                >
                    <QuizSessionSummaryConsolidated
                        variant={variant}
                        questionBlocks={questionBlocks}
                        quizStates={quizStates}
                        footerAction="retry"
                        onRetry={() => onStartBlock?.(sessionKey, questionIds, { retry: true })}
                    />
                </div>
            </div>
        );
    }

    if (isExamMode && !sessionActive && blockAttempted) {
        return (
            <div
                className={`arborito-inline-quiz arborito-inline-quiz--exam-section not-prose my-6 rounded-xl border ${borderClass} bg-slate-50 dark:bg-slate-800/50 px-4 py-3`}
                data-quiz-block-id={blockId}
            >
                <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                        {block.core_concept || ui.lessonQuizLabel || 'Quiz'}{' '}
                        <span className="tabular-nums">
                            {correctCount}/{questionCount}
                        </span>
                    </span>
                    <span
                        className={`font-bold ${correctCount === questionCount ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}
                        aria-hidden="true"
                    >
                        {correctCount === questionCount ? '✓' : '✗'}
                    </span>
                </div>
            </div>
        );
    }

    if (sessionActive || sessionFinished) {
        return (
            <div
                className="arborito-inline-quiz arborito-inline-quiz--active not-prose my-8"
                data-quiz-block-id={blockId}
                data-attention-nonce={attentionNonce}
            >
                <QuestionRunner
                    variant={variant}
                    session={session}
                    questionBlocks={questionBlocks}
                    quizStates={quizStates}
                    quizActions={quizActions}
                    onViewCertificate={onViewCertificate}
                    isExam={isExamMode}
                    onBack={() => onBackBlock?.(sessionKey)}
                    onNext={() => onAdvanceBlock?.(sessionKey)}
                    onDismissSummary={() => onDismissBlockSession?.(sessionKey)}
                    onRetrySession={() =>
                        onStartBlock?.(sessionKey, questionIds, { retry: true })
                    }
                />
            </div>
        );
    }

    if (!blockAttempted) {
        if (isExamMode) {
            return (
                <div
                    className={`arborito-inline-quiz arborito-inline-quiz--exam-loading not-prose my-8 rounded-3xl border-2 ${borderClass} bg-white dark:bg-slate-800 p-6 md:p-8 text-center`}
                    data-quiz-block-id={blockId}
                    aria-busy="true"
                >
                    <span className="text-2xl mb-2 block" aria-hidden="true">
                        📝
                    </span>
                    <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                        {ui.examSectionQuizLoading || ui.lessonQuizLabel || 'Quiz'}
                    </p>
                </div>
            );
        }
        const countLbl = formatCountLabel(
            questionCount,
            ui.quizBlockQuestionCountOne || '1 question',
            ui.quizBlockQuestionCount || '{count} questions'
        );
        const startLbl = everPassed
            ? ui.quizBlockPracticeAgain || 'Practice again'
            : ui.quizBlockStart || ui.quizStart || 'Start';
        return (
            <div
                className={`arborito-inline-quiz arborito-inline-quiz--idle not-prose my-8 rounded-3xl border-2 ${borderClass} bg-white dark:bg-slate-800 p-6 md:p-8 text-center`}
                data-quiz-block-id={blockId}
                data-attention-nonce={attentionNonce}
            >
                <span className="text-2xl mb-2 block" aria-hidden="true">
                    {everPassed ? '✓' : '🎯'}
                </span>
                <h3 className="text-lg font-black text-slate-800 dark:text-white mb-1">
                    {block.core_concept || ui.lessonQuizLabel || 'Quiz'}
                </h3>
                {everPassed ? (
                    <p className="text-sm text-emerald-700 dark:text-emerald-300 mb-3 font-semibold">
                        {ui.quizBlockComplete || 'Quiz complete'}{' '}
                        <span className="tabular-nums">
                            {questionCount}/{questionCount}
                        </span>
                    </p>
                ) : null}
                <p className="text-slate-500 dark:text-slate-400 mb-5 text-sm">{countLbl}</p>
                <button
                    type="button"
                    className="btn-quiz-block-start w-full md:w-auto px-8 py-3.5 font-bold rounded-xl shadow-lg arborito-cta-indigo"
                    onClick={() =>
                        onStartBlock?.(sessionKey, questionIds, everPassed ? { retry: true } : undefined)
                    }
                >
                    {startLbl}
                </button>
            </div>
        );
    }

    return null;
}
