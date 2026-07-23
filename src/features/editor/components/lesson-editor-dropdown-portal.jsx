import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const DROPDOWN_Z = 1200;

/**
 * Fixed-position dropdown anchored to a toggle button.
 * Renders through a portal so toolbar scroll containers (overflow:hidden) cannot clip the panel.
 */
export function useLessonEditorDropdownPortal(open, onClose, toggleRef, { variant = 'format' } = {}) {
    const panelRef = useRef(null);
    const [anchor, setAnchor] = useState(null);

    const reposition = useCallback(() => {
        const toggle = toggleRef.current;
        if (!toggle || !open) return;
        const rect = toggle.getBoundingClientRect();
        const vw = window.innerWidth || document.documentElement.clientWidth || 0;
        const isDesktop = document.documentElement.classList.contains('arborito-desktop');
        const maxPanel =
            variant === 'insert'
                ? isDesktop
                    ? Math.min(26 * 16, vw - 16)
                    : Math.min(288, vw - 16)
                : Math.min(288, vw - 16);
        const panelW = Math.min(maxPanel, Math.max(rect.width, variant === 'insert' && isDesktop ? 280 : 184));
        let left = rect.left;
        if (left + panelW > vw - 8) left = Math.max(8, vw - panelW - 8);
        setAnchor({
            top: rect.bottom + 6,
            left,
            minWidth: Math.max(rect.width, variant === 'insert' && isDesktop ? 280 : 184),
            maxWidth: panelW,
        });
    }, [open, toggleRef, variant]);

    useLayoutEffect(() => {
        if (!open) {
            setAnchor(null);
            return undefined;
        }
        reposition();
        const onReflow = () => reposition();
        window.addEventListener('resize', onReflow);
        window.addEventListener('scroll', onReflow, true);
        return () => {
            window.removeEventListener('resize', onReflow);
            window.removeEventListener('scroll', onReflow, true);
        };
    }, [open, reposition]);

    useEffect(() => {
        if (!open) return undefined;
        document.documentElement.classList.add('arborito-lesson-editor-dropdown-open');

        const onDocDown = (ev) => {
            const t = ev.target;
            if (!(t instanceof Node)) return;
            const panel = panelRef.current;
            const toggle = toggleRef.current;
            if (panel?.contains(t) || toggle?.contains(t)) return;
            if (
                t instanceof Element &&
                t.closest(
                    '.lesson-editor-insert-panel__opt, .lesson-editor-math-symbol, #btn-insert-quiz, .lesson-editor-format-panel, .lesson-editor-insert-panel'
                )
            ) {
                return;
            }
            onClose();
        };
        const onKey = (ev) => {
            if (ev.key === 'Escape') onClose();
        };

        document.addEventListener('mousedown', onDocDown, true);
        document.addEventListener('keydown', onKey);

        return () => {
            document.documentElement.classList.remove('arborito-lesson-editor-dropdown-open');
            document.removeEventListener('mousedown', onDocDown, true);
            document.removeEventListener('keydown', onKey);
        };
    }, [open, onClose, toggleRef]);

    const renderPortal = useCallback(
        (panelId, className, ariaLabel, children) => {
            if (!open || !anchor || typeof document === 'undefined') return null;
            return createPortal(
                <div
                    ref={panelRef}
                    id={panelId}
                    className={`${className} lesson-editor-dropdown-portal`}
                    role="menu"
                    aria-label={ariaLabel}
                    style={{
                        position: 'fixed',
                        top: anchor.top,
                        left: anchor.left,
                        minWidth: anchor.minWidth,
                        maxWidth: anchor.maxWidth,
                        zIndex: DROPDOWN_Z,
                    }}
                >
                    {children}
                </div>,
                document.body
            );
        },
        [open, anchor]
    );

    return { panelRef, renderPortal, reposition };
}
