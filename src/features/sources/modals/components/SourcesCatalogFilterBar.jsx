import { TabBar } from '../../../../app/components/TabBar.jsx';
import { SourcesFilterChip } from './SourcesFilterChip.jsx';

function CatalogFilterMenuIcon() {
    return (
        <svg
            className="arborito-sources-filter-menu__icon"
            viewBox="0 0 24 24"
            width="18"
            height="18"
            aria-hidden="true"
            focusable="false"
        >
            <path
                fill="currentColor"
                d="M4 7h16a1 1 0 1 0 0-2H4a1 1 0 1 0 0 2zm0 6h16a1 1 0 1 0 0-2H4a1 1 0 1 0 0 2zm0 6h16a1 1 0 1 0 0-2H4a1 1 0 1 0 0 2z"
            />
        </svg>
    );
}

/**
 * Consolidated Cursos chrome: Mis/Explorar tabs + search + kind chips + ☰.
 * One sticky surface — no gap between tabs and search.
 */
export function SourcesCatalogFilterBar({
    ui,
    q,
    onQueryChange,
    kindFilter,
    onKindChange,
    menuOpen,
    onToggleMenu,
    showSort = false,
    dirFilter,
    onSort,
    showMineScope = false,
    scope,
    onScope,
    mainTabs = null,
    mainTab = '',
    onMainTabChange,
    searchInputId = 'inp-sources-search',
}) {
    const kind = String(kindFilter || 'all');
    const menuUseful = !!(showSort || showMineScope);
    const tabs = Array.isArray(mainTabs) ? mainTabs : [];

    const chipClass = (active) =>
        active
            ? 'arborito-sources-action-chip arborito-sources-action-chip--kind-active'
            : 'arborito-sources-action-chip';

    return (
        <div className="sticky top-0 z-20 arborito-sources-sticky-head arborito-sources-catalog-chrome">
            <div className="arborito-sources-sticky-card">
                {tabs.length ? (
                    <div data-arbor-tour="sources-main-tabs" className="arborito-sources-catalog-tabs">
                        <TabBar
                            tabs={tabs}
                            activeTab={mainTab}
                            onTabChange={onMainTabChange}
                            ariaLabel={ui.sourcesMainTabsAria || 'Library'}
                            className="arborito-sources-catalog-tab-bar"
                        />
                    </div>
                ) : null}
                <div className="arborito-sources-catalog-tools">
                    <div className="arborito-sources-search-bar arborito-sources-search-bar--solo">
                        <input
                            id={searchInputId}
                            type="search"
                            autoComplete="off"
                            value={q}
                            placeholder={
                                ui.sourcesBranchesSearchPlaceholder ||
                                ui.sourcesUnifiedSearchPlaceholder ||
                                'Search…'
                            }
                            className="arborito-input arborito-sources-search-bar__input"
                            onChange={(e) => onQueryChange?.(e.target.value)}
                        />
                        {menuUseful ? (
                            <button
                                type="button"
                                className={`arborito-sources-filter-menu${menuOpen ? ' is-active' : ''}`}
                                aria-expanded={menuOpen}
                                aria-label={
                                    menuOpen
                                        ? ui.sourcesFiltersHide || 'Hide filters'
                                        : ui.sourcesFiltersShow || 'More filters'
                                }
                                title={
                                    menuOpen
                                        ? ui.sourcesFiltersHide || 'Hide filters'
                                        : ui.sourcesFiltersShow || 'More filters'
                                }
                                onClick={() => onToggleMenu?.()}
                            >
                                <CatalogFilterMenuIcon />
                            </button>
                        ) : null}
                    </div>
                    <div
                        className="arborito-sources-quick-filters__row"
                        role="radiogroup"
                        aria-label={ui.sourcesKindFilterLabel || 'Type'}
                    >
                        <button
                            type="button"
                            role="radio"
                            data-kind-filter="all"
                            className={chipClass(kind === 'all')}
                            aria-checked={kind === 'all'}
                            onClick={() => onKindChange?.('all')}
                        >
                            {ui.sourcesKindFilterAll || 'All'}
                        </button>
                        <button
                            type="button"
                            role="radio"
                            data-kind-filter="branch"
                            className={chipClass(kind === 'branch')}
                            aria-checked={kind === 'branch'}
                            onClick={() => onKindChange?.('branch')}
                        >
                            {ui.sourcesPillBranch || 'Course'}
                        </button>
                        <button
                            type="button"
                            role="radio"
                            data-kind-filter="composed-tree"
                            className={chipClass(kind === 'composed-tree')}
                            aria-checked={kind === 'composed-tree'}
                            onClick={() => onKindChange?.('composed-tree')}
                        >
                            {ui.sourcesPillComposedTree || 'Playlist'}
                        </button>
                    </div>
                    {menuOpen && menuUseful ? (
                        <div className="arborito-sources-filter-menu-panel space-y-3">
                            {showMineScope ? (
                                <div className="space-y-1.5">
                                    <p className="m-0 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                        {ui.sourcesFiltersWhereHint || 'Which list to show'}
                                    </p>
                                    <div
                                        className="arborito-sources-quick-filters__row arborito-sources-quick-filters__row--wrap"
                                        role="group"
                                    >
                                        {[
                                            [
                                                'branch',
                                                ui.sourcesPillLocal ||
                                                    ui.sourcesUnifiedScopeLocal ||
                                                    'Local',
                                            ],
                                            [
                                                'saved',
                                                ui.sourcesUnifiedScopeSaved || 'Downloaded',
                                            ],
                                            ['all', ui.sourcesUnifiedScopeAll || 'All'],
                                        ].map(([id, label]) => (
                                            <SourcesFilterChip
                                                key={id}
                                                label={label}
                                                active={scope === id}
                                                onClick={() => onScope?.(id)}
                                            />
                                        ))}
                                    </div>
                                </div>
                            ) : null}
                            {showSort ? (
                                <div className="space-y-1.5">
                                    <p className="m-0 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                        {ui.sourcesFiltersSortHint ||
                                            ui.sourcesUnifiedInternetSortTitle ||
                                            'Online sort'}
                                    </p>
                                    <div
                                        className="arborito-sources-quick-filters__row arborito-sources-quick-filters__row--wrap"
                                        role="group"
                                    >
                                        {[
                                            [
                                                'discover',
                                                ui.sourcesGlobalFilterDiscover || 'Recommended',
                                            ],
                                            [
                                                'recent',
                                                ui.sourcesGlobalFilterRecent || 'Newest',
                                            ],
                                            [
                                                'voted',
                                                ui.sourcesGlobalFilterVoted || 'Most voted',
                                            ],
                                            [
                                                'used7',
                                                ui.sourcesGlobalFilterUsed7 || 'Popular (7d)',
                                            ],
                                            [
                                                'active',
                                                ui.sourcesGlobalFilterActive || 'Active now',
                                            ],
                                        ].map(([id, label]) => (
                                            <SourcesFilterChip
                                                key={id}
                                                label={label}
                                                active={dirFilter === id}
                                                onClick={() => onSort?.(id)}
                                            />
                                        ))}
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
