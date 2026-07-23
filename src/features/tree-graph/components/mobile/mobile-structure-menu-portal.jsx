import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const MENU_Z = 1200;

/** Fixed portal menu for construction ⋮ actions (avoids overflow clipping in panel rows). */
export function MobileStructureMenuPortal({ open, onClose, anchorRef, menuLbl, children }) {
    const menuRef = useRef(null);
    const [pos, setPos] = useState(null);

    useLayoutEffect(() => {
        if (!open || !anchorRef?.current) {
            setPos(null);
            return undefined;
        }
        const place = () => {
            const btn = anchorRef.current;
            if (!btn) return;
            const rect = btn.getBoundingClientRect();
            const vw = window.innerWidth || document.documentElement.clientWidth || 0;
            const menuW = 220;
            const estH = 168;
            const spaceBelow = window.innerHeight - rect.bottom;
            const placeAbove = spaceBelow < estH && rect.top > estH + 12;
            let left = rect.right - menuW;
            left = Math.max(8, Math.min(left, vw - menuW - 8));
            setPos({
                top: placeAbove ? rect.top - 8 : rect.bottom + 6,
                left,
                transform: placeAbove ? 'translateY(-100%)' : 'none',
            });
        };
        place();
        window.addEventListener('resize', place);
        window.addEventListener('scroll', place, true);
        return () => {
            window.removeEventListener('resize', place);
            window.removeEventListener('scroll', place, true);
        };
    }, [open, anchorRef]);

    useEffect(() => {
        if (!open) return undefined;
        const onDoc = (ev) => {
            const t = ev.target;
            if (!(t instanceof Node)) return;
            if (anchorRef?.current?.contains(t) || menuRef.current?.contains(t)) return;
            onClose();
        };
        const onKey = (ev) => {
            if (ev.key === 'Escape') onClose();
        };
        document.addEventListener('mousedown', onDoc, true);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDoc, true);
            document.removeEventListener('keydown', onKey);
        };
    }, [open, onClose, anchorRef]);

    if (!open || !pos || typeof document === 'undefined') return null;

    return createPortal(
        <div
            ref={menuRef}
            className="mobile-structure-dropdown mobile-structure-dropdown--portal"
            role="menu"
            aria-label={menuLbl}
            style={{
                position: 'fixed',
                top: pos.top,
                left: pos.left,
                transform: pos.transform,
                zIndex: MENU_Z,
            }}
        >
            {children}
        </div>,
        document.body
    );
}
