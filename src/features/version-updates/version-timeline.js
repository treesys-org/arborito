import { store } from '../../core/store.js';
import { fileSystem } from '../backup-export/filesystem.js';
import { getVersionPresentation } from './version-switch-logic.js';
import { loadUnifiedReleasesList } from './releases-service.js';
import { bindMobileTap } from '../../shared/ui/mobile-tap.js';
import {
    escHtml,
    escAttr,
    TREE_SWITCHER_PANEL_ID,
    CURRICULUM_SWITCHER_VERSION_LIVE_ID,
    CURRICULUM_SWITCHER_VERSION_ITEM_CLASS,
    CURRICULUM_SWITCHER_VERSION_SEARCH_ID
} from '../tree-graph/graph/graph-mobile-shared.js';

export function _renderVersionTimelineHtml(graph) {
    const state = store.value;
    const ui = store.ui;
    const src = state.activeSource;
    if (!src) return '';
    const releases = state.availableReleases || [];
    const vp = getVersionPresentation(src, releases, ui);
    const hint = escHtml(ui.releasesSwitchHint || 'Switching reloads the tree.');

    const vq = String(graph?._versionSwitcherQuery || '').trim().toLowerCase();
    const matchVersion = (label) => {
        if (!vq) return true;
        const h = String(label || '').trim().toLowerCase();
        return h.includes(vq);
    };

    // Local trees: show snapshots here so users can travel without construction mode.
    if (vp.isLocal) {
        // In construction, the snapshots admin block below owns the UI; avoid duplicating a second version block.
        if (store.value.constructionMode && fileSystem.features.canWrite) return '';
        const localSub = escHtml(ui.sourcesPillLocal || ui.treeSwitcherLocalSub || 'Local');
        const itemsAll = Array.isArray(graph?._localSnapItems) ? graph._localSnapItems : [];
        const loading = !!graph?._localSnapLoading;
        const shouldShowList = true;
        const filtered = vq
            ? itemsAll.filter((it) => matchVersion(it?.id || it?.name || ''))
            : itemsAll;
        const capLocal = 120;
        const truncLocal = filtered.length > capLocal;
        const items = truncLocal ? filtered.slice(0, capLocal) : filtered;
        const rows = items.length
            ? `<div class="arborito-curriculum-switcher-rows">
                ${items
                    .map((it) => {
                        const id = escHtml(it.id);
                        const isActive =
                            store.value.activeSource?.type === 'archive' &&
                            String(store.value.activeSource?.localArchiveReleaseId || '') === String(it.id);
                        return `<button type="button" class="arborito-curriculum-switcher-row arborito-curriculum-switcher-local-snap-item${
                            isActive ? ' is-active' : ''
                        }" data-id="${escAttr(it.id)}" aria-label="${id}" title="${id}">
                            <span class="arborito-curriculum-switcher-row__left"><span aria-hidden="true">📦</span><span>${id}</span></span>
                            ${isActive ? '<span class="arborito-curriculum-switcher-row__right" aria-hidden="true">✔</span>' : ''}
                        </button>`;
                    })
                    .join('')}
              </div>`
            : `<div class="arborito-curriculum-switcher-empty">${escHtml(ui.releasesEmpty || 'No snapshots found.')}</div>`;
        return `
          <div id="arborito-curriculum-switcher-version-block" class="arborito-curriculum-switcher-block">
            <div class="arborito-curriculum-switcher-block__head">
              <p class="arborito-curriculum-switcher-block__title">${escHtml(ui.releasesVersionUiTitle || ui.releasesVersionsChip || 'Version')}</p>
              <span class="arborito-curriculum-switcher-block__sub">${localSub}</span>
            </div>
            <div class="arborito-tree-switcher-search-row">
              <input id="${CURRICULUM_SWITCHER_VERSION_SEARCH_ID}" type="search" autocomplete="off" value="${escAttr(
                  String(graph?._versionSwitcherQuery || '')
              )}" placeholder="${escAttr(ui.treeSwitcherSearchPh || 'Search…')}" class="arborito-tree-switcher-search"/>
            </div>
            ${
                shouldShowList
                    ? (loading
                        ? `<div class="arborito-curriculum-switcher-empty">${escHtml(ui.loading || 'Loading…')}</div>`
                        : rows)
                    : ''
            }
            ${
                truncLocal
                    ? `<div class="arborito-curriculum-switcher-hint">${escHtml(
                          ui.curriculumSwitcherTruncBrowseHint ||
                              ui.sourcesUnifiedListTruncBody ||
                              'Showing first matches only. Narrow your search.'
                      )}</div>`
                    : ''
            }
          </div>`;
    }

    const archivesAll = releases
        .filter((r) => r.type === 'archive')
        .filter((r) => matchVersion(r.year || r.name || ''))
        .sort((a, b) => b.url.localeCompare(a.url));
    const liveActive = vp.isRolling;
    const liveLabel = escHtml(ui.releasesLive || 'Live / Rolling');

    const liveBtn = `
      <button type="button" id="${CURRICULUM_SWITCHER_VERSION_LIVE_ID}" class="arborito-curriculum-switcher-row${liveActive ? ' is-active' : ''}" aria-label="${liveLabel}" title="${liveLabel}">
        <span class="arborito-curriculum-switcher-row__left"><span aria-hidden="true">🌊</span><span>${liveLabel}</span></span>
        ${liveActive ? '<span class="arborito-curriculum-switcher-row__right" aria-hidden="true">✔</span>' : ''}
      </button>`;

    const cap = 80;
    const archives = archivesAll.slice(0, cap);
    const truncated = archivesAll.length > cap;
    const rows = archives.length
        ? archives
              .map((r) => {
                  const label = escHtml(r.year || r.name || '');
                  const isActive = vp.isArchive && String(src.url || '') === String(r.url || '');
                  const data = encodeURIComponent(JSON.stringify(r));
                  return `
                    <button type="button" class="${CURRICULUM_SWITCHER_VERSION_ITEM_CLASS} arborito-curriculum-switcher-row${isActive ? ' is-active' : ''}" data-json="${data}" aria-label="${label}" title="${label}">
                      <span class="arborito-curriculum-switcher-row__left"><span aria-hidden="true">📦</span><span>${label}</span></span>
                      ${isActive ? '<span class="arborito-curriculum-switcher-row__right" aria-hidden="true">✔</span>' : ''}
                    </button>`;
              })
              .join('')
        : `<div class="arborito-curriculum-switcher-empty">${escHtml(ui.releasesEmpty || 'No versions found.')}</div>`;

    return `
      <div class="arborito-curriculum-switcher-block">
        <div class="arborito-curriculum-switcher-block__head">
          <p class="arborito-curriculum-switcher-block__title">${escHtml(ui.releasesTimeline || ui.releasesVersionUiTitle || 'Version')}</p>
          <span class="arborito-curriculum-switcher-block__sub">${escHtml(vp.chipSub || '')}</span>
        </div>
        <div class="arborito-tree-switcher-search-row">
          <input id="${CURRICULUM_SWITCHER_VERSION_SEARCH_ID}" type="search" autocomplete="off" value="${escAttr(
              String(graph?._versionSwitcherQuery || '')
          )}" placeholder="${escAttr(ui.treeSwitcherSearchPh || 'Search…')}" class="arborito-tree-switcher-search"/>
        </div>
        <div class="arborito-curriculum-switcher-rows">
          ${liveBtn}
          ${rows}
        </div>
        ${
            truncated
                ? `<div class="arborito-curriculum-switcher-hint">${escHtml(
                      ui.curriculumSwitcherTruncVersionsHint ||
                          ui.sourcesUnifiedListTruncBody ||
                          'Showing first versions only. Narrow your search or open Sources for the full list.'
                  )}</div>`
                : ''
        }
        <div class="arborito-curriculum-switcher-hint">${hint}</div>
      </div>`;
}

export async function _ensureLocalSnapshotsLoaded(graph) {
    if (!graph) return;
    if (graph._localSnapLoading) return;
    graph._localSnapLoading = true;
    // Paint a loading state immediately if panel is open.
    try {
        const docPanel0 =
            typeof document !== 'undefined' ? document.getElementById(TREE_SWITCHER_PANEL_ID) : null;
        if (docPanel0) {
            _refreshVersionTimelineInOpenPanel(graph, docPanel0);
            _bindLocalSnapshotSwitch(graph, docPanel0);
        }
    } catch {
        /* ignore */
    }
    try {
        const all = await loadUnifiedReleasesList();
        graph._localSnapItems = all.filter((r) => !r.isRemote);
    } catch {
        graph._localSnapItems = [];
    } finally {
        graph._localSnapLoading = false;
        const docPanel =
            typeof document !== 'undefined' ? document.getElementById(TREE_SWITCHER_PANEL_ID) : null;
        if (docPanel && _refreshVersionTimelineInOpenPanel(graph, docPanel)) {
            _bindLocalSnapshotSwitch(graph, docPanel);
        } else {
            graph.refreshCurriculumChrome?.();
        }
    }
}

export function _refreshVersionTimelineInOpenPanel(graph, panel) {
    try {
        if (!graph || !panel) return false;
        const host = panel.querySelector('#arborito-curriculum-switcher-version-block');
        if (!host) return false;
        host.outerHTML = _renderVersionTimelineHtml(graph) || '';
        return true;
    } catch {
        return false;
    }
}

export function _bindLocalSnapshotSwitch(graph, panel) {
    if (!graph || !panel) return;
    panel.querySelectorAll('.arborito-curriculum-switcher-local-snap-item').forEach((b) => {
        bindMobileTap(b, async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const id = String(b.getAttribute('data-id') || '').trim();
            if (!id) return;
            const activeSource = store.value.activeSource;
            const activeUrl = String(activeSource?.url || '');
            if (!activeSource || !activeUrl.startsWith('local://')) return;
            const localTreeId = activeUrl.slice('local://'.length).split('/')[0];
            if (!localTreeId) return;
            const newSource = {
                ...activeSource,
                id: `${localTreeId}-${id}`,
                name: `${(activeSource.name || '').split(' (')[0]} (${id})`,
                url: `local://${localTreeId}`,
                type: 'archive',
                localArchiveReleaseId: id
            };
            await store.loadData(newSource);
            // Close overlay after switching.
            if (typeof graph.afterVersionSwitchCloseMenu === 'function') {
                graph.afterVersionSwitchCloseMenu();
            } else {
                graph._treeSwitcherOpen = false;
                graph.refreshCurriculumChrome?.();
            }
        });
    });
}
