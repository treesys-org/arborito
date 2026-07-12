import { useLearning } from '../hooks/useLearning.js';

/** Compact in-card nav for quiz sessions (distinct from lesson section footer). */
export function QuestionFooter({
    variant = 'quiz',
    currentIndex,
    total,
    canGoBack,
    canGoNext,
    nextLabel,
    onBack,
    onNext,
    embedded = false,
    reviewOnly = false,
}) {
    const { ui } = useLearning();
    const isExam = variant === 'exam';
    const progressLabel = (ui.lessonQuizSessionProgress || 'Question {current} of {total}')
        .replace('{current}', String(currentIndex + 1))
        .replace('{total}', String(total));
    const backLbl = isExam
        ? ui.examPrevQuestion || ui.previousSection || 'Back'
        : ui.quizPrevQuestion || ui.previousSection || 'Back';
    const nextLbl =
        nextLabel ||
        (reviewOnly && currentIndex >= total - 1
            ? ui.lessonQuizSessionFinish || 'See results'
            : currentIndex >= total - 1
            ? isExam
                ? ui.examFinish || ui.lessonQuizSessionFinish || 'See results'
                : ui.lessonQuizSessionFinish || 'See results'
            : isExam
              ? ui.examNextQuestion || ui.quizNextQuestion || 'Next'
              : ui.quizNextQuestion || ui.lessonQuizSessionNext || 'Next');

    const shellClass = embedded
        ? `arborito-quiz-session-nav arborito-quiz-session-nav--${variant} arborito-quiz-session-nav--embedded`
        : `arborito-quiz-session-nav arborito-quiz-session-nav--${variant}`;

    return (
        <nav className={shellClass} aria-label={ui.lessonQuizLabel || 'Quiz navigation'}>
            <button
                type="button"
                className="arborito-quiz-session-nav__btn arborito-quiz-session-nav__btn--back"
                disabled={!canGoBack}
                onClick={() => onBack?.()}
                aria-label={backLbl}
            >
                <span className="arborito-quiz-session-nav__icon" aria-hidden="true">
                    ‹
                </span>
                <span className="arborito-quiz-session-nav__label">{backLbl}</span>
            </button>
            <span className="arborito-quiz-session-nav__progress" aria-live="polite">
                {progressLabel}
            </span>
            <button
                type="button"
                className={`arborito-quiz-session-nav__btn arborito-quiz-session-nav__btn--next ${isExam ? 'arborito-quiz-session-nav__btn--exam' : ''}`}
                disabled={!canGoNext}
                onClick={() => onNext?.()}
            >
                <span className="arborito-quiz-session-nav__label">{nextLbl}</span>
                <span className="arborito-quiz-session-nav__icon" aria-hidden="true">
                    ›
                </span>
            </button>
        </nav>
    );
}
