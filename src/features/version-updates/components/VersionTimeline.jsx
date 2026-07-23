import { useVersionUpdates } from '../hooks/useVersionUpdates.js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';
import { fileSystem } from '../../backup-export/api/filesystem.js';
import {
    applyLiveSwitch,
    applyLocalDraftSwitch,
    applyReleaseSwitch,
    flushBeforeLocalVersionSwitch,
    releaseEditionKey,
    normalizeReleaseUrl,
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
                <span className="arborito-curriculum-switcher-row__ic" aria-hidden="true">
                    <ChromeEmoji emoji={emoji} size={18} />
                </span>
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
        engine?.afterVersionSwitchCloseMenu?.();
        onClose?.();
    }, [engine, onClose]);

    const onLocalSnapshotSelect = useCallback(
        async (id) => {
            const activeSource = version.activeSource;
            const activeUrl = String(activeSource?.url || '');
            if (!activeSource) return;
            let branchId = '';
            if (activeUrl.startsWith('branch://')) {
                branchId = activeUrl.slice('branch://'.length).split('/')[0];
            } else if (activeSource.type === 'composed-tree') {
                branchId = String(fileSystem.localGardenTreeId() || '').trim();
            }
            if (!branchId) return;
            if (
                activeSource.type === 'archive' &&
                String(activeSource.localArchiveReleaseId || '') === String(id)
            ) {
                return;
            }
            const flushed = await flushBeforeLocalVersionSwitch();
            if (!flushed) return;
            const composedId =
                activeSource.type === 'composed-tree'
                    ? String(fileSystem.composedTreeId() || '').trim()
                    : String(activeSource.returnComposedTreeId || '').trim();
            const baseName = String(activeSource.name || '').split(' (')[0] || branchId;
            const newSource = {
                id: `${branchId}-${id}`,
                name: `${baseName} (${id})`,
                url: `branch://${branchId}`,
                type: 'archive',
                localArchiveReleaseId: id,
                isTrusted: true,
                ...(composedId ? { returnComposedTreeId: composedId } : {}),
            };
            await loadData(newSource, true);
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
                ) : (
                    <div className="arborito-curriculum-switcher-rows">
                        <VersionRow
                            active={data.liveActive}
                            label={data.liveLabel}
                            emoji="🌿"
                            className="arborito-curriculum-switcher-row"
                            onSelect={async () => {
                                const flushed = await flushBeforeLocalVersionSwitch();
                                if (!flushed) return;
                                await applyLocalDraftSwitch();
                                closeAfterSwitch();
                            }}
                        />
                        {data.items.length ? (
                            data.items.map((item) => (
                                <VersionRow
                                    key={item.id}
                                    active={item.isActive}
                                    label={item.label}
                                    emoji="📦"
                                    className="arborito-curriculum-switcher-row arborito-curriculum-switcher-local-snap-item"
                                    dataAttrs={{ 'data-id': item.id }}
                                    onSelect={() => void onLocalSnapshotSelect(item.id)}
                                />
                            ))
                        ) : (
                            <div className="arborito-curriculum-switcher-empty">{data.emptyMessage}</div>
                        )}
                    </div>
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
                    onSelect={async () => {
                        await applyLiveSwitch();
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
                            onSelect={async () => {
                                await applyReleaseSwitch(release);
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
