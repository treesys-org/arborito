import { resolveNestedSheetChrome } from './nested-sheet-chrome.js';

/**
 * Compact in-hub prompt card (`absolute inset-0` scrim).
 * Variants: `confirm` (padded callout card) | `form` (Language-style hero shell).
 */
export function NestedSheetShell({
    children,
    onBackdropClick,
    panelId,
    ariaLabelledBy,
    ariaLabel,
    zIndex = 80,
    variant,
    scrimClassName,
    cardClassName,
    cardExtraClass = '',
}) {
    const chrome = resolveNestedSheetChrome(variant, {
        scrimClassName,
        cardClassName,
        cardExtraClass,
    });

    return (
        <div
            className={chrome.scrimClassName}
            style={{ zIndex }}
            role="presentation"
            onClick={(e) => {
                if (e.target === e.currentTarget) onBackdropClick?.(e);
            }}
        >
            <div
                id={panelId}
                role="dialog"
                aria-modal="true"
                aria-labelledby={ariaLabelledBy || undefined}
                aria-label={ariaLabel || undefined}
                className={`${chrome.cardClassName} ${chrome.cardExtraClass}`.replace(/\s+/g, ' ').trim()}
                onClick={(e) => e.stopPropagation()}
            >
                {children}
            </div>
        </div>
    );
}
