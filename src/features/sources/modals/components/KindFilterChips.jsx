const KIND_OPTIONS = [
    ['all', (ui) => ui.sourcesKindFilterAll || 'All', ''],
    ['branch', (ui) => ui.sourcesPillBranch || 'Branch', 'sources-tab-branches'],
    ['composed-tree', (ui) => ui.sourcesPillComposedTree || 'Tree', 'sources-tab-trees'],
];

/**
 * Branch vs composed-tree kind filter, React port of `renderKindFilterHtml` /
 * `renderSwitcherKindFilterHtml` from `sources-kind-ui.js`.
 */
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
                        data-action="set-kind-filter"
                        data-kind-filter={id}
                        {...(tourTarget ? { 'data-arbor-tour': tourTarget } : {})}
                        className={`min-h-10 px-3 py-2 rounded-xl text-[11px] font-extrabold tracking-wide border transition-colors ${
                            active
                                ? 'bg-violet-700 dark:bg-violet-400 text-white dark:text-slate-900 border-violet-700 dark:border-violet-400'
                                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
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
