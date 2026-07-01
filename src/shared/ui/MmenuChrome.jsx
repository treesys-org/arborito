/**
 * Canonical React primitives for mobile More menus (sidebar + construction dock).
 * @see docs/MODAL_STANDARDS.md §7 — single source per UI family
 */

export function MmenuDrillChevron() {
    return (
        <svg
            className="arborito-mmenu-drill-chevron w-5 h-5 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="2.5"
            stroke="currentColor"
            aria-hidden="true"
        >
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
        </svg>
    );
}

/** @deprecated Use `MmenuDrillChevron` — kept for existing imports. */
export const DrillChevron = MmenuDrillChevron;

export function MmenuRootHero({ title, onBack, backAria, ariaLabel, backId }) {
    const backLabel = backAria || ariaLabel || 'Back';
    return (
        <div className="arborito-sheet__hero arborito-sheet__hero--mmenu-sub arborito-dock-modal-hero arborito-mmenu-hero--root">
            <div className="arborito-sheet__grab" aria-hidden="true" />
            <div className="arborito-mmenu-toolbar">
                <button
                    type="button"
                    id={backId}
                    className="arborito-mmenu-back shrink-0"
                    aria-label={backLabel}
                    onClick={onBack}
                >
                    ←
                </button>
                <h2 className="arborito-mmenu-subtitle m-0 flex-1 min-w-0">{title}</h2>
                <span className="w-10 shrink-0" aria-hidden="true" />
            </div>
        </div>
    );
}

export function MmenuDrillRow({
    id,
    icon,
    glyph,
    label,
    hint,
    onClick,
    onPointerEnter,
    className = '',
    extraClass = '',
    title,
    ariaLabel,
    disabled,
    role,
}) {
    const glyphContent = icon ?? glyph;
    const rowClass = ['arborito-mmenu-drill-row', className, extraClass].filter(Boolean).join(' ');
    return (
        <button
            type="button"
            id={id}
            className={rowClass}
            role={role}
            title={title}
            aria-label={ariaLabel}
            disabled={disabled}
            onPointerEnter={onPointerEnter}
            onClick={onClick}
        >
            <span
                className="w-9 text-center text-xl shrink-0 leading-none inline-flex items-center justify-center"
                aria-hidden="true"
            >
                {glyphContent}
            </span>
            <span className="flex-1 min-w-0 text-left">{label}</span>
            {hint ? (
                <span className="arborito-mmenu-drill-hint truncate max-w-[9rem] text-right shrink-0">{hint}</span>
            ) : null}
            <MmenuDrillChevron />
        </button>
    );
}

/** @deprecated Use `MmenuDrillRow` — kept for existing imports. */
export const DrillRow = MmenuDrillRow;
