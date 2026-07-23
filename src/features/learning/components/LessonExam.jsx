import { useLearning } from '../hooks/useLearning.js';

/** Exam intro footer, start evaluation CTA. */
export function LessonExam({ onStart, visible }) {
    const { ui } = useLearning();

    if (!visible) return null;

    return (
        <div className="arborito-lesson-mobile-footer relative z-20">
            <button
                type="button"
                id="btn-start-exam-mobile"
                className="w-full justify-center text-center px-4 py-3.5 rounded-xl font-bold flex items-center gap-2 transition-all arborito-cta-red shadow-lg shadow-red-500/25 active:scale-[0.98]"
                onClick={onStart}
            >
                <span>
                    {ui.examStartExam || ui.examStartEvaluation || `${ui.quizStart} ${ui.quizLabel}`}
                </span>
            </button>
        </div>
    );
}
