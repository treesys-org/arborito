import { useVersionUpdates } from '../hooks/useVersionUpdates.js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { fileSystem } from '../../backup-export/api/filesystem.js';
import {
    createReleaseVersion,
    deleteReleaseVersion,
} from '../api/releases-service.js';
import { _ensureSnapshotsAdminLoaded } from '../api/snapshots-admin.js';
import { applyLocalDraftSwitch, flushBeforeLocalVersionSwitch } from '../api/version-switch-logic.js';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';
import {
    CURRICULUM_SWITCHER_SNAP_CREATE_ID,
    CURRICULUM_SWITCHER_SNAP_DEL_CLASS,
    CURRICULUM_SWITCHER_SNAP_INP_ID,
    CURRICULUM_SWITCHER_SNAP_ITEM_CLASS,
    CURRICULUM_SWITCHER_SNAP_SEARCH_ID,
    TREE_SWITCHER_PANEL_ID,
} from '../../tree-graph/api/logic/graph-mobile-shared.js';
import { ConfirmNestedSheet } from '../../../shared/ui/ConfirmNestedSheet.jsx';
import { modalCtaConfirmFull } from '../../../shared/ui/modal-action-chrome.js';

const LIST_CAP = 120;

/** Construction-mode snapshot create/delete block in the curriculum switcher. */
export function SnapshotsAdmin({ engine }) {
    const version = useVersionUpdates();
    const { ui, notify, constructionMode, alert, notifyCurriculumSwitcherUpdate, activeSource, loadData } =
        version;
    const isConstruct = !!constructionMode;
    const canWrite = !!fileSystem.features.canWrite;

    const [query, setQuery] = useState(() => String(engine?._snapAdminQuery || ''));
    const [newTag, setNewTag] = useState(() => String(engine?._snapAdminNewTag || ''));
    const [deleteTarget, setDeleteTarget] = useState(() =>
        String(engine?._snapAdminDeleteTarget || '').trim() || null
    );
    const [switchingId, setSwitchingId] = useState(null);

    const onLiveDraft =
        activeSource?.type !== 'archive' && activeSource?.localArchiveReleaseId == null;
    const isSnapshotActive = useCallback(
        (id) =>
            activeSource?.type === 'archive' &&
            String(activeSource?.localArchiveReleaseId || '') === String(id),
        [activeSource]
    );

    const onSelectSnapshot = useCallback(
        async (id) => {
            const snapId = String(id || '').trim();
            if (!snapId || isSnapshotActive(snapId) || switchingId) return;
            const activeUrl = String(activeSource?.url || '');
            let branchId = '';
            if (activeUrl.startsWith('branch://')) {
                branchId = activeUrl.slice('branch://'.length).split('/')[0];
            } else if (activeSource?.type === 'composed-tree') {
                branchId = String(fileSystem.localGardenTreeId() || '').trim();
            }
            if (!branchId) return;
            setSwitchingId(snapId);
            try {
                const flushed = await flushBeforeLocalVersionSwitch();
                if (!flushed) return;
                const composedId =
                    activeSource?.type === 'composed-tree'
                        ? String(fileSystem.composedTreeId() || '').trim()
                        : String(activeSource?.returnComposedTreeId || '').trim();
                const baseName = String(activeSource.name || '').split(' (')[0] || branchId;
                const newSource = {
                    id: `${branchId}-${snapId}`,
                    name: `${baseName} (${snapId})`,
                    url: `branch://${branchId}`,
                    type: 'archive',
                    localArchiveReleaseId: snapId,
                    isTrusted: true,
                    ...(composedId ? { returnComposedTreeId: composedId } : {}),
                };
                await loadData(newSource, true);
                notifyCurriculumSwitcherUpdate();
            } finally {
                setSwitchingId(null);
            }
        },
        [activeSource, isSnapshotActive, loadData, notifyCurriculumSwitcherUpdate, switchingId]
    );

    const onSelectLiveDraft = useCallback(async () => {
        if (onLiveDraft || switchingId) return;
        setSwitchingId('__draft__');
        try {
            const flushed = await flushBeforeLocalVersionSwitch();
            if (!flushed) return;
            await applyLocalDraftSwitch();
            notifyCurriculumSwitcherUpdate();
        } finally {
            setSwitchingId(null);
        }
    }, [notifyCurriculumSwitcherUpdate, onLiveDraft, switchingId]);

    const loading = !!engine?._snapAdminLoading;
    const creating = !!engine?._snapAdminCreating;
    const itemsAll = Array.isArray(engine?._snapAdminItems) ? engine._snapAdminItems : [];

    useEffect(() => {
        if (!engine) return;
        engine._snapAdminQuery = query;
        engine._snapAdminNewTag = newTag;
        engine._snapAdminDeleteTarget = deleteTarget;
    }, [engine, query, newTag, deleteTarget]);

    const filtered = useMemo(() => {
        const sq = String(query || '').trim().toLowerCase();
        const base = sq
            ? itemsAll.filter((it) => String(it?.id || '').toLowerCase().includes(sq))
            : itemsAll;
        const truncated = base.length > LIST_CAP;
        return {
            items: truncated ? base.slice(0, LIST_CAP) : base,
            truncated,
        };
    }, [itemsAll, query]);

    const onCreate = useCallback(async () => {
        const raw = String(newTag || '').trim();
        const tag = raw.replace(/[^a-z0-9.\-_]/gi, '');
        if (!tag) {
            notify(ui.releasesVersionNameRequired || ui.treeNameRequired || 'Enter a version tag.', true);
            return;
        }
        if (engine._snapAdminCreating) return;
        engine._snapAdminCreating = true;
        notifyCurriculumSwitcherUpdate();

        const prev = Array.isArray(engine._snapAdminItems) ? engine._snapAdminItems : [];
        if (!prev.find((x) => String(x.id) === String(tag))) {
            engine._snapAdminItems = [
                { id: tag, name: `${ui.releasesSnapshot || 'Snapshot'} ${tag}`, url: null, isRemote: false },
                ...prev,
            ];
        }
        notifyCurriculumSwitcherUpdate();

        try {
            const result = await createReleaseVersion(tag, true);
            if (result?.cancelled) return;
            setNewTag('');
        } catch (err) {
            alert(
                (ui.releasesVersionCreateError || 'Error creating version: {message}').replace(
                    '{message}',
                    err?.message || String(err)
                )
            );
        } finally {
            engine._snapAdminCreating = false;
            await _ensureSnapshotsAdminLoaded(engine);
        }
    }, [engine, newTag, ui]);

    const onConfirmDelete = useCallback(async () => {
        const id = String(deleteTarget || '').trim();
        if (!id) return;
        try {
            await deleteReleaseVersion(id);
        } catch (err) {
            alert(
                (ui.releasesArchiveDeleteError || 'Error deleting archive: {message}').replace(
                    '{message}',
                    err?.message || String(err)
                )
            );
        } finally {
            setDeleteTarget(null);
            await _ensureSnapshotsAdminLoaded(engine);
        }
    }, [deleteTarget, engine, ui]);

    if (!isConstruct || !canWrite) return null;

    const title = ui.releasesSnapshotsSectionTitle || ui.releasesSnapshot || 'Saved snapshots';
    const nameLabel = ui.releasesVersionNameLabel || 'Version name';
    const createLabel = ui.releasesCreate || 'Create snapshot';
    const hint = ui.releasesCreateFormHintShort || ui.releasesCreateFormHint || '';
    const truncHint =
        ui.curriculumSwitcherTruncBrowseHint ||
        ui.sourcesUnifiedListTruncBody ||
        'Showing first matches only. Narrow your search.';

    /* Portal onto the switcher panel so the confirm is not clipped by the scroll body. */
    const deleteConfirm = deleteTarget ? (
        <ConfirmNestedSheet
            title={ui.releasesConfirmDeleteTitle || ui.releasesDeleteVersion || 'Delete version'}
            body={String(
                (ui.releasesConfirmDeleteBody || "Are you sure you want to remove '{version}'?").replace(
                    '{version}',
                    deleteTarget
                )
            )}
            cancelLabel={ui.cancel || 'Cancel'}
            confirmLabel={ui.releasesDeleteVersion || ui.graphDelete || 'Delete version'}
            onCancel={() => setDeleteTarget(null)}
            onConfirm={() => void onConfirmDelete()}
        />
    ) : null;
    const deleteHost =
        typeof document !== 'undefined'
            ? document.getElementById(TREE_SWITCHER_PANEL_ID) ||
              document.querySelector('#arborito-tree-switcher-backdrop .arborito-dock-hub-shell') ||
              document.querySelector('.arborito-tree-switcher-sheet')
            : null;
    const deleteSheet =
        deleteConfirm && deleteHost ? createPortal(deleteConfirm, deleteHost) : deleteConfirm;

    return (
        <div
            id="arborito-curriculum-switcher-snapshots-admin"
            className="arborito-curriculum-switcher-block"
        >
            <div className="arborito-curriculum-switcher-block__head">
                <p className="arborito-curriculum-switcher-block__title">{title}</p>
                <span className="arborito-curriculum-switcher-block__sub">{ui.navConstruct || 'Construction'}</span>
            </div>
            <div className="arborito-tree-switcher-search-row">
                <input
                    id={CURRICULUM_SWITCHER_SNAP_SEARCH_ID}
                    type="search"
                    autoComplete="off"
                    value={query}
                    placeholder={ui.treeSwitcherSearchPh || 'Search…'}
                    className="arborito-tree-switcher-search"
                    disabled={creating}
                    onChange={(e) => setQuery(e.target.value || '')}
                />
            </div>
            <div className="arborito-curriculum-switcher-snap-create">
                <label className="arborito-curriculum-switcher-snap-label" htmlFor={CURRICULUM_SWITCHER_SNAP_INP_ID}>
                    {nameLabel}
                </label>
                <input
                    id={CURRICULUM_SWITCHER_SNAP_INP_ID}
                    type="text"
                    className="arborito-curriculum-switcher-snap-input"
                    value={newTag}
                    placeholder={ui.releasesVersionPlaceholder || 'e.g. v2.0'}
                    autoComplete="off"
                    disabled={creating}
                    onChange={(e) => setNewTag(e.target.value || '')}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !creating) {
                            e.preventDefault();
                            void onCreate();
                        }
                    }}
                />
                <button
                    type="button"
                    id={CURRICULUM_SWITCHER_SNAP_CREATE_ID}
                    className={`arborito-curriculum-switcher-snap-create-btn ${modalCtaConfirmFull('emerald')}`}
                    disabled={creating}
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void onCreate();
                    }}
                >
                    {creating ? ui.loading || 'Loading…' : createLabel}
                </button>
                {hint ? <p className="arborito-curriculum-switcher-hint">{hint}</p> : null}
            </div>
            {loading ? (
                <div className="arborito-curriculum-switcher-empty">{ui.loading || 'Loading…'}</div>
            ) : (
                <div className="arborito-curriculum-switcher-rows">
                    <button
                        type="button"
                        className={`arborito-curriculum-switcher-row arborito-curriculum-switcher-snap-draft${onLiveDraft ? ' is-active' : ''}`}
                        disabled={!!switchingId || creating}
                        aria-current={onLiveDraft ? 'true' : undefined}
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void onSelectLiveDraft();
                        }}
                    >
                        <span className="arborito-curriculum-switcher-row__left">
                            <span className="arborito-curriculum-switcher-row__ic" aria-hidden="true">
                                <ChromeEmoji emoji="🌿" size={18} />
                            </span>
                            <span>
                                {ui.releasesLocalDraftShort ||
                                    ui.releasesLiveSimple ||
                                    ui.releasesStateLiveShort ||
                                    'Current draft'}
                            </span>
                        </span>
                        {onLiveDraft ? (
                            <span className="arborito-curriculum-switcher-row__right" aria-hidden="true">
                                ✔
                            </span>
                        ) : null}
                    </button>
                    {filtered.items.length ? (
                        filtered.items.map((it) => {
                            const id = String(it.id);
                            const active = isSnapshotActive(id);
                            const delLabel = `${ui.releasesDeleteVersion || ui.graphDelete || 'Delete'} ${id}`;
                            const selectLabel = `${ui.releasesSwitchToVersion || ui.treeSwitcherTabVersions || 'Switch to'} ${id}`;
                            return (
                                <div
                                    key={id}
                                    className={`arborito-curriculum-switcher-row arborito-curriculum-switcher-snap-item-row${active ? ' is-active' : ''} ${CURRICULUM_SWITCHER_SNAP_ITEM_CLASS}`}
                                    data-id={id}
                                >
                                    <button
                                        type="button"
                                        className="arborito-curriculum-switcher-snap-select"
                                        disabled={!!switchingId || creating}
                                        aria-label={selectLabel}
                                        title={selectLabel}
                                        aria-current={active ? 'true' : undefined}
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            void onSelectSnapshot(id);
                                        }}
                                    >
                                        <span className="arborito-curriculum-switcher-row__left">
                                            <span className="arborito-curriculum-switcher-row__ic" aria-hidden="true">
                                                <ChromeEmoji emoji="📦" size={18} />
                                            </span>
                                            <span>{id}</span>
                                        </span>
                                        {active ? (
                                            <span className="arborito-curriculum-switcher-row__right" aria-hidden="true">
                                                ✔
                                            </span>
                                        ) : null}
                                    </button>
                                    <button
                                        type="button"
                                        className={CURRICULUM_SWITCHER_SNAP_DEL_CLASS}
                                        aria-label={delLabel}
                                        title={delLabel}
                                        disabled={!!switchingId || creating}
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setDeleteTarget(id);
                                        }}
                                    >
                                        <ChromeEmoji emoji="🗑️" size={16} />
                                    </button>
                                </div>
                            );
                        })
                    ) : (
                        <div className="arborito-curriculum-switcher-empty">{ui.releasesEmpty || 'No snapshots found.'}</div>
                    )}
                </div>
            )}
            {filtered.truncated ? (
                <div className="arborito-curriculum-switcher-hint">{truncHint}</div>
            ) : null}
            {deleteSheet}
        </div>
    );
}
