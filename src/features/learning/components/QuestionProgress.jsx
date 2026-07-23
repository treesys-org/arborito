import { useLearning } from '../hooks/useLearning.js';
import { getQuizState } from '../api/content-panel-quiz.js';

function getSegmentStatus(st, index, session) {
    const answered = !!(st?.v2Answered || st?.finished);
    if (answered) return st.correct ? 'correct' : 'wrong';
    const isCurrent = session && !session.finished && index === session.currentIndex;
    if (isCurrent) return 'current';
    return 'pending';
}

/** Segmented session progress (one cell per question; green ✓ / red ✗ when answered). */
export function QuestionProgress({ session, total, variant = 'quiz', quizStates = {} }) {
    const { ui } = useLearning();
    const count = total || session?.quizIds?.length || 0;
    const ids = session?.quizIds || [];
    const idx = session ? session.currentIndex : 0;
    const progressLabel = (ui.lessonQuizSessionProgress || 'Question {current} of {total}')
        .replace('{current}', String(idx + 1))
        .replace('{total}', String(count));
    const isExam = variant === 'exam';
    const label = isExam ? ui.quizLabel || ui.lessonQuizLabel || 'Evaluation' : ui.lessonQuizLabel || 'Quiz';

    return (
        <div className={`arborito-question-progress arborito-question-progress--${variant} mb-6 not-prose`}>
            <div className="arborito-eyebrow flex justify-between mb-2">
                <span>{label}</span>
                <span>{progressLabel}</span>
            </div>
            <div
                className="arborito-question-progress__segments"
                role="list"
                aria-label={progressLabel}
            >
                {ids.map((id, i) => {
                    const st = getQuizState(quizStates, id);
                    const status = getSegmentStatus(st, i, session);
                    const isCurrent = status === 'current';
                    const title =
                        status === 'correct'
                            ? ui.quizCorrect || 'Correct'
                            : status === 'wrong'
                              ? ui.quizIncorrect || 'Incorrect'
                              : isCurrent
                                ? progressLabel
                                : `${i + 1} / ${count}`;
                    return (
                        <div
                            key={id}
                            role="listitem"
                            className={`arborito-question-progress__segment arborito-question-progress__segment--${status}${isCurrent ? ' is-current' : ''}`}
                            title={title}
                            aria-current={isCurrent ? 'step' : undefined}
                            aria-label={title}
                        >
                            {status === 'correct' ? (
                                <span className="arborito-question-progress__mark" aria-hidden="true">
                                    ✓
                                </span>
                            ) : status === 'wrong' ? (
                                <span className="arborito-question-progress__mark" aria-hidden="true">
                                    ✗
                                </span>
                            ) : null}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
