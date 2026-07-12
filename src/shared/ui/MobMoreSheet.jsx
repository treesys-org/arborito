import { MmenuRootHero } from './MmenuChrome.jsx';
import { DOCK_SHEET_SCROLL } from './dock-sheet-chrome.js';

/** Shared class strings for mobile More backdrop + sheet (browse + construction). */
export function mobMoreBackdropClass({ freshEnter = false, instant = false } = {}) {
    return [
        'arborito-sheet-backdrop',
        'arborito-sheet-backdrop--mobile-more',
        freshEnter ? 'arborito-dock-modal-scrim-enter' : '',
        instant ? 'arborito-sheet-backdrop--instant' : '',
    ]
        .filter(Boolean)
        .join(' ');
}

export function mobMoreSheetClass({ freshEnter = false, instant = false, extra = '' } = {}) {
    return [
        'arborito-sheet',
        'arborito-sheet--mobile-more',
        'min-h-0',
        freshEnter ? 'arborito-dock-modal-enter' : '',
        instant ? 'arborito-sheet--instant' : '',
        extra,
    ]
        .filter(Boolean)
        .join(' ');
}

const MORE_SCROLL_PAD = { paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 12px))' };

/**
 * Mobile “More” sheet shell: backdrop + dialog + hero + scroll host.
 * Put menu rows / fields in `children`.
 */
export function MobMoreSheet({
    open,
    freshEnter = false,
    instantReveal = false,
    backdropId,
    sheetId,
    ariaLabel,
    onBackdropClose,
    ui,
    title,
    leadingIcon,
    backId,
    backAriaLabel,
    onBack,
    showHero = true,
    scrollClassName = '',
    children,
}) {
    return (
        <>
            <div
                id={backdropId}
                className={mobMoreBackdropClass({ freshEnter, instant: instantReveal })}
                aria-hidden={!open}
                hidden={!open || undefined}
                onClick={onBackdropClose}
            />
            <div
                id={sheetId}
                className={mobMoreSheetClass({ freshEnter, instant: instantReveal })}
                role="dialog"
                aria-modal="true"
                aria-label={ariaLabel}
                hidden={!open || undefined}
            >
                {showHero ? (
                    <MmenuRootHero
                        ui={ui}
                        title={title}
                        leadingIcon={leadingIcon}
                        backId={backId}
                        backAria={backAriaLabel}
                        onBack={onBack}
                    />
                ) : null}
                <div
                    className={`arborito-mmenu-scroll arborito-mmenu-pane-host ${DOCK_SHEET_SCROLL}${scrollClassName ? ` ${scrollClassName}` : ''}`}
                    style={MORE_SCROLL_PAD}
                >
                    {children}
                </div>
            </div>
        </>
    );
}
