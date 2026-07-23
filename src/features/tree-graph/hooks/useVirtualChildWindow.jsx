import { useEffect, useState } from 'react';

const ROW_HEIGHT = 52;
const OVERSCAN = 6;
export const CHILD_LIST_VIRTUAL_THRESHOLD = 30;

/**
 * Window child rows by trunk scroll position (lightweight alternative to @tanstack/react-virtual).
 * @param {object[]} children
 * @param {import('react').RefObject<HTMLElement|null>} scrollRootRef
 */
export function useVirtualChildWindow(children, scrollRootRef) {
    const [range, setRange] = useState({ start: 0, end: children.length });

    useEffect(() => {
        if (!Array.isArray(children) || children.length <= CHILD_LIST_VIRTUAL_THRESHOLD) {
            setRange({ start: 0, end: children.length });
            return undefined;
        }
        const root = scrollRootRef?.current;
        if (!root) return undefined;

        const update = () => {
            const panel = root.querySelector('.mobile-children-panel');
            if (!panel) {
                setRange({ start: 0, end: children.length });
                return;
            }
            const rootRect = root.getBoundingClientRect();
            const panelRect = panel.getBoundingClientRect();
            const relTop = panelRect.top - rootRect.top + root.scrollTop;
            const relBottom = relTop + panelRect.height;
            const viewTop = root.scrollTop;
            const viewBottom = root.scrollTop + root.clientHeight;
            const overlapTop = Math.max(relTop, viewTop);
            const overlapBottom = Math.min(relBottom, viewBottom);
            if (overlapBottom <= overlapTop) {
                setRange({ start: 0, end: Math.min(children.length, OVERSCAN * 2) });
                return;
            }
            const start = Math.max(0, Math.floor((overlapTop - relTop) / ROW_HEIGHT) - OVERSCAN);
            const visible = Math.ceil((overlapBottom - overlapTop) / ROW_HEIGHT) + OVERSCAN * 2;
            const end = Math.min(children.length, start + visible);
            setRange({ start, end });
        };

        update();
        root.addEventListener('scroll', update, { passive: true });
        window.addEventListener('resize', update);
        return () => {
            root.removeEventListener('scroll', update);
            window.removeEventListener('resize', update);
        };
    }, [children.length, scrollRootRef]);

    if (!Array.isArray(children) || children.length <= CHILD_LIST_VIRTUAL_THRESHOLD) {
        return { items: children, paddingTop: 0, paddingBottom: 0, virtualized: false };
    }

    const items = children.slice(range.start, range.end);
    const paddingTop = range.start * ROW_HEIGHT;
    const paddingBottom = Math.max(0, (children.length - range.end) * ROW_HEIGHT);
    return { items, paddingTop, paddingBottom, virtualized: true };
}
