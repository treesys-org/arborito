/**
 * Staggered enter for list/grid rows (translate only — never opacity, so
 * consolidated CTAs/headers stay readable). Stable keys across progressive
 * updates do not re-flash.
 *
 * @param {{ index?: number, children?: import('react').ReactNode, className?: string, as?: string, fadeOnly?: boolean }} props
 */
export function listRowEnterIndex(index = 0) {
    return Math.min(14, Math.max(0, Number(index) || 0));
}

/** Class + CSS var for applying enter animation on an existing element (e.g. knot wrapper). */
export function listRowEnterProps(index = 0, { fadeOnly = false, className = '' } = {}) {
    const i = listRowEnterIndex(index);
    const mods = fadeOnly ? ' arborito-list-row-enter--fade' : '';
    const extra = className ? ` ${className}` : '';
    return {
        className: `arborito-list-row-enter${mods}${extra}`,
        style: { '--arborito-row-i': i },
    };
}

export function ListRowEnter({ index = 0, children, className = '', as: Tag = 'div', fadeOnly = false }) {
    const enter = listRowEnterProps(index, { fadeOnly, className });
    return (
        <Tag className={`${enter.className} min-w-0`} style={enter.style}>
            {children}
        </Tag>
    );
}

/**
 * Inert placeholder rows so hubs never blank to a full-panel spinner.
 * @param {{ count?: number, variant?: 'card' | 'compact' | 'knot' | 'child', startIndex?: number }} props
 */
export function ListRowSkeleton({ count = 3, variant = 'card', startIndex = 0 }) {
    const n = Math.max(1, Math.min(8, Number(count) || 3));
    const base = Math.max(0, Number(startIndex) || 0);
    return (
        <>
            {Array.from({ length: n }, (_, idx) => (
                <ListRowEnter
                    key={`skel-${variant}-${base + idx}`}
                    index={base + idx}
                    fadeOnly={variant === 'knot'}
                >
                    <div
                        className={`arborito-list-row-skel arborito-list-row-skel--${variant}`}
                        aria-hidden="true"
                    />
                </ListRowEnter>
            ))}
        </>
    );
}
