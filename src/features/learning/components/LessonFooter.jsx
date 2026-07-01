import { useLearning } from '../hooks/useLearning.js';

/** Student section navigation footer. */
export function LessonFooter({ activeSectionIndex, tocLength, onExit, onPrev, onComplete }) {
    const { ui } = useLearning();
    const isFirstSection = activeSectionIndex === 0;
    const leftFooterLabel = isFirstSection ? ui.navBack || ui.close : ui.previousSection;
    const leftFooterAria = isFirstSection ? ui.navBack || ui.close : ui.previousSection;

    return (
        <div className="arborito-lesson-mobile-footer relative z-20">
            <div className="arborito-lesson-footer-nav max-w-3xl mx-auto w-full">
                {isFirstSection ? (
                    <button
                        type="button"
                        id="btn-exit-mobile"
                        className="arborito-lesson-footer-btn arborito-lesson-footer-btn--secondary arborito-lesson-footer-btn--back"
                        title={ui.navBack || ui.close}
                        aria-label={leftFooterAria}
                        onClick={() => onExit?.()}
                    >
                        <span className="arborito-lesson-footer-btn__icon" aria-hidden="true">
                            ←
                        </span>
                        <span className="arborito-lesson-footer-btn__label">{leftFooterLabel}</span>
                    </button>
                ) : (
                    <button
                        type="button"
                        id="btn-prev-mobile"
                        className="arborito-lesson-footer-btn arborito-lesson-footer-btn--secondary arborito-lesson-footer-btn--back"
                        aria-label={leftFooterAria}
                        onClick={() => onPrev?.()}
                    >
                        <span className="arborito-lesson-footer-btn__icon" aria-hidden="true">
                            ←
                        </span>
                        <span className="arborito-lesson-footer-btn__label">{leftFooterLabel}</span>
                    </button>
                )}
                <div
                    className="arborito-lesson-footer-progress"
                    aria-live="polite"
                    aria-label={ui.lessonProgressAria || ui.lessonProgress || 'Progreso de la lección'}
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
