import { useEffect, useMemo } from 'react';
import { useSources } from '../../hooks/useSources.js';
import { SOURCES_UNIFIED_DISPLAY_CAP } from '../../../p2p-webtorrent/api/directory-index-config.js';
import {
    ensurePublishedTreeMetrics,
    ensureSavedSourcesMetrics,
} from '../../api/modals/logic/sources-directory-fetch.js';
import { collectTreesTabItems } from '../../api/modals/logic/sources-collect-trees.js';
import { SourcesFilterChip } from './SourcesFilterChip.jsx';
import { SourcesComposedTreeRow, composedTreeRowKey } from './SourcesComposedTreeRow.jsx';
import { SourcesSavedRow } from './SourcesSavedRow.jsx';
import { SourcesInternetRow } from './SourcesInternetRow.jsx';

function CrossTabActiveBanner({ ui, state, mainTab, onSwitchTab }) {
    const active = state.activeSource;
    if (!active?.id) return null;
    const onTrees = mainTab === 'trees';
    if (onTrees && active.type === 'composed-tree') return null;
    if (!onTrees && active.type !== 'composed-tree') return null;
    const label = onTrees
        ? ui.sourcesActiveBranchHeading || 'Active branch'
        : ui.sourcesActiveTreeHeading || 'Active tree';
    const switchLbl = onTrees ? ui.sourcesTabBranches || 'Branches' : ui.sourcesTabTrees || 'Trees';
    const switchTab = onTrees ? 'branches' : 'trees';
    const name = String(active.name || '').trim();
    return (
        <div className="arborito-connected-banner mb-3">
            <p className="arborito-connected-banner__title">
                {label}: {name}
            </p>
            <button
                type="button"
                className="mt-2 min-h-9 px-3 py-1.5 rounded-lg text-[11px] font-extrabold bg-violet-700 dark:bg-violet-500 text-white"
                onClick={() => onSwitchTab(switchTab)}
            >
                {switchLbl}
            </button>
        </div>
    );
}

export function SourcesTreesTab({
    ui,
    state,
    mainTab,
    treesQ,
    setTreesQ,
    treesScope,
    setTreesScope,
    treesAdvancedOpen,
    setTreesAdvancedOpen,
    globalDirRows,
    globalDirMetrics,
    globalDirLoading,
    globalDirError,
    globalDirUiTruncated,
    sourcesTreeLoading,
    rowActionsOpen,
    collectCtx,
    onAction,
    onToggleRowActions,
    onSwitchTab,
}) {
    const { userStore } = useSources();
    const scope = String(treesScope || 'all');
    const q = String(treesQ || '');
    const activeSource = state.activeSource;

    const items = useMemo(
        () => collectTreesTabItems(collectCtx, ui, state, activeSource, { scope, q }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [collectCtx, ui, state, activeSource, scope, q, globalDirRows, globalDirMetrics]
    );

    useEffect(() => {
        const publishedUrls = (userStore?.state?.trees || [])
            .map((t) => String(t?.publishedNetworkUrl || '').trim())
            .filter(Boolean);
        ensurePublishedTreeMetrics(publishedUrls, globalDirMetrics, collectCtx.setGlobalDirMetrics);
    }, [globalDirMetrics, collectCtx.setGlobalDirMetrics]);

    useEffect(() => {
        if (scope === 'all' || scope === 'saved') {
            const savedTrees = (state.communitySources || []).filter(
                (s) => String(s?.contentKind || '') === 'composed-tree'
            );
            ensureSavedSourcesMetrics(savedTrees, globalDirMetrics, collectCtx.setGlobalDirMetrics);
        }
    }, [scope, state.communitySources, globalDirMetrics, collectCtx.setGlobalDirMetrics]);

    const treeLoading =
        !!sourcesTreeLoading || !!(state.treeHydrating && activeSource?.type === 'composed-tree');
    const activeEntry =
        activeSource?.type === 'composed-tree' && activeSource.treeId
            ? userStore?.getTree?.(activeSource.treeId)
            : null;
    const loading = !!globalDirLoading && (scope === 'all' || scope === 'internet');
    const err = String(globalDirError || '').trim();
    const listEmpty = !items.length && !loading && !err && !activeEntry;

    return (
        <div className="pt-2 pb-1">
            <div className="sticky top-0 z-10 -mx-4 px-4 pt-2 pb-3 arborito-sources-sticky-head">
                <div
                    className="p-3 rounded-2xl border border-violet-200/60 dark:border-violet-900/40 bg-white dark:bg-slate-950/30"
                    data-arbor-tour="sources-pick-tree-trees"
                >
                    <div className="flex flex-col gap-2">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-2 min-w-0">
                            <input
                                id="inp-trees-search"
                                type="search"
                                autoComplete="off"
                                value={treesQ}
                                placeholder={ui.sourcesTreesSearchPlaceholder || 'Search trees…'}
                                className="arborito-input min-w-0 sm:flex-1 min-h-[44px]"
                                onChange={(e) => setTreesQ(e.target.value)}
                            />
                            <button
                                type="button"
                                className="min-h-[44px] flex-1 sm:flex-initial px-3 py-2 rounded-xl text-[11px] font-extrabold tracking-wide bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                                onClick={() => setTreesAdvancedOpen(!treesAdvancedOpen)}
                            >
                                {treesAdvancedOpen
                                    ? ui.sourcesFiltersHide || 'Hide filters'
                                    : ui.sourcesFiltersShow || 'Filters'}
                            </button>
                        </div>
                        {treesAdvancedOpen ? (
                            <div className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/20">
                                <div
                                    className="flex flex-wrap gap-2 items-center"
                                    role="group"
                                    aria-label={
                                        ui.sourcesTreesScopeAria ||
                                        ui.sourcesUnifiedScopeAria ||
                                        'Filter trees'
                                    }
                                >
                                    {[
                                        ['all', ui.sourcesUnifiedScopeAll || 'All'],
                                        ['device', ui.sourcesTreesScopeDevice || 'On device'],
                                        ['saved', ui.sourcesUnifiedScopeSaved || 'Saved'],
                                        ['internet', ui.sourcesUnifiedScopeInternet || 'Internet'],
                                    ].map(([id, label]) => (
                                        <SourcesFilterChip
                                            key={id}
                                            label={label}
                                            active={scope === id}
                                            onClick={() => setTreesScope(id)}
                                        />
                                    ))}
                                </div>
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
            <div className="mt-4 space-y-3">
                <CrossTabActiveBanner
                    ui={ui}
                    state={state}
                    mainTab={mainTab}
                    onSwitchTab={onSwitchTab}
                />
                {err ? (
                    <p className="text-xs font-bold text-amber-800 dark:text-amber-200">{err}</p>
                ) : null}
                {activeEntry ? (
                    <div
                        className="arborito-sources-active-pin arborito-sources-active-pin--tree"
                        data-arbor-tour="sources-active-composed-tree"
                    >
                        <p className="arborito-sources-active-pin__label">
                            {ui.sourcesActiveTreeHeading || ui.sourceActive || 'Active tree'}
                        </p>
                        <SourcesComposedTreeRow
                            tree={activeEntry}
                            ui={ui}
                            activeSource={activeSource}
                            pinned
                            actionsOpen={rowActionsOpen}
                            globalDirMetrics={globalDirMetrics}
                            onAction={onAction}
                            onToggleRowActions={onToggleRowActions}
                        />
                        {treeLoading ? (
                            <p className="mt-2 px-1 text-xs text-violet-700 dark:text-violet-300">
                                {ui.sourcesComposedTreeHydratingHint ||
                                    ui.treeHydratingHint ||
                                    ui.loading ||
                                    'Loading…'}
                            </p>
                        ) : null}
                    </div>
                ) : null}
                {loading && !activeEntry ? (
                    <p className="text-xs text-slate-500">{ui.loading || 'Loading…'}</p>
                ) : null}
                {listEmpty ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">
                        {ui.sourcesTreesEmpty || 'Create a tree by combining branches.'}
                    </p>
                ) : (
                    <>
                        {activeEntry && items.length ? (
                            <div className="arborito-sources-list-divider">
                                <span>{ui.sourcesOtherTreesListHeading || 'Other trees'}</span>
                            </div>
                        ) : null}
                        <div className="space-y-3">
                            {items.map((it, idx) => {
                                if (it.kind === 'device') {
                                    return (
                                        <SourcesComposedTreeRow
                                            key={`tree-${it.data.tree?.id}-${idx}`}
                                            tree={it.data.tree}
                                            ui={ui}
                                            activeSource={activeSource}
                                            actionsOpen={rowActionsOpen}
                                            globalDirMetrics={globalDirMetrics}
                                            onAction={onAction}
                                            onToggleRowActions={onToggleRowActions}
                                        />
                                    );
                                }
                                if (it.kind === 'saved') {
                                    return (
                                        <SourcesSavedRow
                                            key={`saved-${it.data.source?.id}-${idx}`}
                                            source={it.data.source}
                                            ui={ui}
                                            isActive={false}
                                            actionsOpen={rowActionsOpen}
                                            freezeBusy={collectCtx.treeFreezeBusy}
                                            onAction={onAction}
                                            onToggleRowActions={onToggleRowActions}
                                            onToggleFreeze={(id) =>
                                                onAction('toggle-tree-freeze', { id })
                                            }
                                        />
                                    );
                                }
                                const { row, metrics } = it.data;
                                const dupNote =
                                    it.dupNote > 0
                                        ? String(
                                              ui.sourcesSimilarTreesCollapsed ||
                                                  '{{n}} more with the same branches'
                                          ).replace(/\{\{n\}\}/g, String(it.dupNote))
                                        : null;
                                return (
                                    <div key={`net-${row?.ownerPub}-${row?.universeId}-${idx}`}>
                                        <SourcesInternetRow
                                            row={row}
                                            metrics={metrics}
                                            ui={ui}
                                            actionsOpen={rowActionsOpen}
                                            onAction={onAction}
                                            onToggleRowActions={onToggleRowActions}
                                            onVote={({ ownerPub, universeId }) =>
                                                onAction('global-vote', {
                                                    ownerPub,
                                                    universeId,
                                                    vote: 'up',
                                                })
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
                                        {dupNote ? (
                                            <p className="m-0 mt-2 text-[10px] font-semibold text-violet-600 dark:text-violet-300">
                                                {dupNote}
                                            </p>
                                        ) : null}
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
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

export { composedTreeRowKey };
