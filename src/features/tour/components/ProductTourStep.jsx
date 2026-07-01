import { richTextWithEmojis } from '../../../shared/lib/emoji-display.js';
import { LocaleRichText } from '../../../shared/ui/LocaleRichText.jsx';
import { ProductTourMascot } from './ProductTourMascot.jsx';

export function ProductTourStep({
    tipRef,
    nextBtnRef,
    tipPos,
    step,
    mascotKey,
    ui,
    index,
    total,
    single,
    first,
    last,
    sourcesPickerOnlyTour,
    onSkip,
    onPrev,
    onNext,
}) {
    return (
        <div
            ref={tipRef}
            className="arborito-tour-tooltip"
            style={{ top: `${tipPos.top}px`, left: `${tipPos.left}px` }}
        >
            <div className="arborito-tour-tooltip__head">
                <ProductTourMascot mascotKey={mascotKey} />
                <div className="arborito-tour-tooltip__titles">
                    <h2
                        className="arborito-tour-tooltip__title"
                        id="arborito-tour-title"
                    >
                        <LocaleRichText html={richTextWithEmojis((step && step.title) || '')} />
                    </h2>
                </div>
            </div>
            <div className="arborito-tour-tooltip__body" id="arborito-tour-body" aria-live="polite">
                <LocaleRichText html={richTextWithEmojis((step && step.body) || '')} />
            </div>
            {total > 1 && (
                <p className="arborito-tour-tooltip__progress" id="arborito-tour-progress" aria-hidden="true">
                    {(ui.tourStepIndicator || 'Step {n} of {total}')
                        .replace('{n}', String(index + 1))
                        .replace('{total}', String(total))}
                </p>
            )}
            <div className="arborito-tour-tooltip__actions">
                {!single && (
                    <button
                        type="button"
                        className="arborito-tour-btn arborito-tour-btn--ghost"
                        onClick={onSkip}
                    >
                        {ui.tourSkip || 'Skip'}
                    </button>
                )}
                <div
                    className={`arborito-tour-tooltip__nav${single || first ? ' arborito-tour-tooltip__nav--solo' : ''}`}
                >
                    {!first && !single && (
                        <button
                            type="button"
                            className="arborito-tour-btn arborito-tour-btn--ghost"
                            onClick={onPrev}
                        >
                            {ui.tourPrev || 'Back'}
                        </button>
                    )}
                    <button
                        ref={nextBtnRef}
                        type="button"
                        className={`arborito-tour-btn js-tour-next${
                            last ? ' arborito-tour-btn--done' : ' arborito-tour-btn--primary'
                        }${single ? ' arborito-tour-btn--solo' : ''}`}
                        onClick={onNext}
                    >
                        {last ? ui.tourDone || 'Done' : ui.tourNext || 'Next'}
                    </button>
                </div>
            </div>
        </div>
    );
}
