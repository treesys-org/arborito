import { useEffect, useMemo, useState } from 'react';
import { useSources } from '../../hooks/useSources.js';
import { SOURCES_UNIFIED_DISPLAY_CAP } from '../../../p2p-webtorrent/api/directory-index-config.js';
import {
    ensurePublishedTreeMetrics,
    ensureSavedSourcesMetrics,
} from '../../api/modals/logic/sources-directory-fetch.js';
import { collectForestTabItems } from '../../api/modals/logic/sources-collect-forest.js';
import { findCommunitySourceByUrl } from '../../api/modals/logic/sources-helpers.js';
import { SourcesFilterChip } from './SourcesFilterChip.jsx';
import { SourcesComposedTreeRow, composedTreeRowKey } from './SourcesComposedTreeRow.jsx';
import { isPublishedResourceOwner } from '../../../publishing/api/published-owner.js';
import { SourcesSavedRow } from './SourcesSavedRow.jsx';
import { SourcesInternetRow } from './SourcesInternetRow.jsx';
import { SourcesLoadingPanel } from './SourcesLoadingPanel.jsx';

const TREES_LIST_PAGE = 24;

function resolveActiveComposedTreePin(state, activeSource, userStore) {
    if (!state?.data || !activeSource?.id) return null;
    if (activeSource.type === 'composed-tree' && activeSource.treeId) {
        const local = userStore?.getTree?.(activeSource.treeId);
        if (local) return { kind: 'device', tree: local };
    }
    const community = Array.isArray(state.communitySources) ? state.communitySources : [];
    const isTreeSaved = (s) => String(s?.contentKind || '').trim() === 'composed-tree';
    const byId = community.find((s) => String(s?.id) === String(activeSource.id));
    if (byId && isTreeSaved(byId)) return { kind: 'saved', source: byId };
    const url = String(activeSource?.url || '').trim();
    if (url) {
        const byUrl = findCommunitySourceByUrl(community, url);
        if (byUrl && isTreeSaved(byUrl)) return { kind: 'saved', source: byUrl };
    }
    if (activeSource.type === 'community' && isTreeSaved(activeSource)) {
        return { kind: 'saved', source: activeSource };
    }
    return null;
}

export function CrossTabActiveBanner({ ui, state, mainTab, onSwitchTab }) {
    const active = state.activeSource;
    if (!active?.id) return null;
    const onTrees = mainTab === 'trees';
    const activeIsTree =
        active.type === 'composed-tree' ||
        String(active.contentKind || '').trim() === 'composed-tree';
    if (onTrees && activeIsTree) return null;
    if (!onTrees && !activeIsTree) return null;
    const label = onTrees
        ? ui.sourcesActiveBranchHeading || 'Active branch'
        : ui.sourcesActiveTreeHeading || 'Active tree';
    const switchLbl = onTrees ? ui.sourcesTabBranches || 'Branches' : ui.sourcesTabTrees || ui.sourcesTabForest || 'Trees';
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

export function SourcesForestTab({
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
    bump,
    onAction,
    onToggleRowActions,
    onSwitchTab,
}) {
    const { userStore, getNostrPublisherPair } = useSources();
    const scope = String(treesScope || 'all');
    const q = String(treesQ || '');
    const activeSource = state.activeSource;

    const items = useMemo(
        () => collectForestTabItems(collectCtx, ui, state, activeSource, { scope, q }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [collectCtx, ui, state, activeSource, scope, q, globalDirRows, globalDirMetrics, bump]
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

    const curriculumLoading = !!sourcesTreeLoading || !!state.treeHydrating;
    const treeLoading = curriculumLoading;
    const activePin = useMemo(
        () => resolveActiveComposedTreePin(state, activeSource, userStore),
        [state, activeSource, userStore]
    );
    const activeEntry = activePin?.kind === 'device' ? activePin.tree : null;
    const activeSaved = activePin?.kind === 'saved' ? activePin.source : null;
    const loading = !!globalDirLoading && (scope === 'all' || scope === 'internet');
    const err = String(globalDirError || '').trim();
    const listEmpty = !items.length && !loading && !err && !activeEntry && !activeSaved;
    const [treesVisible, setTreesVisible] = useState(TREES_LIST_PAGE);

    useEffect(() => {
        setTreesVisible(TREES_LIST_PAGE);
    }, [scope, q, items.length]);

    const visibleItems = items.slice(0, treesVisible);
    const hasMoreTrees = items.length > treesVisible;

    return (
        <div className="pt-2 pb-1" data-arbor-tour="sources-trees-panel">
            <div className="sticky top-0 z-20 -mx-4 px-4 pb-3 arborito-sources-sticky-head">
                <div
                    className="p-3 rounded-2xl border border-violet-200/60 dark:border-violet-900/40 bg-white dark:bg-slate-950/30"
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
                                className="arborito-sources-action-chip flex-1 sm:flex-initial whitespace-nowrap"
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
                            isPublishedOwner={isPublishedResourceOwner(activeEntry, getNostrPublisherPair)}
                            actionsOpen={rowActionsOpen}
                            globalDirMetrics={globalDirMetrics}
                            onAction={onAction}
                            onToggleRowActions={onToggleRowActions}
                        />
                        {treeLoading ? (
                            <SourcesLoadingPanel
                                className="arborito-sources-loading-slot mt-2"
                                label={
                                    ui.sourcesComposedTreeHydratingHint ||
                                    ui.treeHydratingHint ||
                                    ui.loading ||
                                    'Loading…'
                                }
                            />
                        ) : null}
                    </div>
                ) : null}
                {activeSaved ? (
                    <div
                        className="arborito-sources-active-pin arborito-sources-active-pin--tree"
                        data-arbor-tour="sources-active-composed-tree"
                    >
                        <p className="arborito-sources-active-pin__label">
                            {ui.sourcesActiveTreeHeading || ui.sourceActive || 'Active tree'}
                        </p>
                        <SourcesSavedRow
                            source={activeSaved}
                            ui={ui}
                            isActive
                            pinned
                            actionsOpen={rowActionsOpen}
                            freezeBusy={collectCtx.treeFreezeBusy}
                            onAction={onAction}
                            onToggleRowActions={onToggleRowActions}
                            onToggleFreeze={(id) => onAction('toggle-tree-freeze', { id })}
                        />
                        {treeLoading ? (
                            <SourcesLoadingPanel
                                className="arborito-sources-loading-slot mt-2"
                                label={
                                    ui.sourcesComposedTreeHydratingHint ||
                                    ui.treeHydratingHint ||
                                    ui.loading ||
                                    'Loading…'
                                }
                            />
                        ) : null}
                    </div>
                ) : null}
                {curriculumLoading ? (
                    <SourcesLoadingPanel
                        className="arborito-sources-loading-slot"
                        label={
                            ui.sourcesComposedTreeHydratingHint ||
                            ui.treeHydratingHint ||
                            ui.loading ||
                            'Loading…'
                        }
                    />
                ) : null}
                {loading && !activeEntry && !activeSaved && !curriculumLoading ? (
                    <SourcesLoadingPanel
                        className="arborito-sources-loading-slot"
                        label={ui.loading || 'Loading…'}
                        tone="slate"
                    />
                ) : null}
                {listEmpty ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">
                        {ui.sourcesTreesEmpty || 'Create a tree by combining branches.'}
                    </p>
                ) : (
                    <>
                        {(activeEntry || activeSaved) && items.length ? (
                            <div className="arborito-sources-list-divider">
                                <span>{ui.sourcesOtherTreesListHeading || 'Other trees'}</span>
                            </div>
                        ) : null}
                        <div className="space-y-3">
                            {visibleItems.map((it, idx) => {
                                if (it.kind === 'device') {
                                    return (
                                        <SourcesComposedTreeRow
                                            key={`tree-${it.data.tree?.id}-${idx}`}
                                            tree={it.data.tree}
                                            ui={ui}
                                            activeSource={activeSource}
                                            isPublishedOwner={isPublishedResourceOwner(it.data.tree, getNostrPublisherPair)}
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
                            {hasMoreTrees ? (
                                <button
                                    type="button"
                                    className="w-full min-h-10 py-2 rounded-xl text-[11px] font-extrabold bg-violet-50 dark:bg-violet-950/40 text-violet-800 dark:text-violet-200 border border-violet-200 dark:border-violet-800"
                                    onClick={() => setTreesVisible((n) => n + TREES_LIST_PAGE)}
                                >
                                    {(ui.sourcesShowMoreTrees || 'Show more trees').replace(
                                        '{n}',
                                        String(Math.min(TREES_LIST_PAGE, items.length - treesVisible))
                                    )}
                                </button>
                            ) : null}
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
