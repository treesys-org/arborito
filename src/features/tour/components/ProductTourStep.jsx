import { richTextWithEmojis } from '../../../shared/lib/emoji-display.js';
import { LocaleRichText } from '../../../shared/ui/LocaleRichText.jsx';
import { ProductTourMascot } from './ProductTourMascot.jsx';

const TOUR_BTN_GHOST =
    'arborito-btn-ghost arborito-cta-slate shrink-0 py-2 px-4 rounded-xl text-sm font-semibold min-h-[44px]';
const TOUR_BTN_PRIMARY =
    'js-tour-next shrink-0 py-2 px-4 rounded-xl text-sm font-bold min-h-[44px] active:scale-95 transition-transform';

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
            <div
                className={`arborito-tour-tooltip__actions${single ? ' arborito-tour-tooltip__actions--single' : ''}`}
            >
                {!single && (
                    <button type="button" className={`js-tour-skip ${TOUR_BTN_GHOST}`} onClick={onSkip}>
                        {ui.tourSkip || 'Skip'}
                    </button>
                )}
                {!first && !single && (
                    <button type="button" className={TOUR_BTN_GHOST} onClick={onPrev}>
                        {ui.tourPrev || 'Back'}
                    </button>
                )}
                <button
                    ref={nextBtnRef}
                    type="button"
                    className={`${TOUR_BTN_PRIMARY}${last ? ' arborito-cta-emerald' : ' arborito-cta-sky'}`}
                    onClick={onNext}
                >
                    {last ? ui.tourDone || 'Done' : ui.tourNext || 'Next'}
                </button>
            </div>
        </div>
    );
}
