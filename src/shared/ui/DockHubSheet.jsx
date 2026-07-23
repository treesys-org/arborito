import { mobMoreBackdropClass, mobMoreSheetClass } from './MobMoreSheet.jsx';

/**
 * Dock hub sheet, same DOM + CSS family as MobMoreSheet (backdrop + sheet above dock).
 * Used for construction dock hubs (history, publish, team) and dock-tab Sage.
 */
export function DockHubSheet({
    open = true,
    freshEnter = false,
    instantReveal = false,
    backdropId = 'dock-hub-backdrop',
    sheetId = 'dock-hub-sheet',
    ariaLabel,
    onBackdropClose,
    sheetClassName = '',
    children,
}) {
    if (!open) return null;

    return (
        <>
            <div
                id={backdropId}
                className={mobMoreBackdropClass({ freshEnter, instant: instantReveal })}
                aria-hidden={!open}
                onClick={onBackdropClose}
            />
            <div
                id={sheetId}
                className={mobMoreSheetClass({ freshEnter, instant: instantReveal, extra: sheetClassName })}
                role="dialog"
                aria-modal="true"
                aria-label={ariaLabel}
            >
                {children}
            </div>
        </>
    );
}
