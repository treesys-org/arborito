/**
 * Mobile dock tab, browse sidebar + construction dock (via ConstructionDockTab wrapper).
 */

/** Short label for tight dock rows (construction + publish CTA). */
export function shortDockLabel(s) {
    const t = String(s || '').trim();
    if (!t) return '…';
    const first = t.split(/\s+/)[0].replace(/[,;:.)]+$/g, '');
    if (!first) return '…';
    const max = 20;
    return first.length <= max ? first : `${first.slice(0, max - 1)}…`;
}

/** Hamburger for More — SVG so small phones do not drop Unicode ☰. */
export function MobDockMenuIcon({ size = 22, className = '' }) {
    return (
        <svg
            data-dock-menu=""
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width={size}
            height={size}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinecap="round"
            aria-hidden="true"
            focusable="false"
            className={className}
        >
            <path d="M4 7h16" />
            <path d="M4 12h16" />
            <path d="M4 17h16" />
        </svg>
    );
}

function isDockMenuIcon(icon) {
    if (typeof icon === 'string') return icon === '☰';
    return !!(icon && typeof icon === 'object' && icon.props && 'data-dock-menu' in icon.props);
}

export function MobDockTab({
    id,
    tour,
    className = '',
    active = false,
    variant,
    title,
    ariaLabel,
    ariaCurrent,
    ariaExpanded,
    ariaHaspopup,
    disabled,
    truncateLabel = false,
    icon,
    iconClass = '',
    label,
    onClick,
    onPointerEnter,
    children,
}) {
    const tabClass = [
        'arborito-mob-tab',
        active ? 'arborito-mob-tab--active' : '',
        variant ? `arborito-mob-tab--${variant}` : '',
        className,
    ]
        .filter(Boolean)
        .join(' ');

    const iconClasses = [
        'arborito-mob-tab__icon',
        isDockMenuIcon(icon) ? 'arborito-mob-tab__icon--menu' : '',
        iconClass,
    ]
        .filter(Boolean)
        .join(' ');

    const displayLabel = truncateLabel ? shortDockLabel(label) : label;

    return (
        <button
            type="button"
            id={id}
            data-arbor-tour={tour}
            className={tabClass}
            title={title}
            aria-label={ariaLabel || title}
            aria-current={ariaCurrent}
            aria-expanded={ariaExpanded}
            aria-haspopup={ariaHaspopup}
            disabled={disabled}
            onClick={onClick}
            onPointerEnter={onPointerEnter}
        >
            <span className={iconClasses} aria-hidden="true">
                {icon}
            </span>
            <span className="arborito-mob-tab__label">{displayLabel}</span>
            {children}
        </button>
    );
}
