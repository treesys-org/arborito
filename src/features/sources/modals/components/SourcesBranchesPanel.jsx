/** Branches tab list + filters in sources modal. */
import { useCallback, useDeferredValue, useEffect, useMemo, useState, startTransition } from 'react';
import { DEMO_BRANCH_ID, DEMO_BRANCH_UNIVERSE } from '../../../../core/demo/arborito-demo-ids.js';
import { shouldShowMobileUI } from '../../../../shared/ui/breakpoints.js';
import { useSources } from '../../hooks/useSources.js';
import { isPublishedResourceOwner } from '../../../publishing/api/published-owner.js';
import { parseNostrTreeUrl } from '../../../nostr/api/nostr-refs.js';
import { findCommunitySourceByUrl } from '../../api/modals/logic/sources-helpers.js';
import { SourcesBranchRow } from './SourcesBranchRow.jsx';
import { SourcesSavedRow } from './SourcesSavedRow.jsx';
import { SourcesInternetRow } from './SourcesInternetRow.jsx';
import { SourcesCatalogFilterBar } from './SourcesCatalogFilterBar.jsx';
import { CrossTabActiveBanner, resolveActiveComposedTreePin } from './SourcesForestTab.jsx';
import { SourcesComposedTreeRow } from './SourcesComposedTreeRow.jsx';
import { SourcesRowEnter } from './SourcesRowEnter.jsx';
import { useInfiniteScrollSentinel } from '../../../../shared/ui/useInfiniteScrollSentinel.js';
import { SourcesCatalogLoading } from './SourcesCatalogLoading.jsx';
import {
    DIRECTORY_CLIENT_FETCH_PAGE,
} from '../../../p2p-webtorrent/api/directory-index-config.js';
import { collectForestTabItems } from '../../api/modals/logic/sources-collect-forest.js';
import { collectBranchesTabItems } from '../../api/modals/logic/sources-collect-branches.js';
import { scoreSourcesMatch } from '../../api/modals/logic/sources-search-utils.js';

function pinMatchesSourcesQuery(q, ...haystacks) {
    if (!String(q || '').trim()) return true;
    return scoreSourcesMatch(q, ...haystacks) > 0;
}
/**
 * Active curriculum pin for Branches: local garden or saved/online community source.
 * List collect hides the active row; without this pin online branches vanish from the bosque.
 */
function resolveActiveBranchPin(state, activeSource, userStore) {
    if (!state?.data || !activeSource?.id) return null;
    if (activeSource.type === 'composed-tree') return null;
    if (String(activeSource.contentKind || '').trim() === 'composed-tree') return null;

    const branches = userStore?.state?.branches || [];
    const byId = branches.find((b) => String(b?.id) === String(activeSource.id));
    if (byId) return { kind: 'branch', branch: byId };

    const url = String(activeSource?.url || '').trim();
    const m = url.match(/^branch:\/\/(.+)$/);
    if (m) {
        const local = branches.find((b) => String(b?.id) === m[1]);
        if (local) return { kind: 'branch', branch: local };
    }

    /* Bundled demo is the garden copy — pin local, not a network/saved twin. */
    const localDemo = branches.find((b) => String(b?.id) === DEMO_BRANCH_ID);
    if (localDemo) {
        try {
            const ref = parseNostrTreeUrl(url);
            if (ref && String(ref.universeId || '').trim() === DEMO_BRANCH_UNIVERSE) {
                return { kind: 'branch', branch: localDemo };
            }
        } catch {
            /* ignore */
        }
        if (String(activeSource.id) === DEMO_BRANCH_ID) {
            return { kind: 'branch', branch: localDemo };
        }
    }

    const community = Array.isArray(state.communitySources) ? state.communitySources : [];
    const isBranchSaved = (s) => String(s?.contentKind || '').trim() !== 'composed-tree';
    const byCommunityId = community.find((s) => String(s?.id) === String(activeSource.id));
    if (byCommunityId && isBranchSaved(byCommunityId)) {
        return { kind: 'saved', source: byCommunityId };
    }
    if (url) {
        const byUrl = findCommunitySourceByUrl(community, url);
        if (byUrl && isBranchSaved(byUrl)) return { kind: 'saved', source: byUrl };
    }

    /* Ephemeral open (not yet installed) — still pin so the active tree stays visible. */
    if (
        url &&
        (activeSource.type === 'community' ||
            !!parseNostrTreeUrl(url) ||
            /^https?:\/\//i.test(url))
    ) {
        return { kind: 'saved', source: activeSource };
    }
    return null;
}

export function SourcesBranchesPanel({
    ui,
    state,
    sourcesQ,
    setSourcesQ,
    sourcesScope,
    setSourcesScope,
    sourcesAdvancedOpen,
    setSourcesAdvancedOpen,
    sourcesKindFilter,
    setSourcesKindFilter,
    globalDirFilter,
    globalDirLoading,
    globalDirError,
    globalDirHitCap,
    globalDirMetrics,
    treeFreezeBusy,
    sourcesTreeLoading,
    rowActionsOpen,
    toggleRowActions,
    collectCtx,
    onAction,
    onSwitchTab,
    mainTab,
    mainTabs = null,
    onMainTabChange,
    onLoadMoreCatalog,
}) {
    const { userStore, getNostrPublisherPair } = useSources();
    const scope = String(sourcesScope || 'all');
    const q = String(sourcesQ || '');
    const kindFilter = String(sourcesKindFilter || 'all');
    const advancedOpen = !!sourcesAdvancedOpen;
    const dirFilter = String(globalDirFilter || 'discover');
    const activeSource = state.activeSource;
    /*
     * Tab chrome uses `mainTab` immediately; list collect follows a deferred scope
     * so Mis cursos ↔ Explorar paints the TabBar without waiting on Discover rows.
     */
    const listScopeInput =
        mainTab === 'explore'
            ? 'internet'
            : mainTab === 'mine'
              ? scope === 'saved' || scope === 'all' || scope === 'branch'
                  ? scope
                  : 'branch'
              : scope;
    const deferredMainTab = useDeferredValue(mainTab);
    const deferredScope = useDeferredValue(listScopeInput);
    const listMainTab = deferredMainTab;
    const listScope = deferredScope;
    const items = useMemo(() => {
        const wantBranches = kindFilter !== 'composed-tree';
        const wantPlaylists = kindFilter !== 'branch';
        const branchItems = wantBranches
            ? collectBranchesTabItems(collectCtx, ui, state, activeSource, {
                  scope: listScope,
                  q,
                  /* Mis cursos: playlist is the unit; hide network members unless Course filter. */
                  hidePlaylistMembers: listMainTab === 'mine' && kindFilter !== 'branch',
              })
            : [];
        const forestScope = listMainTab === 'explore' ? 'internet' : 'device';
        const playlistItems =
            wantPlaylists && collectCtx && (listMainTab === 'mine' || listMainTab === 'explore')
                ? collectForestTabItems(collectCtx, ui, state, activeSource, {
                      scope: forestScope,
                      q,
                  }).map((it) => ({ ...it, listGroup: 'playlist' }))
                : [];
        const taggedBranches = branchItems.map((it) => ({ ...it, listGroup: 'branch' }));
        return [...taggedBranches, ...playlistItems].sort(
            (a, b) => (Number(b.score) || 0) - (Number(a.score) || 0)
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        collectCtx,
        ui,
        state,
        activeSource,
        listScope,
        q,
        dirFilter,
        kindFilter,
        listMainTab,
    ]);
    const activePin = useMemo(
        () => resolveActiveBranchPin(state, activeSource, userStore),
        [state, activeSource, userStore]
    );
    const activePinForQuery = useMemo(() => {
        if (!activePin) return null;
        if (activePin.kind === 'branch') {
            const b = activePin.branch;
            return pinMatchesSourcesQuery(q, b?.name, b?.id, b?.description) ? activePin : null;
        }
        if (activePin.kind === 'saved') {
            const s = activePin.source;
            return pinMatchesSourcesQuery(q, s?.name, s?.url, s?.id, s?.description) ? activePin : null;
        }
        return activePin;
    }, [activePin, q]);
    const activePlaylistPin = useMemo(() => {
        if (listMainTab !== 'mine' && listMainTab !== 'explore') return null;
        if (kindFilter === 'branch') return null;
        return resolveActiveComposedTreePin(state, activeSource, userStore);
    }, [listMainTab, kindFilter, state, activeSource, userStore]);
    const activePlaylistPinForQuery = useMemo(() => {
        if (!activePlaylistPin) return null;
        if (activePlaylistPin.kind === 'device') {
            const t = activePlaylistPin.tree;
            return pinMatchesSourcesQuery(q, t?.name, t?.id) ? activePlaylistPin : null;
        }
        if (activePlaylistPin.kind === 'saved') {
            const s = activePlaylistPin.source;
            return pinMatchesSourcesQuery(q, s?.name, s?.url, s?.id) ? activePlaylistPin : null;
        }
        return activePlaylistPin;
    }, [activePlaylistPin, q]);
    const pageSize = shouldShowMobileUI() ? 12 : 24;
    const pagKey = `${listScope}|${q}|${dirFilter}|${kindFilter}|${listMainTab}`;
    const [shown, setShown] = useState(pageSize);
    useEffect(() => {
        setShown(pageSize);
    }, [pagKey, pageSize]);
    const visible = items.slice(0, Math.max(pageSize, shown));
    const remaining = Math.max(0, items.length - visible.length);
    const loading = !!globalDirLoading;
    const curriculumLoading = !!sourcesTreeLoading || !!state.treeHydrating;
    const err = String(globalDirError || '').trim();
    const showBranchChrome = kindFilter !== 'composed-tree';
    const showPlaylistChrome = kindFilter !== 'branch';

    /* Demo keeps tourTarget=sources-demo-branch; active non-demo pins render above it. */
    const demoFromPin =
        showBranchChrome &&
        activePinForQuery?.kind === 'branch' &&
        String(activePinForQuery.branch?.id) === DEMO_BRANCH_ID
            ? activePinForQuery.branch
            : null;
    const demoFromList = showBranchChrome
        ? visible.find(
              (it) => it.kind === 'branch' && String(it.data?.branch?.id) === DEMO_BRANCH_ID
          )
        : null;
    const demoBranch = demoFromPin || demoFromList?.data?.branch || null;
    /*
     * Only treat the demo as Active once the graph is actually mounted
     * (pin needs state.data). Boot/onboarding often sets activeSource early;
     * marking Active then hides the Open CTA mid-race.
     */
    const demoGraphReady = !!state?.data;
    const demoIsActive = !!(
        demoFromPin ||
        (demoGraphReady && demoFromList && demoFromList.data?.isActive) ||
        (demoGraphReady && demoBranch && String(activeSource?.id) === DEMO_BRANCH_ID)
    );
    const demoPinned = !!demoFromPin;
    const listWithoutDemo = visible.filter(
        (it) => !(it.kind === 'branch' && String(it.data?.branch?.id) === DEMO_BRANCH_ID)
    );
    const listEmpty =
        !listWithoutDemo.length &&
        !loading &&
        !err &&
        !(showBranchChrome && activePinForQuery) &&
        !demoBranch &&
        !(showPlaylistChrome && activePlaylistPinForQuery);
    const hasUserMineContent =
        listMainTab !== 'mine' ||
        !!(showPlaylistChrome && activePlaylistPinForQuery) ||
        !!(
            showBranchChrome &&
            activePinForQuery &&
            !(
                activePinForQuery.kind === 'branch' &&
                String(activePinForQuery.branch?.id) === DEMO_BRANCH_ID
            )
        ) ||
        items.some(
            (it) =>
                (it.kind === 'branch' &&
                    String(it.data?.branch?.id) !== DEMO_BRANCH_ID) ||
                it.kind === 'device' ||
                it.kind === 'saved' ||
                (it.kind === 'internet' && it.listGroup === 'playlist')
        );
    const showMineExploreCta = listMainTab === 'mine' && !err && !hasUserMineContent;
    const showMineSearchExploreCta =
        listMainTab === 'mine' &&
        !!String(q || '').trim() &&
        listEmpty &&
        !loading &&
        !curriculumLoading &&
        !err;

    const getScrollRoot = useCallback(
        () => document.getElementById('tab-content-scroll'),
        []
    );
    /* Only widen Discover from Explorar — never from Mis (even scope “Todos”). */
    const allowCatalogWiden =
        listMainTab === 'explore' && !!globalDirHitCap && !loading;
    /*
     * Prefetch ~one viewport ahead of the sentinel: grow the local window and,
     * once fewer than a screen of buffered rows remain, kick the next network
     * page before the user hits the bottom. Network busy must not freeze local
     * reveal while we still have rows in hand.
     */
    const onInfiniteMore = useCallback(() => {
        if (remaining > 0) {
            setShown((n) => n + pageSize);
            if (remaining <= pageSize && allowCatalogWiden) {
                onLoadMoreCatalog?.();
            }
            return;
        }
        if (allowCatalogWiden) {
            onLoadMoreCatalog?.();
            setShown((n) => n + Math.max(pageSize, DIRECTORY_CLIENT_FETCH_PAGE));
        }
    }, [remaining, pageSize, allowCatalogWiden, onLoadMoreCatalog]);
    const canLoadMore = remaining > 0 || allowCatalogWiden;
    const infiniteEnabled = canLoadMore || (loading && listMainTab === 'explore');
    const infiniteSentinelRef = useInfiniteScrollSentinel({
        enabled: infiniteEnabled,
        /* Keep revealing buffered rows while a background catalog widen runs. */
        busy: !!curriculumLoading || (!!loading && remaining <= 0),
        onLoadMore: onInfiniteMore,
        getScrollRoot,
        /* Assume the user will scroll a bit past the fold — fire early. */
        rootMargin: '70%',
        coolDownMs: 280,
        armKey: `${visible.length}|${items.length}|${pagKey}`,
    });
    const queryActive = !!String(q || '').trim();

    return (
        <div className="pt-0 pb-1 flex flex-col flex-1 min-h-full">
            <SourcesCatalogFilterBar
                ui={ui}
                q={q}
                onQueryChange={setSourcesQ}
                kindFilter={kindFilter}
                onKindChange={(id) => {
                    startTransition(() => setSourcesKindFilter?.(id));
                }}
                menuOpen={advancedOpen}
                onToggleMenu={() => setSourcesAdvancedOpen(!advancedOpen)}
                showSort={mainTab === 'explore'}
                dirFilter={dirFilter}
                onSort={(id) => onAction('global-filter', { filter: id })}
                showMineScope={mainTab === 'mine'}
                scope={scope}
                onScope={(id) => {
                    startTransition(() => setSourcesScope(id));
                }}
                mainTabs={mainTabs}
                mainTab={mainTab}
                onMainTabChange={onMainTabChange || onSwitchTab}
            />
            <div className="mt-4 space-y-3 px-4 pb-2 arborito-sources-list flex flex-col flex-1 min-h-0">
                <CrossTabActiveBanner
                    ui={ui}
                    state={state}
                    mainTab={mainTab}
                    onSwitchTab={onSwitchTab}
                />
                {err ? (
                    <p className="text-xs font-bold text-amber-800 dark:text-amber-200">{err}</p>
                ) : null}
                {/* Active non-demo / saved first; demo stays below unless it is the active pin. */}
                {showBranchChrome &&
                activePinForQuery?.kind === 'branch' &&
                String(activePinForQuery.branch?.id) !== DEMO_BRANCH_ID ? (
                    <div
                        className={`arborito-sources-active-pin${queryActive ? ' arborito-sources-active-pin--compact' : ''}`}
                        data-arbor-tour="sources-active-branch"
                    >
                        <p className="arborito-sources-active-pin__label">
                            {ui.sourcesActiveBranchHeading || ui.sourceActive || 'Active course'}
                        </p>
                        <SourcesBranchRow
                            branch={activePinForQuery.branch}
                            ui={ui}
                            isActive
                            pinned
                            compact={queryActive}
                            tourTarget="sources-active-branch"
                            isPublishedOwner={isPublishedResourceOwner(activePinForQuery.branch, getNostrPublisherPair)}
                            globalDirMetrics={globalDirMetrics}
                            actionsOpen={rowActionsOpen}
                            onAction={onAction}
                            onToggleRowActions={toggleRowActions}
                        />
                    </div>
                ) : null}
                {showBranchChrome && activePinForQuery?.kind === 'saved' ? (
                    <div
                        className={`arborito-sources-active-pin${queryActive ? ' arborito-sources-active-pin--compact' : ''}`}
                        data-arbor-tour="sources-active-branch"
                    >
                        <p className="arborito-sources-active-pin__label">
                            {ui.sourcesActiveBranchHeading || ui.sourceActive || 'Active course'}
                        </p>
                        <SourcesSavedRow
                            source={activePinForQuery.source}
                            ui={ui}
                            isActive
                            pinned
                            compact={queryActive}
                            actionsOpen={rowActionsOpen}
                            freezeBusy={treeFreezeBusy}
                            globalDirMetrics={globalDirMetrics}
                            onAction={onAction}
                            onToggleRowActions={toggleRowActions}
                            onToggleFreeze={(id) => onAction('toggle-tree-freeze', { id })}
                        />
                    </div>
                ) : null}
                {showPlaylistChrome && activePlaylistPinForQuery?.kind === 'device' ? (
                    <div
                        className={`arborito-sources-active-pin arborito-sources-active-pin--tree${queryActive ? ' arborito-sources-active-pin--compact' : ''}`}
                        data-arbor-tour="sources-active-composed-tree"
                    >
                        <p className="arborito-sources-active-pin__label">
                            {ui.sourcesActiveTreeHeading || ui.sourceActive || 'Active playlist'}
                        </p>
                        <SourcesComposedTreeRow
                            tree={activePlaylistPinForQuery.tree}
                            ui={ui}
                            activeSource={activeSource}
                            pinned
                            compact={queryActive}
                            isPublishedOwner={isPublishedResourceOwner(
                                activePlaylistPinForQuery.tree,
                                getNostrPublisherPair
                            )}
                            actionsOpen={rowActionsOpen}
                            globalDirMetrics={globalDirMetrics}
                            onAction={onAction}
                            onToggleRowActions={toggleRowActions}
                        />
                    </div>
                ) : null}
                {showPlaylistChrome && activePlaylistPinForQuery?.kind === 'saved' ? (
                    <div
                        className={`arborito-sources-active-pin arborito-sources-active-pin--tree${queryActive ? ' arborito-sources-active-pin--compact' : ''}`}
                        data-arbor-tour="sources-active-composed-tree"
                    >
                        <p className="arborito-sources-active-pin__label">
                            {ui.sourcesActiveTreeHeading || ui.sourceActive || 'Active playlist'}
                        </p>
                        <SourcesSavedRow
                            source={activePlaylistPinForQuery.source}
                            ui={ui}
                            isActive
                            pinned
                            compact={queryActive}
                            actionsOpen={rowActionsOpen}
                            freezeBusy={treeFreezeBusy}
                            globalDirMetrics={globalDirMetrics}
                            onAction={onAction}
                            onToggleRowActions={toggleRowActions}
                            onToggleFreeze={(id) => onAction('toggle-tree-freeze', { id })}
                        />
                    </div>
                ) : null}
                {demoBranch ? (
                    <div
                        className={
                            demoPinned
                                ? 'arborito-sources-active-pin'
                                : undefined
                        }
                        data-arbor-tour={demoPinned ? 'sources-active-branch' : undefined}
                    >
                        {demoPinned ? (
                            <p className="arborito-sources-active-pin__label">
                                {ui.sourcesActiveBranchHeading || ui.sourceActive || 'Active course'}
                            </p>
                        ) : null}
                        <SourcesBranchRow
                            branch={demoBranch}
                            ui={ui}
                            isActive={demoIsActive}
                            pinned={demoPinned}
                            tourTarget="sources-demo-branch"
                            isPublishedOwner={isPublishedResourceOwner(demoBranch, getNostrPublisherPair)}
                            globalDirMetrics={globalDirMetrics}
                            actionsOpen={rowActionsOpen}
                            onAction={onAction}
                            onToggleRowActions={toggleRowActions}
                        />
                    </div>
                ) : null}
                {showMineExploreCta && !showMineSearchExploreCta ? (
                    <div className="arborito-empty arborito-empty--card arborito-sources-mine-empty mt-1 flex-1 min-h-[12rem] justify-center">
                        <p className="arborito-empty__title">
                            {ui.sourcesUnifiedEmptyMine || 'No courses here yet'}
                        </p>
                        <p className="arborito-empty__body">
                            {ui.sourcesUnifiedEmptyMineBody ||
                                'Browse the network or create your own.'}
                        </p>
                        <button
                            type="button"
                            className="arborito-cta-sky mt-3 w-full max-w-sm min-h-12 px-4 py-3 rounded-xl text-sm font-extrabold shadow-lg"
                            onClick={() => onSwitchTab?.('explore')}
                        >
                            {ui.sourcesEmptyGoExplore || 'Explore courses'}
                        </button>
                    </div>
                ) : null}
                {showMineSearchExploreCta ? (
                    <div className="arborito-empty arborito-empty--card arborito-sources-mine-empty mt-1 flex-1 min-h-[12rem] justify-center">
                        <p className="arborito-empty__title">
                            {ui.sourcesEmptySearchMine || 'Nothing in My courses'}
                        </p>
                        <p className="arborito-empty__body">
                            {ui.sourcesEmptySearchMineBody ||
                                'Try the same search on Explore to look on the network.'}
                        </p>
                        <button
                            type="button"
                            className="arborito-cta-sky mt-3 w-full max-w-sm min-h-12 px-4 py-3 rounded-xl text-sm font-extrabold shadow-lg"
                            onClick={() => onSwitchTab?.('explore')}
                        >
                            {ui.sourcesEmptySearchGoExplore ||
                                ui.sourcesEmptyGoExplore ||
                                'Search on Explore'}
                        </button>
                    </div>
                ) : null}
                {loading && mainTab === 'explore' && !curriculumLoading && !listWithoutDemo.length ? (
                    <SourcesCatalogLoading ui={ui} count={3} />
                ) : null}
                {listEmpty && !demoBranch && !showMineExploreCta && !showMineSearchExploreCta ? (
                    <div className="arborito-empty arborito-empty--dashed">
                        {ui.sourcesUnifiedEmpty || 'No results.'}
                    </div>
                ) : (
                    <div className="space-y-3">
                        {(activePinForQuery || demoBranch) && listWithoutDemo.length ? (
                            <div className="arborito-sources-list-divider">
                                <span>{ui.sourcesOtherBranchesHeading || 'Other branches'}</span>
                            </div>
                        ) : null}
                        {listWithoutDemo.map((it, idx) => {
                            if (it.kind === 'device') {
                                return (
                                    <SourcesRowEnter
                                        key={`pl-tree-${it.data.tree?.id}-${idx}`}
                                        index={idx}
                                    >
                                        <SourcesComposedTreeRow
                                            tree={it.data.tree}
                                            ui={ui}
                                            activeSource={activeSource}
                                            isPublishedOwner={isPublishedResourceOwner(
                                                it.data.tree,
                                                getNostrPublisherPair
                                            )}
                                            actionsOpen={rowActionsOpen}
                                            globalDirMetrics={globalDirMetrics}
                                            onAction={onAction}
                                            onToggleRowActions={toggleRowActions}
                                        />
                                    </SourcesRowEnter>
                                );
                            }
                            if (it.kind === 'branch') {
                                return (
                                    <SourcesRowEnter key={`b-${it.data.branch?.id}-${idx}`} index={idx}>
                                        <SourcesBranchRow
                                            branch={it.data.branch}
                                            ui={ui}
                                            isActive={it.data.isActive}
                                            isPublishedOwner={isPublishedResourceOwner(it.data.branch, getNostrPublisherPair)}
                                            globalDirMetrics={globalDirMetrics}
                                            actionsOpen={rowActionsOpen}
                                            onAction={onAction}
                                            onToggleRowActions={toggleRowActions}
                                        />
                                    </SourcesRowEnter>
                                );
                            }
                            if (it.kind === 'saved') {
                                return (
                                    <SourcesRowEnter key={`s-${it.data.source?.id}-${idx}`} index={idx}>
                                        <SourcesSavedRow
                                            source={it.data.source}
                                            ui={ui}
                                            isActive={it.data.isActive}
                                            actionsOpen={rowActionsOpen}
                                            freezeBusy={treeFreezeBusy}
                                            globalDirMetrics={globalDirMetrics}
                                            onAction={onAction}
                                            onToggleRowActions={toggleRowActions}
                                            onToggleFreeze={(id) => onAction('toggle-tree-freeze', { id })}
                                        />
                                    </SourcesRowEnter>
                                );
                            }
                            return (
                                <SourcesRowEnter
                                    key={`i-${it.data.row?.ownerPub}-${it.data.row?.universeId}`}
                                    index={idx}
                                >
                                    <SourcesInternetRow
                                        row={it.data.row}
                                        localInfo={it.data.localInfo}
                                        metrics={it.data.metrics}
                                        ui={ui}
                                        actionsOpen={rowActionsOpen}
                                        onAction={onAction}
                                        onToggleRowActions={toggleRowActions}
                                        onVote={({ ownerPub, universeId, liked, votes }) =>
                                            onAction('global-vote', {
                                                ownerPub,
                                                universeId,
                                                vote: 'up',
                                                liked,
                                                votes,
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
                                </SourcesRowEnter>
                            );
                        })}
                    </div>
                )}
                {loading && mainTab === 'explore' && !curriculumLoading && listWithoutDemo.length > 0 ? (
                    <SourcesCatalogLoading ui={ui} count={1} compact />
                ) : null}
                {infiniteEnabled ? (
                    <div
                        ref={infiniteSentinelRef}
                        className="h-8 w-full shrink-0"
                        aria-hidden="true"
                    />
                ) : null}
            </div>
        </div>
    );
}
