import { createPortal } from 'react-dom';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';

/**
 * Lesson TOC sheet shell, backdrop + panel.
 * Mobile: portaled to document.body so stacking is not clipped by lesson chrome.
 */
export function LessonTocSheet({
    open,
    backdropId = 'toc-mobile-backdrop',
    sheetId = 'lesson-toc-sheet',
    ariaLabel,
    tourAttr,
    onBackdropClick,
    head,
    toolbar,
    scrollRef,
    scrollClassName = 'arborito-lesson-toc-sheet__scroll custom-scrollbar',
    children,
}) {
    const mobile = shouldShowMobileUI();
    const sheet = (
        <>
            <div
                id={backdropId}
                className={`arborito-lesson-toc-backdrop${mobile ? ' arborito-lesson-toc-backdrop--portaled' : ''} ${!open ? 'is-hidden' : ''}`}
                onClick={onBackdropClick}
                role="presentation"
            />
            <div
                id={sheetId}
                className={`arborito-lesson-toc-sheet${mobile ? ' arborito-lesson-toc-sheet--portaled' : ''} ${!open ? 'is-collapsed' : ''}`}
                role="dialog"
                aria-modal="true"
                aria-label={ariaLabel}
                aria-hidden={!open}
                {...(tourAttr ? { 'data-arbor-tour': tourAttr } : {})}
            >
                {head}
                {toolbar ? <div className="arborito-lesson-toc-sheet__toolbar">{toolbar}</div> : null}
                <div ref={scrollRef} className={scrollClassName}>
                    {children}
                </div>
            </div>
        </>
    );

    if (mobile && typeof document !== 'undefined') {
        return createPortal(sheet, document.body);
    }

    return sheet;
}
