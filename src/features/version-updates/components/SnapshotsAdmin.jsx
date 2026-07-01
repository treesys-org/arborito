import { useVersionUpdates } from '../hooks/useVersionUpdates.js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fileSystem } from '../../backup-export/api/filesystem.js';
import {
    createReleaseVersion,
    deleteReleaseVersion,
} from '../api/releases-service.js';
import { _ensureSnapshotsAdminLoaded } from '../api/snapshots-admin.js';
import {
    CURRICULUM_SWITCHER_SNAP_CREATE_ID,
    CURRICULUM_SWITCHER_SNAP_DEL_CLASS,
    CURRICULUM_SWITCHER_SNAP_INP_ID,
    CURRICULUM_SWITCHER_SNAP_ITEM_CLASS,
    CURRICULUM_SWITCHER_SNAP_SEARCH_ID,
} from '../../tree-graph/api/logic/graph-mobile-shared.js';

const LIST_CAP = 120;

/** Construction-mode snapshot create/delete block in the curriculum switcher. */
export function SnapshotsAdmin({ engine }) {
    const version = useVersionUpdates();
    const { ui, notify, constructionMode, alert, notifyCurriculumSwitcherUpdate } = version;
    const isConstruct = !!constructionMode;
    const canWrite = !!fileSystem.features.canWrite;

    const [query, setQuery] = useState(() => String(engine?._snapAdminQuery || ''));
    const [newTag, setNewTag] = useState(() => String(engine?._snapAdminNewTag || ''));
    const [deleteTarget, setDeleteTarget] = useState(() =>
        String(engine?._snapAdminDeleteTarget || '').trim() || null
    );

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
            await createReleaseVersion(tag, true);
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

    const title = ui.releasesSnapshot || 'Snapshots';
    const tagLabel = ui.releasesTag || ui.releasesCreate || 'Snapshots';
    const createLabel = ui.releasesCreate || 'Create';
    const hint = ui.releasesCreateFormHint || ui.releasesSwitchHint || '';
    const truncHint =
        ui.curriculumSwitcherTruncBrowseHint ||
        ui.sourcesUnifiedListTruncBody ||
        'Showing first matches only. Narrow your search.';

    return (
        <div
            id="arborito-curriculum-switcher-snapshots-admin"
            className="arborito-curriculum-switcher-block relative"
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
                    {tagLabel}
                </label>
                <div className="arborito-curriculum-switcher-snap-row">
                    <input
                        id={CURRICULUM_SWITCHER_SNAP_INP_ID}
                        type="text"
                        value={newTag}
                        placeholder={ui.releasesVersionPlaceholder || 'e.g. v2.0'}
                        autoComplete="off"
                        disabled={creating}
                        onChange={(e) => setNewTag(e.target.value || '')}
                    />
                    <button
                        type="button"
                        id={CURRICULUM_SWITCHER_SNAP_CREATE_ID}
                        disabled={creating}
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void onCreate();
                        }}
                    >
                        {creating ? ui.loading || 'Loading…' : createLabel}
                    </button>
                </div>
                {hint ? <p className="arborito-curriculum-switcher-hint">{hint}</p> : null}
            </div>
            {loading ? (
                <div className="arborito-curriculum-switcher-empty">{ui.loading || 'Loading…'}</div>
            ) : filtered.items.length ? (
                <div className="arborito-curriculum-switcher-rows">
                    {filtered.items.map((it) => {
                        const id = String(it.id);
                        const delLabel = `${ui.releasesDeleteVersion || ui.graphDelete || 'Delete'} ${id}`;
                        return (
                            <div
                                key={id}
                                className={`arborito-curriculum-switcher-row ${CURRICULUM_SWITCHER_SNAP_ITEM_CLASS}`}
                                data-id={id}
                            >
                                <span className="arborito-curriculum-switcher-row__left">
                                    <span aria-hidden="true">📦</span>
                                    <span>{id}</span>
                                </span>
                                <button
                                    type="button"
                                    className={CURRICULUM_SWITCHER_SNAP_DEL_CLASS}
                                    aria-label={delLabel}
                                    title={delLabel}
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setDeleteTarget(id);
                                    }}
                                >
                                    🗑️
                                </button>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="arborito-curriculum-switcher-empty">{ui.releasesEmpty || 'No snapshots found.'}</div>
            )}
            {filtered.truncated ? (
                <div className="arborito-curriculum-switcher-hint">{truncHint}</div>
            ) : null}
            {deleteTarget ? (
                <div className="absolute inset-0 bg-white/95 dark:bg-slate-900/95 flex items-center justify-center z-[120] animate-in fade-in rounded-2xl">
                    <div className="w-full max-w-xs text-center px-4">
                        <div className="text-4xl mb-4">⚠️</div>
                        <h3 className="text-lg font-black mb-2 dark:text-white">
                            {ui.releasesConfirmDeleteTitle || ui.releasesDeleteVersion || 'Delete version'}
                        </h3>
                        <p className="text-xs text-slate-500 mb-6">
                            {String(
                                (ui.releasesConfirmDeleteBody || "Are you sure you want to remove '{version}'?").replace(
                                    '{version}',
                                    deleteTarget
                                )
                            )}
                        </p>
                        <div className="flex gap-3">
                            <button
                                type="button"
                                className="arborito-snap-del-cancel flex-1 py-3 bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-bold text-xs uppercase"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setDeleteTarget(null);
                                }}
                            >
                                {ui.cancel || 'Cancel'}
                            </button>
                            <button
                                type="button"
                                className="arborito-snap-del-confirm flex-1 py-3 arborito-cta-red rounded-xl font-bold text-xs uppercase shadow-lg hover:scale-105 transition-transform active:scale-[0.98]"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    void onConfirmDelete();
                                }}
                            >
                                {ui.releasesDeleteVersion || ui.graphDelete || 'Delete version'}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
