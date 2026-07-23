/**
 * Canonical React primitives for mobile More menus (sidebar + construction dock).
 * @see docs/MODAL_STANDARDS.md §7, single source per UI family
 */

import { isValidElement } from 'react';
import { ModalHubHero } from '../../app/components/ModalHero.jsx';
import { ChromeEmoji } from '../../app/components/ChromeEmoji.jsx';

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

/** More / drill sheet header, delegates to ModalHubHero (same chrome as Search, Sage, etc.). */
export function MmenuRootHero({ ui, title, leadingIcon, onBack, backAria, ariaLabel, backId }) {
    return (
        <ModalHubHero
            ui={ui}
            mobile
            tone="plain"
            showClose={false}
            title={title}
            leadingIcon={leadingIcon}
            backTagClass="arborito-mmenu-back"
            backButtonId={backId}
            backAriaLabel={backAria || ariaLabel || 'Back'}
            onBack={onBack}
        />
    );
}

function MmenuGlyph({ content, size = 22 }) {
    if (content == null || content === '') return null;
    if (isValidElement(content)) return content;
    if (typeof content === 'string') {
        return <ChromeEmoji emoji={content} size={size} />;
    }
    return content;
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
                <MmenuGlyph content={glyphContent} />
            </span>
            <span className="flex-1 min-w-0 text-left">{label}</span>
            {hint ? (
                <span className="arborito-mmenu-drill-hint truncate max-w-[9rem] text-right shrink-0">{hint}</span>
            ) : null}
            <MmenuDrillChevron />
        </button>
    );
}
