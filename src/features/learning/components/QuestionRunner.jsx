import { useLayoutEffect, useRef } from 'react';
import { useLearning } from '../hooks/useLearning.js';
import { getQuizState } from '../api/content-panel-quiz.js';
import { QuestionProgress } from './QuestionProgress.jsx';
import { QuestionFooter } from './QuestionFooter.jsx';
import { QuizChallenge, QuizSessionSummaryConsolidated } from './QuizChallenge.jsx';

/** Shared linear question runner (exam + quiz), nav inside the card. */
export function QuestionRunner({
    variant = 'quiz',
    session,
    questionBlocks,
    quizStates,
    quizActions,
    onViewCertificate,
    isExam = false,
    onBack,
    onNext,
    onDismissSummary,
    onRetrySession,
}) {
    const { ui } = useLearning();
    const stageRef = useRef(null);
    const liveSession = session && !session.finished ? session : null;
    const activeId = liveSession ? liveSession.quizIds[liveSession.currentIndex] : null;
    const activeState = activeId ? getQuizState(quizStates, activeId) : null;
    const reviewOnly = !!(activeState?.finished && activeState?.v2Answered);
    const stagePhaseKey = activeId ? `${activeId}:${reviewOnly ? 'review' : 'ask'}` : null;

    useLayoutEffect(() => {
        if (!stagePhaseKey) return;
        const card = stageRef.current?.firstElementChild;
        if (card) card.scrollTop = 0;
    }, [stagePhaseKey]);

    if (!session) return null;

    if (session.finished) {
        if (isExam) {
            return (
                <div className={`arborito-question-runner arborito-question-runner--${variant} not-prose`}>
                    <p className="text-sm text-slate-600 dark:text-slate-300 text-center py-2">
                        {ui.examSectionQuizDone || 'Section quiz completed'}
                    </p>
                </div>
            );
        }
        return (
            <div
                className={`arborito-question-runner arborito-question-runner--${variant} arborito-question-runner--live not-prose`}
            >
                <QuizSessionSummaryConsolidated
                    variant={variant}
                    questionBlocks={questionBlocks}
                    quizStates={quizStates}
                    session={session}
                    isExam={isExam}
                    footerAction="continue"
                    onRetry={onRetrySession}
                    onDismiss={onDismissSummary}
                />
            </div>
        );
    }

    const current = questionBlocks.find((q) => (q.id || 'quiz') === activeId);
    if (!current) return null;

    const canGoBack = session.currentIndex > 0;
    const answeredCorrect = !!activeState?.correct;
    const canGoNext = !!session.awaitingAdvance;
    const isLast = session.currentIndex >= session.quizIds.length - 1;

    const nextLabel = isLast
        ? isExam
            ? ui.examFinish || ui.lessonQuizSessionFinish || 'See results'
            : ui.lessonQuizSessionFinish || 'See results'
        : isExam
          ? canGoNext && !answeredCorrect
              ? ui.examContinue || ui.quizNextQuestion || 'Continue'
              : ui.examNextQuestion || ui.quizNextQuestion || 'Next'
          : ui.quizNextQuestion || ui.lessonQuizSessionNext || 'Next';

    return (
        <div
            className={`arborito-question-runner arborito-question-runner--${variant} arborito-question-runner--live not-prose`}
        >
            <QuestionProgress
                session={session}
                total={session.quizIds.length}
                variant={variant}
                quizStates={quizStates}
            />
            <div className="arborito-question-runner__card">
                <div className="arborito-question-runner__stage" ref={stageRef}>
                    <QuizChallenge
                        block={current}
                        state={getQuizState(quizStates, activeId)}
                        quizSession={session}
                        actions={quizActions}
                        variant={variant}
                    />
                </div>
                <QuestionFooter
                    variant={variant}
                    currentIndex={session.currentIndex}
                    total={session.quizIds.length}
                    canGoBack={canGoBack}
                    canGoNext={canGoNext}
                    nextLabel={nextLabel}
                    onBack={onBack}
                    onNext={onNext}
                    embedded
                    reviewOnly={reviewOnly}
                    hideProgress
                />
            </div>
        </div>
    );
}
