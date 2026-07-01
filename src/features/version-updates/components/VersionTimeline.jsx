import { useVersionUpdates } from '../hooks/useVersionUpdates.js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    applyLiveSwitch,
    applyReleaseSwitch,
} from '../api/version-switch-logic.js';
import { getVersionTimelineData } from '../api/logic/version-timeline-data.js';
import {
    CURRICULUM_SWITCHER_VERSION_ITEM_CLASS,
    CURRICULUM_SWITCHER_VERSION_LIVE_ID,
    CURRICULUM_SWITCHER_VERSION_SEARCH_ID,
} from '../../tree-graph/api/logic/graph-mobile-shared.js';

function VersionRow({ active, label, emoji, onSelect, className = 'arborito-curriculum-switcher-row', dataAttrs = {} }) {
    return (
        <button
            type="button"
            className={`${className}${active ? ' is-active' : ''}`}
            aria-label={label}
            title={label}
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onSelect?.();
            }}
            {...dataAttrs}
        >
            <span className="arborito-curriculum-switcher-row__left">
                <span aria-hidden="true">{emoji}</span>
                <span>{label}</span>
            </span>
            {active ? (
                <span className="arborito-curriculum-switcher-row__right" aria-hidden="true">
                    ✔
                </span>
            ) : null}
        </button>
    );
}

function VersionTimelineBlock({ blockId, title, subtitle, query, onQueryChange, searchPlaceholder, children, footer }) {
    return (
        <div id={blockId} className="arborito-curriculum-switcher-block">
            <div className="arborito-curriculum-switcher-block__head">
                <p className="arborito-curriculum-switcher-block__title">{title}</p>
                <span className="arborito-curriculum-switcher-block__sub">{subtitle}</span>
            </div>
            <div className="arborito-tree-switcher-search-row">
                <input
                    id={CURRICULUM_SWITCHER_VERSION_SEARCH_ID}
                    type="search"
                    autoComplete="off"
                    value={query}
                    placeholder={searchPlaceholder}
                    className="arborito-tree-switcher-search"
                    onChange={(e) => onQueryChange(e.target.value || '')}
                />
            </div>
            {children}
            {footer}
        </div>
    );
}

/** Edition / local snapshot picker inside the curriculum switcher version tab. */
export function VersionTimeline({ engine, onClose }) {
    const version = useVersionUpdates();
    const { ui, loadData } = version;
    const state = version;
    const [query, setQuery] = useState(() => String(engine?._versionSwitcherQuery || ''));

    const data = useMemo(
        () => getVersionTimelineData(engine, state, ui),
        [
            engine,
            state,
            ui,
            query,
            state.activeSource,
            state.availableReleases,
            state.constructionMode,
            engine?._localSnapItems,
            engine?._localSnapLoading,
        ]
    );

    useEffect(() => {
        if (engine) engine._versionSwitcherQuery = query;
    }, [engine, query]);

    const closeAfterSwitch = useCallback(() => {
        if (typeof engine?.afterVersionSwitchCloseMenu === 'function') {
            engine.afterVersionSwitchCloseMenu();
        } else {
            engine._treeSwitcherOpen = false;
            engine?.refreshCurriculumChrome?.();
        }
        onClose?.();
    }, [engine, onClose]);

    const onLocalSnapshotSelect = useCallback(
        async (id) => {
            const activeSource = version.activeSource;
            const activeUrl = String(activeSource?.url || '');
            if (!activeSource || !activeUrl.startsWith('branch://')) return;
            const branchId = activeUrl.slice('branch://'.length).split('/')[0];
            if (!branchId) return;
            const newSource = {
                ...activeSource,
                id: `${branchId}-${id}`,
                name: `${(activeSource.name || '').split(' (')[0]} (${id})`,
                url: `branch://${branchId}`,
                type: 'archive',
                localArchiveReleaseId: id,
            };
            await loadData(newSource);
            closeAfterSwitch();
        },
        [closeAfterSwitch, loadData, version.activeSource]
    );

    if (data.mode === 'hidden') return null;

    const onQueryChange = (next) => setQuery(next);

    if (data.mode === 'local') {
        return (
            <VersionTimelineBlock
                blockId="arborito-curriculum-switcher-version-block"
                title={data.title}
                subtitle={data.subtitle}
                query={data.query}
                onQueryChange={onQueryChange}
                searchPlaceholder={data.searchPlaceholder}
                footer={
                    data.truncated ? (
                        <div className="arborito-curriculum-switcher-hint">{data.truncHint}</div>
                    ) : null
                }
            >
                {data.loading ? (
                    <div className="arborito-curriculum-switcher-empty">{ui.loading || 'Loading…'}</div>
                ) : data.items.length ? (
                    <div className="arborito-curriculum-switcher-rows">
                        {data.items.map((item) => (
                            <VersionRow
                                key={item.id}
                                active={item.isActive}
                                label={item.label}
                                emoji="📦"
                                className="arborito-curriculum-switcher-row arborito-curriculum-switcher-local-snap-item"
                                dataAttrs={{ 'data-id': item.id }}
                                onSelect={() => void onLocalSnapshotSelect(item.id)}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="arborito-curriculum-switcher-empty">{data.emptyMessage}</div>
                )}
            </VersionTimelineBlock>
        );
    }

    return (
        <VersionTimelineBlock
            title={data.title}
            subtitle={data.subtitle}
            query={data.query}
            onQueryChange={onQueryChange}
            searchPlaceholder={data.searchPlaceholder}
            footer={
                <>
                    {data.truncated ? (
                        <div className="arborito-curriculum-switcher-hint">{data.truncHint}</div>
                    ) : null}
                    <div className="arborito-curriculum-switcher-hint">{data.hint}</div>
                </>
            }
        >
            <div className="arborito-curriculum-switcher-rows">
                <VersionRow
                    active={data.liveActive}
                    label={data.liveLabel}
                    emoji="🌊"
                    className={`arborito-curriculum-switcher-row`}
                    dataAttrs={{ id: CURRICULUM_SWITCHER_VERSION_LIVE_ID }}
                    onSelect={() => {
                        applyLiveSwitch();
                        closeAfterSwitch();
                    }}
                />
                {data.archives.length ? (
                    data.archives.map(({ release, label, isActive }) => (
                        <VersionRow
                            key={release.url || release.id || label}
                            active={isActive}
                            label={label}
                            emoji="📦"
                            className={`${CURRICULUM_SWITCHER_VERSION_ITEM_CLASS} arborito-curriculum-switcher-row`}
                            onSelect={() => {
                                applyReleaseSwitch(release);
                                closeAfterSwitch();
                            }}
                        />
                    ))
                ) : (
                    <div className="arborito-curriculum-switcher-empty">{data.emptyMessage}</div>
                )}
            </div>
        </VersionTimelineBlock>
    );
}
