export function SourcesFilterChip({ label, active, tone = 'neutral', onClick, ...rest }) {
    const cls = [
        'arborito-filter-chip',
        active
            ? `arborito-filter-chip--active arborito-filter-chip--${tone}`
            : 'arborito-filter-chip--idle',
    ].join(' ');
    return (
        <button type="button" className={cls} onClick={onClick} {...rest}>
            {label}
        </button>
    );
}
