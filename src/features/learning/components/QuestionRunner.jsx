import { useLearning } from '../hooks/useLearning.js';
import { getQuizState } from '../api/content-panel-quiz.js';
import { QuestionProgress } from './QuestionProgress.jsx';
import { QuestionFooter } from './QuestionFooter.jsx';
import { QuizChallenge, QuizSessionSummary } from './QuizChallenge.jsx';

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
            <div className={`arborito-question-runner arborito-question-runner--${variant} not-prose`}>
                <QuizSessionSummary
                    quizzes={questionBlocks}
                    quizStates={quizStates}
                    isExam={isExam}
                    quizSession={session}
                    onViewCertificate={onViewCertificate}
                    onRetryExam={onRetrySession}
                    onRetry={onRetrySession}
                    onDismiss={onDismissSummary}
                />
            </div>
        );
    }

    const activeId = session.quizIds[session.currentIndex];
    const current = questionBlocks.find((q) => (q.id || 'quiz') === activeId);
    if (!current) return null;

    const canGoBack = session.currentIndex > 0;
    const activeState = getQuizState(quizStates, activeId);
    const answeredCorrect = !!activeState?.correct;
    const canGoNext = !!session.awaitingAdvance;
    const isLast = session.currentIndex >= session.quizIds.length - 1;
    const retryLastWrong =
        !isExam && canGoNext && isLast && activeState?.v2Answered && !answeredCorrect;
    const reviewOnly = !!(activeState?.finished && activeState?.v2Answered);
    const nextLabel = retryLastWrong
        ? ui.quizRetry || 'Retry'
        : isExam && canGoNext && !answeredCorrect
          ? ui.examContinue || ui.quizNextQuestion || 'Continue'
          : isLast
            ? isExam
                ? ui.examFinish || ui.lessonQuizSessionFinish || 'See results'
                : ui.lessonQuizSessionFinish || 'See results'
            : isExam
              ? ui.examNextQuestion || ui.quizNextQuestion || 'Next'
              : ui.quizNextQuestion || ui.lessonQuizSessionNext || 'Next';

    return (
        <div className={`arborito-question-runner arborito-question-runner--${variant} not-prose`}>
            <QuestionProgress
                session={session}
                total={session.quizIds.length}
                variant={variant}
                quizStates={quizStates}
            />
            <QuizChallenge
                block={current}
                state={getQuizState(quizStates, activeId)}
                quizSession={session}
                actions={{
                    ...quizActions,
                    advanceQuizSession: onNext,
                }}
                variant={variant}
            />
            <QuestionFooter
                variant={variant}
                currentIndex={session.currentIndex}
                total={session.quizIds.length}
                canGoBack={canGoBack}
                canGoNext={canGoNext}
                nextLabel={nextLabel}
                onBack={onBack}
                onNext={retryLastWrong ? () => quizActions?.startQuiz?.(activeId) : onNext}
                embedded
                reviewOnly={reviewOnly}
            />
        </div>
    );
}
