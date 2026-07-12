import { useProductTour } from '../hooks/useProductTour.jsx';
import { ProductTourStep } from './ProductTourStep.jsx';

export function ProductTour({ embed }) {
    const {
        active,
        stepping,
        layout,
        tipRef,
        nextBtnRef,
        step,
        mascotKey,
        ui,
        index,
        total,
        single,
        first,
        last,
        ariaLabel,
        sourcesPickerOnlyTour,
        finish,
        prev,
        next,
    } = useProductTour();

    const { ring, shades, tip: tipPos } = layout;

    return (
        <div
            className={`arborito-product-tour${stepping ? ' arborito-tour--stepping' : ''}`}
            data-arborito-panel="product-tour"
            data-embed={embed ? '1' : undefined}
            hidden={!active || undefined}
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
        >
            <div
                className="arborito-tour-shade arborito-tour-shade--top"
                aria-hidden="true"
                style={{ top: 0, left: 0, width: '100%', height: `${shades.top.height}px` }}
            />
            <div
                className="arborito-tour-shade arborito-tour-shade--left"
                aria-hidden="true"
                style={{
                    top: `${shades.left.top}px`,
                    left: `${shades.left.left}px`,
                    width: `${shades.left.width}px`,
                    height: `${shades.left.height}px`,
                }}
            />
            <div
                className="arborito-tour-shade arborito-tour-shade--right"
                aria-hidden="true"
                style={{
                    top: `${shades.right.top}px`,
                    left: `${shades.right.left}px`,
                    width: `${shades.right.width}px`,
                    height: `${shades.right.height}px`,
                }}
            />
            <div
                className="arborito-tour-shade arborito-tour-shade--bottom"
                aria-hidden="true"
                style={{
                    top: `${shades.bottom.top}px`,
                    left: 0,
                    width: '100%',
                    height: `${shades.bottom.height}px`,
                }}
            />
            <div
                className="arborito-tour-ring"
                aria-hidden="true"
                style={{
                    top: `${ring.top}px`,
                    left: `${ring.left}px`,
                    width: `${ring.width}px`,
                    height: `${ring.height}px`,
                }}
            />
            <ProductTourStep
                tipRef={tipRef}
                nextBtnRef={nextBtnRef}
                tipPos={tipPos}
                step={step}
                mascotKey={mascotKey}
                ui={ui}
                index={index}
                total={total}
                single={single}
                first={first}
                last={last}
                sourcesPickerOnlyTour={sourcesPickerOnlyTour}
                onSkip={() => finish({ markDone: !sourcesPickerOnlyTour })}
                onPrev={prev}
                onNext={next}
            />
        </div>
    );
}
