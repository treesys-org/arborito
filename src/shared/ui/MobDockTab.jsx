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
        typeof icon === 'string' && icon === '☰' ? 'arborito-mob-tab__icon--menu' : '',
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
