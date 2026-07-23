import { useLearning } from '../hooks/useLearning.js';

/** Student section navigation footer. */
export function LessonFooter({ activeSectionIndex, tocLength, onPrev, onComplete }) {
    const { ui } = useLearning();
    const isFirstSection = activeSectionIndex === 0;
    const prevLabel = ui.previousSection || ui.navBack || 'Previous';

    return (
        <div className="arborito-lesson-mobile-footer relative z-20">
            <div className="arborito-lesson-footer-nav max-w-3xl mx-auto w-full">
                <button
                    type="button"
                    id="btn-prev-mobile"
                    className="arborito-lesson-footer-btn arborito-lesson-footer-btn--secondary arborito-lesson-footer-btn--back"
                    title={prevLabel}
                    aria-label={prevLabel}
                    disabled={isFirstSection}
                    aria-disabled={isFirstSection ? 'true' : undefined}
                    onClick={isFirstSection ? undefined : () => onPrev?.()}
                >
                    <span className="arborito-lesson-footer-btn__icon" aria-hidden="true">
                        ←
                    </span>
                    <span className="arborito-lesson-footer-btn__label">{prevLabel}</span>
                </button>
                <div
                    className="arborito-lesson-footer-progress"
                    aria-live="polite"
                    aria-label={ui.lessonProgressAria || ui.lessonProgress || 'Lesson progress'}
                >
                    <span className="arborito-lesson-footer-meta arborito-lesson-footer-meta--progress">
                        {activeSectionIndex + 1} / {tocLength}
                    </span>
                </div>
                <button
                    type="button"
                    id="btn-complete-mobile"
                    className="arborito-lesson-footer-btn arborito-lesson-footer-btn--primary arborito-lesson-footer-btn--next"
                    onClick={() => onComplete?.()}
                >
                    <span className="arborito-lesson-footer-btn__label">
                        {activeSectionIndex < tocLength - 1 ? ui.nextSection : ui.completeAndNext}
                    </span>
                    {activeSectionIndex < tocLength - 1 ? (
                        <span className="arborito-lesson-footer-btn__icon arborito-lesson-footer-btn__icon--chev" aria-hidden="true">
                            →
                        </span>
                    ) : null}
                </button>
            </div>
        </div>
    );
}
