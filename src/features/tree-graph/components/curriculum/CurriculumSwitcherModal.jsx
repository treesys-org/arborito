import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTreeGraph } from '../../hooks/useTreeGraph.js';
import { createPortal } from 'react-dom';
import { DockModalShell, ModalShell } from '../../../../app/components/ModalShell.jsx';
import { ModalHubHero } from '../../../../app/components/ModalHero.jsx';
import { shouldShowMobileUI } from '../../../../shared/ui/breakpoints.js';
import { LoadingBrandRing } from '../../../../shared/ui/Loading.jsx';
import { KindFilterChips } from '../../../sources/modals/components/KindFilterChips.jsx';
import {
    getVersionPresentation,
    switcherShowsVersionTab,
    switcherVersionTabLabel,
    switcherPanelTitle,
    curriculumTreeDisplayName,
    resolveActiveSourceVersionLabel,
} from '../../../version-updates/api/version-switch-logic.js';
import { VersionSwitcherPane } from '../../../version-updates/components/VersionSwitcherPane.jsx';
import {
    buildTreeSwitcherListData,
    treeSwitcherItemMeta,
} from '../../api/logic/curriculum-switcher-list.js';
import { useCurriculumSwitcherSnapshots } from '../../hooks/useCurriculumSwitcherSnapshots.jsx';
import {
    TREE_SWITCHER_BACKDROP_ID,
    TREE_SWITCHER_PANEL_ID,
    TREE_SWITCHER_ITEM_CLASS,
    TREE_SWITCHER_MORE_ID,
} from '../../api/logic/graph-mobile-shared.js';
import {
    TREE_SWITCHER_SHEET_HTML_CLASS,
    syncPanelSheetFullbleedClass,
} from '../../../../shared/ui/dock-sheet-chrome.js';
import { ChromeEmoji } from '../../../../app/components/ChromeEmoji.jsx';
import { modalCtaConfirmFull } from '../../../../shared/ui/modal-action-chrome.js';

function TreeSwitcherItem({ item, ui, showPill, onSelect }) {
    const { pill, pillCls, emoji, avatarCls } = treeSwitcherItemMeta(ui, item);
    return (
        <button
            type="button"
            className={`${TREE_SWITCHER_ITEM_CLASS}${item.isActive ? ' is-active' : ''}`}
            role="listitem"
            data-tree-id={item.id}
            data-tree-url={item.url}
            data-tree-kind={item.kind}
            data-tree-name={item.name}
            aria-current={item.isActive ? 'true' : undefined}
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onSelect(item);
            }}
        >
            <span className={avatarCls} aria-hidden="true">
                <ChromeEmoji emoji={emoji} size={22} />
            </span>
            <span className="arborito-tree-switcher-item-body">
                <span className="arborito-tree-switcher-item-name" title={item.name}>
                    {item.name}
                </span>
                {item.kind === 'composed-tree' && item.branchSummary ? (
                    <span className="arborito-tree-switcher-item-branches" title={item.branchSummary}>
                        {item.branchSummary}
                    </span>
                ) : null}
                {showPill && pill ? <span className={pillCls}>{pill}</span> : null}
            </span>
            {item.isActive ? (
                <span className="arborito-tree-switcher-item-check" aria-hidden="true">
                    ✓
                </span>
            ) : null}
        </button>
    );
}

function TreeSwitcherList({ ui, query, kindFilter, onSelect }) {
    const listData = useMemo(
        () => buildTreeSwitcherListData(query, kindFilter, ui),
        [query, kindFilter, ui]
    );

    if (listData.empty) {
        return <div className="arborito-tree-switcher-empty">{listData.emptyMessage}</div>;
    }

    return (
        <div id="arborito-tree-switcher-list" className="arborito-tree-switcher-list" role="list">
            <div className="arborito-tree-switcher-list-stack" role="list">
                {listData.grouped
                    ? listData.groups.map((group) => (
                          <div key={group.key}>
                              <p className="arborito-tree-switcher-section">{group.label}</p>
                              {group.items.map((item) => (
                                  <TreeSwitcherItem
                                      key={`${item.kind}-${item.id}`}
                                      item={item}
                                      ui={ui}
                                      showPill={false}
                                      onSelect={onSelect}
                                  />
                              ))}
                          </div>
                      ))
                    : listData.items.map((item) => (
                          <TreeSwitcherItem
                              key={`${item.kind}-${item.id}`}
                              item={item}
                              ui={ui}
                              showPill={listData.showPill}
                              onSelect={onSelect}
                          />
                      ))}
                {listData.truncated ? (
                    <div className="arborito-tree-switcher-empty arborito-tree-switcher-empty--trunc">
                        {listData.truncLine}
                    </div>
                ) : null}
            </div>
        </div>
    );
}

function CurriculumSwitcherSheet({ actionCtx, onClose }) {
    const tree = useTreeGraph();
    const { ui, loadData, update, setModal } = tree;
    const graphUi = tree.graphUi || {};
    const panelRef = useRef(null);
    const searchRef = useRef(null);
    const searchDebounceRef = useRef(null);
    const [query, setQuery] = useState('');
    const [kindFilter, setKindFilter] = useState(() => String(graphUi.treeSwitcherKindFilter || 'all'));

    const treesOnly = !!graphUi.curriculumSwitcherTreesOnly;
    const releases = tree.availableReleases || [];
    const src = tree.activeSource;
    const vp = getVersionPresentation(src, releases, ui);
    const showVersionTab = !treesOnly && switcherShowsVersionTab(vp, tree, actionCtx);
    const tab =
        showVersionTab && (graphUi.curriculumSwitcherTab === 'tree' || graphUi.curriculumSwitcherTab === 'version')
            ? graphUi.curriculumSwitcherTab
            : 'tree';
    const effectiveTab = showVersionTab ? tab : 'tree';
    const panelTitle =
        showVersionTab && !treesOnly
            ? ui.treeSwitcherUnifiedTitle || 'Branch & edition'
            : switcherPanelTitle(ui);
    const versionTabLabel = switcherVersionTabLabel(vp, ui);
    const showMoreTreesBtn = true;
    const activeTreeLabel = curriculumTreeDisplayName(ui);
    const activeVersionLabel = resolveActiveSourceVersionLabel(ui, tree) || vp.chipSub || '';
    const contextHint =
        effectiveTab === 'version'
            ? ui.treeSwitcherContextVersionHint ||
              ui.treeSwitcherContextVersion ||
              'Pick an edition or snapshot for the branch above.'
            : ui.treeSwitcherContextTreeHint ||
              ui.treeSwitcherContextTree ||
              'Pick which tree or branch to explore.';
    const hydrating = !!tree.treeHydrating;
    const mobUi = shouldShowMobileUI();

    useEffect(() => {
        if (graphUi.treeSwitcherKindFilter === kindFilter) return;
        tree.patchGraphUi({ treeSwitcherKindFilter: kindFilter });
    }, [kindFilter, graphUi.treeSwitcherKindFilter, tree]);

    useEffect(() => {
        if (!mobUi) return undefined;
        syncPanelSheetFullbleedClass(TREE_SWITCHER_SHEET_HTML_CLASS, true);
        return () => syncPanelSheetFullbleedClass(TREE_SWITCHER_SHEET_HTML_CLASS, false);
    }, [mobUi]);

    useCurriculumSwitcherSnapshots(actionCtx, { isLocal: vp.isLocal, isComposed: vp.isComposed });

    useEffect(() => {
        const inp = searchRef.current;
        if (!inp || effectiveTab !== 'tree') return undefined;
        try {
            inp.focus({ preventScroll: true });
        } catch {
            inp.focus();
        }
        return undefined;
    }, [effectiveTab]);

    const setTab = useCallback(
        (next) => {
            if (!showVersionTab) return;
            if (next !== 'tree' && next !== 'version') return;
            if (graphUi.curriculumSwitcherTab === next) return;
            tree.patchGraphUi({ curriculumSwitcherTab: next });
            tree.bumpGraphUiRevision();
        },
        [graphUi.curriculumSwitcherTab, showVersionTab, tree]
    );

    const onTreeSelect = useCallback(
        (item) => {
            if (tree.treeHydrating) return;
            if (!item.id || !item.url) return;
            if (item.isActive) {
                onClose();
                return;
            }
            update({ treeGrowingOverlay: true });
            if (item.kind === 'composed-tree') {
                tree.loadComposedTree(item.id);
            } else if (item.kind === 'branch') {
                loadData({ id: item.id, name: item.name, url: item.url, type: 'branch', isTrusted: true }, false);
            } else {
                const community = (tree.communitySources || []).find((s) => String(s.id) === String(item.id));
                loadData(community || { id: item.id, name: item.name, url: item.url, type: 'community' }, true);
            }
            onClose();
        },
        [loadData, onClose, tree, update]
    );

    const onSearchInput = (e) => {
        const next = e.target.value || '';
        if (searchDebounceRef.current != null) clearTimeout(searchDebounceRef.current);
        searchDebounceRef.current = setTimeout(() => {
            searchDebounceRef.current = null;
            setQuery(next);
        }, 140);
    };

    const hero = (
        <ModalHubHero
            ui={ui}
            mobile={mobUi}
            title={panelTitle}
            titleId="arborito-tree-switcher-heading"
            leadingIcon="🌳"
            backTagClass="arborito-tree-switcher-close"
            showClose={!mobUi}
            showBack={mobUi}
            trailingSpacer={false}
            onBack={onClose}
            onClose={onClose}
        />
    );

    const tabToolbar = showVersionTab ? (
            <div
                className="arborito-curriculum-switcher-tabs"
                role="tablist"
                aria-label={
                    ui.curriculumSwitcherTabsAria || ui.treeSwitcherUnifiedAria || 'Content or edition'
                }
            >
                <button
                    type="button"
                    className={`arborito-curriculum-switcher-tab${effectiveTab === 'tree' ? ' is-active' : ''}`}
                    data-tab="tree"
                    aria-pressed={effectiveTab === 'tree' ? 'true' : 'false'}
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setTab('tree');
                    }}
                >
                    {ui.treeSwitcherTabContent || 'Content'}
                </button>
                <button
                    type="button"
                    className={`arborito-curriculum-switcher-tab${effectiveTab === 'version' ? ' is-active' : ''}`}
                    data-tab="version"
                    aria-pressed={effectiveTab === 'version' ? 'true' : 'false'}
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setTab('version');
                    }}
                >
                    {versionTabLabel}
                </button>
            </div>
        ) : null;

    const contextStrip =
        showVersionTab ? (
            <div
                className="arborito-curriculum-switcher-context"
                role="status"
                aria-live="polite"
                data-tab={effectiveTab}
            >
                <p className="arborito-curriculum-switcher-context__eyebrow">
                    {effectiveTab === 'version'
                        ? ui.treeSwitcherContextVersionEyebrow || ui.releasesVersionsChip || 'Version'
                        : ui.treeSwitcherContextTreeEyebrow || ui.treeSwitcherTabContent || 'Content'}
                </p>
                <p className="arborito-curriculum-switcher-context__value">
                    {effectiveTab === 'version' ? activeVersionLabel : activeTreeLabel}
                </p>
                <p className="arborito-curriculum-switcher-context__hint">{contextHint}</p>
            </div>
        ) : null;

    const scrollBody = (
        <div
            className="arborito-curriculum-switcher-scroll flex-1 min-h-0 overflow-y-auto custom-scrollbar"
            data-tab={effectiveTab}
        >
            {showVersionTab ? (
                <div
                    className="arborito-switcher-pane arborito-switcher-pane--version"
                    role="tabpanel"
                    hidden={effectiveTab !== 'version' ? true : undefined}
                >
                    <VersionSwitcherPane engine={actionCtx} onClose={onClose} />
                </div>
            ) : null}
            <div className="arborito-switcher-pane arborito-switcher-pane--tree" role="tabpanel" hidden={effectiveTab === 'version' ? true : undefined}>
                <div className="arborito-curriculum-switcher-block">
                    <KindFilterChips
                        ui={ui}
                        kindFilter={kindFilter}
                        variant="switcher"
                        onChange={setKindFilter}
                    />
                    <div className="arborito-tree-switcher-search-row">
                        <input
                            ref={searchRef}
                            id="arborito-tree-switcher-search"
                            type="search"
                            autoComplete="off"
                            defaultValue={query}
                            placeholder={
                                ui.treeSwitcherSearchPh ||
                                ui.sourcesUnifiedSearchPlaceholder ||
                                'Search…'
                            }
                            className="arborito-tree-switcher-search"
                            aria-label={
                                ui.treeSwitcherSearchAria ||
                                ui.treeSwitcherSearchPh ||
                                ui.sourcesUnifiedSearchPlaceholder ||
                                'Search'
                            }
                            disabled={hydrating}
                            onInput={onSearchInput}
                        />
                        {hydrating ? (
                            <div
                                className="inline-flex items-center gap-2 arborito-tree-switcher-loading"
                                role="status"
                                aria-live="polite"
                                aria-busy="true"
                            >
                                <LoadingBrandRing size="sm" />
                                <span className="text-emerald-700 dark:text-emerald-300 text-xs font-medium">
                                    {ui.treeSwitcherChipLoading || ui.loading || 'Loading…'}
                                </span>
                            </div>
                        ) : null}
                    </div>
                    <TreeSwitcherList
                        ui={ui}
                        query={query}
                        kindFilter={kindFilter}
                        onSelect={onTreeSelect}
                    />
                </div>
            </div>
        </div>
    );

    const footer =
        showMoreTreesBtn && effectiveTab !== 'version' ? (
        <div className="arborito-modal-footer arborito-modal-footer--blend shrink-0 px-4 sm:px-6 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button
                type="button"
                id={TREE_SWITCHER_MORE_ID}
                className={`arborito-tree-switcher-more ${modalCtaConfirmFull('slate')}`}
                aria-label={ui.treeSwitcherMoreTrees || ui.sourcesOpen || 'More in library'}
                title={ui.treeSwitcherMoreTrees || ui.sourcesOpen || 'More in library'}
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onClose();
                    setModal('sources');
                }}
            >
                {ui.treeSwitcherMoreTrees || ui.sourcesOpen || 'More in library'}
            </button>
        </div>
    ) : null;

    const panelInner = (
        <div
            className={`${mobUi ? 'arborito-tree-switcher-sheet' : 'arborito-tree-switcher-panel is-open arborito-tree-switcher-panel--portaled'} flex flex-col flex-1 min-h-0 w-full min-w-0 overflow-hidden`}
            data-tab={effectiveTab}
        >
            {contextStrip}
            {scrollBody}
        </div>
    );

    if (mobUi) {
        return (
            <DockModalShell
                mobile
                skipBodyWrap
                hero={hero}
                toolbar={tabToolbar}
                footer={footer}
                shellOpts={{
                    rootFlags: 'arborito-modal--tree-switcher',
                    backdropId: TREE_SWITCHER_BACKDROP_ID,
                    panelClass: 'arborito-modal-dock-panel w-full max-h-full min-h-0',
                }}
                onBackdropClick={onClose}
            >
                {panelInner}
            </DockModalShell>
        );
    }

    return (
        <ModalShell
            mobile={false}
            bareBackdrop
            shellOpts={{
                rootFlags: 'arborito-modal--tree-switcher',
                backdropId: TREE_SWITCHER_BACKDROP_ID,
                z: 180,
                scrim: 'translucent-strong',
                enter: 'fade',
            }}
            onBackdropClick={onClose}
        >
            <div
                ref={panelRef}
                id={TREE_SWITCHER_PANEL_ID}
                className="arborito-tree-switcher-panel is-open arborito-tree-switcher-panel--portaled"
                data-tab={effectiveTab}
                role="dialog"
                aria-modal="true"
                aria-labelledby="arborito-tree-switcher-heading"
            >
                <div className="arborito-tree-switcher-head">
                    {hero}
                    {tabToolbar}
                    {contextStrip}
                </div>
                {scrollBody}
                {footer}
            </div>
        </ModalShell>
    );
}

/**
 * Bottom-sheet curriculum switcher, replaces imperative panel innerHTML.
 */
export function CurriculumSwitcherModal({ rootRef }) {
    const tree = useTreeGraph();
    const graphUi = tree.graphUi || {};
    const open = !!graphUi.treeSwitcherOpen;
    const actionCtx = useMemo(
        () => (open ? tree.getGraphActionContext(rootRef?.current ?? null) : null),
        [open, tree.getGraphActionContext, rootRef]
    );

    const onClose = useCallback(() => {
        tree.closeUnifiedCurriculumSwitcher();
    }, [tree]);

    if (!open || typeof document === 'undefined') return null;

    return createPortal(<CurriculumSwitcherSheet actionCtx={actionCtx} onClose={onClose} />, document.body);
}
