const KIND_OPTIONS = [
    ['all', (ui) => ui.sourcesKindFilterAll || 'All', ''],
    ['branch', (ui) => ui.sourcesPillBranch || 'Course', 'sources-tab-branches'],
    ['composed-tree', (ui) => ui.sourcesPillComposedTree || 'Playlist', 'sources-tab-trees'],
];

/** Branch vs composed-tree kind filter chips. */
export function KindFilterChips({
    ui,
    kindFilter,
    onChange,
    variant = 'biblioteca',
    showLabel = true,
} = {}) {
    const cur = String(kindFilter || 'all');

    if (variant === 'switcher') {
        return (
            <div
                className="arborito-tree-switcher-kind-filter"
                role="group"
                aria-label={
                    ui.treeSwitcherKindFilterAria || ui.sourcesKindFilterLabel || 'Type'
                }
            >
                {KIND_OPTIONS.map(([id, labelFn]) => (
                    <button
                        key={id}
                        type="button"
                        data-switcher-kind={id}
                        className={cur === id ? 'is-active' : ''}
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (cur === id) return;
                            onChange?.(id);
                        }}
                    >
                        {labelFn(ui)}
                    </button>
                ))}
            </div>
        );
    }

    return (
        <div
            className={`arborito-sources-kind-chips${showLabel ? '' : ' arborito-sources-kind-chips--nolabel'}`}
            role="group"
            aria-label={ui.sourcesKindFilterLabel || 'Type'}
            data-arbor-tour="sources-kind-filter"
        >
            {showLabel ? (
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 shrink-0">
                    {ui.sourcesKindFilterLabel || 'Type'}
                </span>
            ) : null}
            {KIND_OPTIONS.map(([id, labelFn, tourTarget]) => {
                const active = cur === id;
                return (
                    <button
                        key={id}
                        type="button"
                        data-kind-filter={id}
                        {...(tourTarget ? { 'data-arbor-tour': tourTarget } : {})}
                        className={
                            active
                                ? 'arborito-sources-action-chip arborito-sources-action-chip--kind-active'
                                : 'arborito-sources-action-chip'
                        }
                        onClick={() => {
                            if (cur === id) return;
                            onChange?.(id);
                        }}
                    >
                        {labelFn(ui)}
                    </button>
                );
            })}
        </div>
    );
}
