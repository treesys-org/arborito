const KIND_OPTIONS = [
    ['all', (ui) => ui.sourcesKindFilterAll || 'All', ''],
    ['branch', (ui) => ui.sourcesPillBranch || 'Branch', 'sources-tab-branches'],
    ['composed-tree', (ui) => ui.sourcesPillComposedTree || 'Tree', 'sources-tab-trees'],
];

/** Branch vs composed-tree kind filter chips. */
export function KindFilterChips({ ui, kindFilter, onChange, variant = 'biblioteca' }) {
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
        <div className="flex flex-wrap gap-2 items-center" data-arbor-tour="sources-main-tabs">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 shrink-0">
                {ui.sourcesKindFilterLabel || 'Type'}
            </span>
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
