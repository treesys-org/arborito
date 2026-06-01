import { store } from '../../core/store.js';
import { fileSystem } from '../backup-export/filesystem.js';
import {
    loadUnifiedReleasesList,
    createReleaseVersion,
    deleteReleaseVersion
} from './releases-service.js';
import { bindMobileTap } from '../../shared/ui/mobile-tap.js';
import {
    escHtml,
    escAttr,
    TREE_SWITCHER_PANEL_ID,
    CURRICULUM_SWITCHER_SNAP_INP_ID,
    CURRICULUM_SWITCHER_SNAP_CREATE_ID,
    CURRICULUM_SWITCHER_SNAP_ITEM_CLASS,
    CURRICULUM_SWITCHER_SNAP_DEL_CLASS,
    CURRICULUM_SWITCHER_SNAP_SEARCH_ID
} from '../tree-graph/graph/graph-mobile-shared.js';

export function _renderSnapshotsAdminHtml(graph) {
    const ui = store.ui;
    const isConstruct = !!store.value.constructionMode;
    const canWrite = !!fileSystem.features.canWrite;
    if (!isConstruct || !canWrite) return '';

    const tagLabel = escHtml(ui.releasesTag || ui.releasesCreate || 'Snapshots');
    const ph = escAttr(ui.releasesVersionPlaceholder || 'e.g. v2.0');
    const createLabel = escHtml(ui.releasesCreate || 'Create');
    const title = escHtml(ui.releasesSnapshot || 'Snapshots');
    const hint = escHtml(ui.releasesCreateFormHint || ui.releasesSwitchHint || '');
    const loading = !!graph._snapAdminLoading;
    const creating = !!graph._snapAdminCreating;
    const q = String(graph._snapAdminNewTag || '');
    const itemsAll = Array.isArray(graph._snapAdminItems) ? graph._snapAdminItems : [];
    const deleteTarget = String(graph._snapAdminDeleteTarget || '').trim();
    const sq = String(graph._snapAdminQuery || '').trim().toLowerCase();
    const filtered = sq
        ? itemsAll.filter((it) => String(it?.id || '').toLowerCase().includes(sq))
        : itemsAll;
    const cap = 120;
    const trunc = filtered.length > cap;
    const items = trunc ? filtered.slice(0, cap) : filtered;

    const body = loading
        ? `<div class="arborito-curriculum-switcher-empty">${escHtml(ui.loading || 'Loading…')}</div>`
        : items.length
          ? `<div class="arborito-curriculum-switcher-rows">
                ${items
                    .map((it) => {
                        const id = escHtml(it.id);
                        const aria = escAttr((ui.releasesDeleteVersion || ui.graphDelete || 'Delete') + ` ${id}`);
                        return `<div class="arborito-curriculum-switcher-row ${CURRICULUM_SWITCHER_SNAP_ITEM_CLASS}" data-id="${escAttr(
                            it.id
                        )}">
                            <span class="arborito-curriculum-switcher-row__left"><span aria-hidden="true">📦</span><span>${id}</span></span>
                            <button type="button" class="${CURRICULUM_SWITCHER_SNAP_DEL_CLASS}" aria-label="${aria}" title="${aria}">🗑️</button>
                        </div>`;
                    })
                    .join('')}
            </div>`
          : `<div class="arborito-curriculum-switcher-empty">${escHtml(ui.releasesEmpty || 'No snapshots found.')}</div>`;

    const overlay = deleteTarget
        ? (() => {
              const title = escHtml(ui.releasesConfirmDeleteTitle || ui.releasesDeleteVersion || 'Delete version');
              const body = escHtml(
                  String(
                      (ui.releasesConfirmDeleteBody || "Are you sure you want to remove '{version}'?")
                          .replace('{version}', deleteTarget)
                  )
              );
              const cancel = escHtml(ui.cancel || 'Cancel');
              const del = escHtml(ui.releasesDeleteVersion || ui.graphDelete || 'Delete version');
              return `
                <div class="absolute inset-0 bg-white/95 dark:bg-slate-900/95 flex items-center justify-center z-[120] animate-in fade-in rounded-2xl">
                  <div class="w-full max-w-xs text-center px-4">
                    <div class="text-4xl mb-4">⚠️</div>
                    <h3 class="text-lg font-black mb-2 dark:text-white">${title}</h3>
                    <p class="text-xs text-slate-500 mb-6">${body}</p>
                    <div class="flex gap-3">
                      <button type="button" class="arborito-snap-del-cancel flex-1 py-3 bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-bold text-xs uppercase">${cancel}</button>
                      <button type="button" class="arborito-snap-del-confirm flex-1 py-3 bg-red-600 text-white rounded-xl font-bold text-xs uppercase shadow-lg hover:scale-105 transition-transform active:scale-[0.98]">${del}</button>
                    </div>
                  </div>
                </div>`;
          })()
        : '';

    return `
      <div id="arborito-curriculum-switcher-snapshots-admin" class="arborito-curriculum-switcher-block relative">
        <div class="arborito-curriculum-switcher-block__head">
          <p class="arborito-curriculum-switcher-block__title">${title}</p>
          <span class="arborito-curriculum-switcher-block__sub">${escHtml(ui.navConstruct || 'Construction')}</span>
        </div>
        <div class="arborito-tree-switcher-search-row">
          <input id="${CURRICULUM_SWITCHER_SNAP_SEARCH_ID}" type="search" autocomplete="off" value="${escAttr(
              String(graph._snapAdminQuery || '')
          )}" placeholder="${escAttr(ui.treeSwitcherSearchPh || 'Search…')}" class="arborito-tree-switcher-search" ${
              creating ? 'disabled' : ''
          }/>
        </div>
        <div class="arborito-curriculum-switcher-snap-create">
          <label class="arborito-curriculum-switcher-snap-label" for="${CURRICULUM_SWITCHER_SNAP_INP_ID}">${tagLabel}</label>
          <div class="arborito-curriculum-switcher-snap-row">
            <input id="${CURRICULUM_SWITCHER_SNAP_INP_ID}" type="text" value="${escAttr(
                q
            )}" placeholder="${ph}" autocomplete="off" ${creating ? 'disabled' : ''}/>
            <button type="button" id="${CURRICULUM_SWITCHER_SNAP_CREATE_ID}" ${creating ? 'disabled' : ''}>${
        creating ? escHtml(ui.loading || 'Loading…') : createLabel
    }</button>
          </div>
          ${hint ? `<p class="arborito-curriculum-switcher-hint">${hint}</p>` : ''}
        </div>
        ${body}
        ${
            trunc
                ? `<div class="arborito-curriculum-switcher-hint">${escHtml(
                      ui.curriculumSwitcherTruncBrowseHint ||
                          ui.sourcesUnifiedListTruncBody ||
                          'Showing first matches only. Narrow your search.'
                  )}</div>`
                : ''
        }
        ${overlay}
      </div>`;
}

function _refreshSnapshotsAdminInOpenPanel(graph, panel) {
    try {
        if (!graph || !panel) return false;
        const host = panel.querySelector('#arborito-curriculum-switcher-snapshots-admin');
        if (!host) return false;
        host.outerHTML = _renderSnapshotsAdminHtml(graph) || '';
        return true;
    } catch {
        return false;
    }
}

export function _bindSnapshotsAdminActions(graph, panel) {
    const snapSearch = panel.querySelector(`#${CURRICULUM_SWITCHER_SNAP_SEARCH_ID}`);
    if (snapSearch && snapSearch instanceof HTMLInputElement) {
        snapSearch.oninput = () => {
            graph._snapAdminQuery = snapSearch.value || '';
            _refreshSnapshotsAdminInOpenPanel(graph, panel);
            _bindSnapshotsAdminActions(graph, panel);
        };
    }

    if (!graph || !panel) return;
    const ui = store.ui;

    const snapInp = panel.querySelector(`#${CURRICULUM_SWITCHER_SNAP_INP_ID}`);
    if (snapInp && snapInp instanceof HTMLInputElement) {
        snapInp.oninput = () => {
            graph._snapAdminNewTag = snapInp.value || '';
        };
    }

    const snapCreate = panel.querySelector(`#${CURRICULUM_SWITCHER_SNAP_CREATE_ID}`);
    if (snapCreate) {
        bindMobileTap(snapCreate, async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const raw = String(graph._snapAdminNewTag || '').trim();
            const tag = raw.replace(/[^a-z0-9.\-_]/gi, '');
            if (!tag) {
                store.notify(ui.releasesVersionNameRequired || ui.treeNameRequired || 'Enter a version tag.', true);
                return;
            }
            if (graph._snapAdminCreating) return;
            graph._snapAdminCreating = true;

            // Optimistic insert so the user sees it instantly.
            const prev = Array.isArray(graph._snapAdminItems) ? graph._snapAdminItems : [];
            if (!prev.find((x) => String(x.id) === String(tag))) {
                graph._snapAdminItems = [
                    { id: tag, name: `${ui.releasesSnapshot || 'Snapshot'} ${tag}`, url: null, isRemote: false },
                    ...prev
                ];
            }
            _refreshSnapshotsAdminInOpenPanel(graph, panel);
            _bindSnapshotsAdminActions(graph, panel);

            try {
                await createReleaseVersion(tag, true);
                graph._snapAdminNewTag = '';
                const inp = panel.querySelector(`#${CURRICULUM_SWITCHER_SNAP_INP_ID}`);
                if (inp && inp instanceof HTMLInputElement) inp.value = '';
            } catch (err) {
                store.alert(
                    (ui.releasesVersionCreateError || 'Error creating version: {message}').replace(
                        '{message}',
                        err?.message || String(err)
                    )
                );
            } finally {
                graph._snapAdminCreating = false;
                await _ensureSnapshotsAdminLoaded(graph);
                _refreshSnapshotsAdminInOpenPanel(graph, panel);
                _bindSnapshotsAdminActions(graph, panel);
            }
        });
    }

    panel.querySelectorAll(`.${CURRICULUM_SWITCHER_SNAP_DEL_CLASS}`).forEach((b) => {
        bindMobileTap(b, async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const row = b.closest(`.${CURRICULUM_SWITCHER_SNAP_ITEM_CLASS}`);
            const id = row ? String(row.getAttribute('data-id') || '') : '';
            if (!id) return;
            graph._snapAdminDeleteTarget = id;
            _refreshSnapshotsAdminInOpenPanel(graph, panel);
            _bindSnapshotsAdminActions(graph, panel);
        });
    });

    const cancel = panel.querySelector('#arborito-curriculum-switcher-snapshots-admin .arborito-snap-del-cancel');
    if (cancel) {
        bindMobileTap(cancel, (e) => {
            e.preventDefault();
            e.stopPropagation();
            graph._snapAdminDeleteTarget = null;
            _refreshSnapshotsAdminInOpenPanel(graph, panel);
            _bindSnapshotsAdminActions(graph, panel);
        });
    }
    const confirm = panel.querySelector('#arborito-curriculum-switcher-snapshots-admin .arborito-snap-del-confirm');
    if (confirm) {
        bindMobileTap(confirm, async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const id = String(graph._snapAdminDeleteTarget || '').trim();
            if (!id) return;
            try {
                await deleteReleaseVersion(id);
            } catch (err) {
                store.alert(
                    (ui.releasesArchiveDeleteError || 'Error deleting archive: {message}').replace(
                        '{message}',
                        err?.message || String(err)
                    )
                );
            } finally {
                graph._snapAdminDeleteTarget = null;
                await _ensureSnapshotsAdminLoaded(graph);
                _refreshSnapshotsAdminInOpenPanel(graph, panel);
                _bindSnapshotsAdminActions(graph, panel);
            }
        });
    }
}

export async function _ensureSnapshotsAdminLoaded(graph) {
    const isConstruct = !!store.value.constructionMode;
    const canWrite = !!fileSystem.features.canWrite;
    if (!isConstruct || !canWrite) return;
    if (graph._snapAdminLoading) return;
    graph._snapAdminLoading = true;
    try {
        const all = await loadUnifiedReleasesList();
        // Only snapshots/admin items (non-remote). Archives are handled in the Versions section.
        graph._snapAdminItems = all.filter((r) => !r.isRemote);
    } catch {
        graph._snapAdminItems = [];
    } finally {
        graph._snapAdminLoading = false;
        // If the panel is currently open and portaled, update snapshots in place.
        const docPanel =
            typeof document !== 'undefined' ? document.getElementById(TREE_SWITCHER_PANEL_ID) : null;
        if (docPanel && _refreshSnapshotsAdminInOpenPanel(graph, docPanel)) {
            _bindSnapshotsAdminActions(graph, docPanel);
        } else if (typeof graph.refreshCurriculumChrome === 'function') {
            graph.refreshCurriculumChrome();
        }
    }
}
