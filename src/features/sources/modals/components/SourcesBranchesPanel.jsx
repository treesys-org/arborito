/** Branches tab list + filters in sources modal. */
import { useEffect, useMemo, useState } from 'react';
import { shouldShowMobileUI } from '../../../../shared/ui/breakpoints.js';
import { SourcesBranchRow } from './SourcesBranchRow.jsx';
import { SourcesSavedRow } from './SourcesSavedRow.jsx';
import { SourcesInternetRow } from './SourcesInternetRow.jsx';
import { SourcesFilterChip } from './SourcesFilterChip.jsx';
import { SOURCES_UNIFIED_DISPLAY_CAP } from '../../../p2p-webtorrent/api/directory-index-config.js';

export function SourcesBranchesPanel({
    ui,
    state,
    sourcesQ,
    setSourcesQ,
    sourcesScope,
    setSourcesScope,
    sourcesAdvancedOpen,
    setSourcesAdvancedOpen,
    globalDirFilter,
    globalDirLoading,
    globalDirError,
    globalDirUiTruncated,
    treeFreezeBusy,
    rowActionsOpen,
    toggleRowActions,
    getBranchesTabRows,
    bump,
    onAction,
}) {
    const scope = String(sourcesScope || 'all');
    const q = String(sourcesQ || '');
    const advancedOpen = !!sourcesAdvancedOpen;
    const dirFilter = String(globalDirFilter || 'discover');
    const activeSource = state.activeSource;
    const items = useMemo(
        () => getBranchesTabRows(ui, state, activeSource),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [getBranchesTabRows, ui, state, activeSource, scope, q, dirFilter, bump]
    );
    const pageSize = shouldShowMobileUI() ? 12 : 24;
    const pagKey = `${scope}|${q}|${dirFilter}`;
    const [shown, setShown] = useState(pageSize);
    useEffect(() => {
        setShown(pageSize);
    }, [pagKey, pageSize]);
    const visible = items.slice(0, Math.max(pageSize, shown));
    const remaining = Math.max(0, items.length - visible.length);
    const loading = !!globalDirLoading;
    const err = String(globalDirError || '').trim();

    return (
        <div className="pt-2 pb-1">
            <div className="sticky top-0 z-10 -mx-4 px-4 pt-2 pb-3 arborito-sources-sticky-head">
                <div className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/30">
                    <div className="flex flex-col gap-2">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-2 min-w-0">
                            <input
                                id="inp-sources-search"
                                type="search"
                                autoComplete="off"
                                value={q}
                                placeholder={
                                    ui.sourcesBranchesSearchPlaceholder ||
                                    ui.sourcesUnifiedSearchPlaceholder ||
                                    'Search branches…'
                                }
                                className="arborito-input min-w-0 sm:flex-1 min-h-[44px]"
                                onChange={(e) => setSourcesQ(e.target.value)}
                            />
                            <button
                                type="button"
                                className="min-h-[44px] flex-1 sm:flex-initial px-3 py-2 rounded-xl text-[11px] font-extrabold tracking-wide bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700"
                                onClick={() => setSourcesAdvancedOpen(!advancedOpen)}
                            >
                                {advancedOpen
                                    ? ui.sourcesFiltersHide || 'Hide filters'
                                    : ui.sourcesFiltersShow || 'Filters'}
                            </button>
                        </div>
                        {advancedOpen ? (
                            <div className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/20 space-y-3">
                                <div className="flex flex-wrap gap-2 items-center" role="group">
                                    {[
                                        ['all', ui.sourcesUnifiedScopeAll || 'All'],
                                        ['branch', ui.sourcesPillBranch || 'Branch'],
                                        ['saved', ui.sourcesPillSaved || 'Saved'],
                                        ['internet', ui.sourcesPillInternet || 'Internet'],
                                    ].map(([id, label]) => (
                                        <SourcesFilterChip
                                            key={id}
                                            label={label}
                                            active={scope === id}
                                            onClick={() => setSourcesScope(id)}
                                        />
                                    ))}
                                </div>
                                {(scope === 'all' || scope === 'internet') && (
                                    <div className="flex flex-wrap gap-2 items-center" role="group">
                                        {[
                                            ['discover', ui.sourcesGlobalFilterDiscover || 'Discover'],
                                            ['recent', ui.sourcesGlobalFilterRecent || 'Recent'],
                                            ['voted', ui.sourcesGlobalFilterVoted || 'Top votes'],
                                            ['used7', ui.sourcesGlobalFilterUsed7 || 'Popular (7d)'],
                                            ['active', ui.sourcesGlobalFilterActive || 'Active now'],
                                        ].map(([id, label]) => (
                                            <SourcesFilterChip
                                                key={id}
                                                label={label}
                                                tone="online"
                                                active={dirFilter === id}
                                                onClick={() => onAction('global-filter', { filter: id })}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
            <div className="mt-4 space-y-3">
                {err ? (
                    <p className="text-xs font-bold text-amber-800 dark:text-amber-200">{err}</p>
                ) : null}
                {loading && (scope === 'all' || scope === 'internet') ? (
                    <p className="text-xs text-slate-500">{ui.loading || 'Loading…'}</p>
                ) : null}
                {visible.length === 0 && !loading && !err ? (
                    <div className="arborito-empty arborito-empty--dashed">
                        {ui.sourcesUnifiedEmpty || 'No results.'}
                    </div>
                ) : (
                    <div className="space-y-3">
                        {visible.map((it, idx) => {
                            if (it.kind === 'branch') {
                                return (
                                    <SourcesBranchRow
                                        key={`b-${it.data.branch?.id}-${idx}`}
                                        branch={it.data.branch}
                                        ui={ui}
                                        isActive={it.data.isActive}
                                        actionsOpen={rowActionsOpen}
                                        freezeBusy={treeFreezeBusy}
                                        onAction={onAction}
                                        onToggleRowActions={toggleRowActions}
                                        onToggleFreeze={(id) => onAction('toggle-tree-freeze', { id })}
                                    />
                                );
                            }
                            if (it.kind === 'saved') {
                                return (
                                    <SourcesSavedRow
                                        key={`s-${it.data.source?.id}-${idx}`}
                                        source={it.data.source}
                                        ui={ui}
                                        isActive={it.data.isActive}
                                        actionsOpen={rowActionsOpen}
                                        freezeBusy={treeFreezeBusy}
                                        onAction={onAction}
                                        onToggleRowActions={toggleRowActions}
                                        onToggleFreeze={(id) => onAction('toggle-tree-freeze', { id })}
                                    />
                                );
                            }
                            return (
                                <SourcesInternetRow
                                    key={`i-${it.data.row?.ownerPub}-${it.data.row?.universeId}-${idx}`}
                                    row={it.data.row}
                                    localInfo={it.data.localInfo}
                                    metrics={it.data.metrics}
                                    ui={ui}
                                    actionsOpen={rowActionsOpen}
                                    onAction={onAction}
                                    onToggleRowActions={toggleRowActions}
                                    onVote={({ ownerPub, universeId }) =>
                                        onAction('global-vote', { ownerPub, universeId, vote: 'up' })
                                    }
                                    onShare={(opts) =>
                                        onAction('share-tree-row', {
                                            shareName: opts.name,
                                            shareUrl: opts.url,
                                            shareCode: opts.shareCode,
                                            ownerPub: opts.ownerPub,
                                            universeId: opts.universeId,
                                        })
                                    }
                                />
                            );
                        })}
                    </div>
                )}
                {remaining > 0 ? (
                    <div className="mt-3 flex justify-center">
                        <button
                            type="button"
                            className="min-h-11 px-4 py-2 rounded-xl text-xs font-extrabold tracking-wide bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700"
                            onClick={() => setShown((n) => n + pageSize)}
                        >
                            {String(ui.sourcesUnifiedLoadMore || 'Load more ({{n}} more)').replace(
                                /\{\{n\}\}/g,
                                String(remaining)
                            )}
                        </button>
                    </div>
                ) : null}
                {globalDirUiTruncated ? (
                    <p className="text-[11px] text-violet-950 dark:text-violet-100">
                        {(ui.sourcesUnifiedListTruncTitle || 'List shortened ({{n}} rows)').replace(
                            /\{\{n\}\}/g,
                            String(SOURCES_UNIFIED_DISPLAY_CAP)
                        )}
                    </p>
                ) : null}
            </div>
        </div>
    );
}
