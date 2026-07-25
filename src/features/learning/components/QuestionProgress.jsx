import { useEffect, useRef } from 'react';
import { useLearning } from '../hooks/useLearning.js';
import { getQuizState } from '../api/content-panel-quiz.js';

/** Above this, segments share full width as a dense color strip (no horizontal scroll). */
const DENSE_SEGMENT_THRESHOLD = 20;

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
    const railRef = useRef(null);
    const count = total || session?.quizIds?.length || 0;
    const ids = session?.quizIds || [];
    const idx = session ? session.currentIndex : 0;
    const dense = count > DENSE_SEGMENT_THRESHOLD;
    const progressLabel = (ui.lessonQuizSessionProgress || 'Question {current} of {total}')
        .replace('{current}', String(idx + 1))
        .replace('{total}', String(count));
    const isExam = variant === 'exam';
    const label = isExam ? ui.quizLabel || ui.lessonQuizLabel || 'Evaluation' : ui.lessonQuizLabel || 'Quiz';

    /* Keep the current segment in view if a parent ever scrolls the rail. */
    useEffect(() => {
        const rail = railRef.current;
        if (!rail || dense) return;
        const current = rail.querySelector('.arborito-question-progress__segment.is-current');
        if (!current || typeof current.scrollIntoView !== 'function') return;
        try {
            current.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
        } catch {
            /* ignore */
        }
    }, [idx, dense, count]);

    return (
        <div className={`arborito-question-progress arborito-question-progress--${variant}${dense ? ' arborito-question-progress--dense' : ''} mb-6 not-prose`}>
            <div className="arborito-eyebrow flex justify-between mb-2 gap-2">
                <span>{label}</span>
                <span className="shrink-0 tabular-nums">{progressLabel}</span>
            </div>
            <div
                ref={railRef}
                className={`arborito-question-progress__segments${dense ? ' arborito-question-progress__segments--dense' : ''}`}
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
                            {!dense && status === 'correct' ? (
                                <span className="arborito-question-progress__mark" aria-hidden="true">
                                    ✓
                                </span>
                            ) : null}
                            {!dense && status === 'wrong' ? (
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

export { DENSE_SEGMENT_THRESHOLD };
