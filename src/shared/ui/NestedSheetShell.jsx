import { MODAL_PANEL_SIZE } from './modal-panel-size.js';
import { resolveNestedSheetChrome } from './nested-sheet-chrome.js';

function nestedPanelSizeClass(tier) {
    const key = String(tier || 'STANDARD').toUpperCase();
    const raw = MODAL_PANEL_SIZE[key] ?? tier ?? MODAL_PANEL_SIZE.STANDARD;
    return String(raw)
        .split(/[\s,]+/)
        .filter(Boolean)
        .map((s) => `arborito-float-modal-card--${s}`)
        .join(' ');
}

/**
 * Sub-dialog inside a dock hub panel (`absolute inset-0`, not viewport `fixed`).
 * Use for forum new-topic, future in-hub confirmations, etc.
 */
export function NestedSheetShell({
    children,
    onBackdropClick,
    panelId,
    ariaLabelledBy,
    ariaLabel,
    zIndex = 80,
    panelSizeTier = 'STANDARD',
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
    const isConfirm = variant === 'confirm';
    const sizeCls = isConfirm ? '' : nestedPanelSizeClass(panelSizeTier);
    const scrimCls =
        isConfirm
            ? chrome.scrimClassName
            : `${chrome.scrimClassName} absolute inset-0 flex items-end sm:items-center justify-center p-3 sm:p-8`;

    return (
        <div
            className={scrimCls}
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
                className={`${isConfirm ? '' : 'arborito-float-modal-card'} ${sizeCls} ${chrome.cardClassName} w-full ${isConfirm ? '' : 'max-h-[min(92dvh,720px)]'} flex flex-col min-h-0 ${chrome.cardExtraClass}`.replace(/\s+/g, ' ').trim()}
                onClick={(e) => e.stopPropagation()}
            >
                {children}
            </div>
        </div>
    );
}
