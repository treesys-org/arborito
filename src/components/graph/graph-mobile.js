import { store } from '../../store.js';
import { fileSystem } from '../../services/filesystem.js';
import {
    curriculumTreeDisplayName,
    getVersionPresentation,
    applyReleaseSwitch,
    applyLiveSwitch
} from '../../utils/version-switch-logic.js';
import {
    loadUnifiedReleasesList,
    createReleaseVersion,
    deleteReleaseVersion
} from '../../utils/releases-service.js';
import { bindMobileTap } from '../../utils/mobile-tap.js';
import { shouldShowMobileUI } from '../../utils/breakpoints.js';
import { schedulePersistTreeUiState } from '../../utils/tree-ui-persist.js';
import { escHtml, escAttr } from '../../utils/html-escape.js';

const VERSION_TOGGLE_ID = 'arborito-version-toggle';
const VERSION_LIVE_ID = 'arborito-version-live';
const VERSION_DROPDOWN_ID = 'arborito-version-dropdown-panel';
const VERSION_DROPDOWN_BACKDROP_ID = 'arborito-version-dropdown-backdrop';
const VERSION_ARCHIVE_ITEM_CLASS = 'arborito-version-archive-item';

// --- Tree switcher (installed sources) ---
const TREE_SWITCHER_BTN_ID = 'arborito-tree-switcher-btn';
const TREE_SWITCHER_BACKDROP_ID = 'arborito-tree-switcher-backdrop';
const TREE_SWITCHER_PANEL_ID = 'arborito-tree-switcher-panel';
const TREE_SWITCHER_SEARCH_ID = 'arborito-tree-switcher-search';
const TREE_SWITCHER_LIST_ID = 'arborito-tree-switcher-list';
const TREE_SWITCHER_MORE_ID = 'arborito-tree-switcher-more';
const TREE_SWITCHER_ITEM_CLASS = 'arborito-tree-switcher-item';

// --- Unified curriculum switcher (Version + Tree) ---
const CURRICULUM_SWITCHER_BTN_ID = 'arborito-curriculum-switcher-btn';
const CURRICULUM_SWITCHER_VERSION_LIVE_ID = 'arborito-curriculum-switcher-version-live';
const CURRICULUM_SWITCHER_VERSION_ITEM_CLASS = 'arborito-curriculum-switcher-version-item';
const CURRICULUM_SWITCHER_VERSION_LOCAL_ID = 'arborito-curriculum-switcher-version-local';
const CURRICULUM_SWITCHER_SNAP_INP_ID = 'arborito-curriculum-switcher-snap-inp';
const CURRICULUM_SWITCHER_SNAP_CREATE_ID = 'arborito-curriculum-switcher-snap-create';
const CURRICULUM_SWITCHER_SNAP_ITEM_CLASS = 'arborito-curriculum-switcher-snap-item';
const CURRICULUM_SWITCHER_SNAP_DEL_CLASS = 'arborito-curriculum-switcher-snap-del';
const CURRICULUM_SWITCHER_VERSION_SEARCH_ID = 'arborito-curriculum-switcher-version-search';
const CURRICULUM_SWITCHER_SNAP_SEARCH_ID = 'arborito-curriculum-switcher-snap-search';

export { escHtml, escAttr };

/** “Add” icon: explicit plus + folder/lesson (avoids ambiguous 📁+ string). */
function mobileAddPairIcon(emoji) {
    return `<span class="mobile-inline-tool__pair"><span class="mobile-inline-tool__pair-plus">+</span><span>${emoji}</span></span>`;
}

/**
 * Construction labels/icons: at course root we use tree metaphors
 * (branch / lesson / cover) so they are not confused with a generic folder.
 * @param {Record<string, string>} ui
 * @param {{ type?: string } | null} node
 */
function constructionToolbarUi(ui, node) {
    const isRoot = node?.type === 'root';
    return {
        editLabel: isRoot ? ui.graphEditRoot || ui.graphEdit : ui.graphEdit,
        addFolderLabel: isRoot ? ui.graphAddFolderRoot || ui.graphAddFolder : ui.graphAddFolder,
        addLessonLabel: isRoot ? ui.graphAddLessonRoot || ui.graphAddLesson : ui.graphAddLesson,
        // Root uses tree metaphor in labels, but the glyph should still be a folder (not a leaf).
        addFolderIconHtml: mobileAddPairIcon('📁'),
        addLessonIconHtml: mobileAddPairIcon(isRoot ? '📖' : '📄'),
        toolsGroupAria: isRoot
            ? ui.graphNodeToolsGroupLabelRoot || ui.graphNodeToolsGroupLabel || ui.graphNodeToolsAriaFallback
            : ui.graphNodeToolsGroupLabel || ui.graphNodeToolsAriaFallback,
        folderHint: isRoot
            ? ui.graphFolderToolsScopeHintRoot || ui.graphFolderToolsScopeHint || ''
            : ui.graphFolderToolsScopeHint || ''
    };
}

/**
 * Title for the Move control when it is disabled (root node, etc.).
 * Keeps copy aligned with {@link createMobileNodeToolbarElement} and desktop alerts.
 */
export function getMobileMoveDisabledTitle(ui, node) {
    if (!node) return ui.graphMove || 'Move';
    if (node.type === 'root') {
        return ui.graphMoveDisabledRoot || 'The curriculum root cannot be moved.';
    }
    return ui.graphMove || 'Move';
}

export function _onDocClickCurriculum(e) {
        if (!this._versionMenuOpen && !this._treeSwitcherOpen) return;
        const t = e.target;
        const chrome = this.querySelector('#arborito-curriculum-chrome');
        const panel = document.getElementById(VERSION_DROPDOWN_ID);
        const inVersion =
            (typeof t.closest === 'function' &&
                t.closest(
                    `#${CURRICULUM_SWITCHER_BTN_ID}, #${TREE_SWITCHER_BTN_ID}, #${TREE_SWITCHER_PANEL_ID}, #${TREE_SWITCHER_BACKDROP_ID}, #${TREE_SWITCHER_SEARCH_ID}, #${TREE_SWITCHER_LIST_ID}, #${TREE_SWITCHER_MORE_ID}, .${TREE_SWITCHER_ITEM_CLASS}, #${VERSION_TOGGLE_ID}, #${VERSION_DROPDOWN_ID}, #${VERSION_DROPDOWN_BACKDROP_ID}, .${VERSION_ARCHIVE_ITEM_CLASS}, #${VERSION_LIVE_ID}, .mobile-panel-version-slot, .arborito-tree-switcher-chip, .arborito-tree-switcher-host, .arborito-curriculum-switcher-host`
                )) ||
            chrome?.contains(t) ||
            panel?.contains(t);
        if (inVersion) return;
        if (this._versionMenuOpen) {
            this._versionMenuOpen = false;
        }
        if (this._treeSwitcherOpen) {
            this._treeSwitcherOpen = false;
        }
        this._mobileRenderKey = null;
        if (store.value.data) this.renderMobilePrototypeTree(store.value.data);
    }



export { bindMobileTap };

export function getMobileTone(node) {
        if (!node || !node.type) return 'branch';
        if (node.type === 'root') return 'root';
        if (node.type === 'exam') return 'exam';
        if (node.type === 'leaf') return 'leaf';
        return 'branch';
    }


export function _syncMobileTreeUiLayer() {
        if (!this.mobileTreeUI) return;
        this.mobileTreeUI.classList.toggle('arborito-version-dropdown-open', this._versionMenuOpen);
    }

export function refreshCurriculumChrome() {
        if (!store.value.data) return;
        this.renderMobileTopBanner();
        this._syncMobileTreeUiLayer();
        this._mobileRenderKey = null;
        this.renderMobilePrototypeTree(store.value.data);
    }



/**
     * Curriculum title: same block as mobile root (eyebrow, name, construction badge, optional meta).
     * @param {{ showMeta?: boolean, metaText?: string }} [opts]
     */
export function buildCurriculumTitleHTML(opts = {}) {
        const state = store.value;
        const ui = store.ui;
        const src = state.activeSource;
        if (!src) return '';
        const con = !!state.constructionMode;
        const conLabel = (ui.navConstruct || 'Construction Mode').trim();
        const hideConBadgeDesktop =
            con &&
            typeof document !== 'undefined' &&
            document.documentElement.classList.contains('arborito-desktop');
        const hideConBadgeMobileConstruct =
            con &&
            typeof document !== 'undefined' &&
            shouldShowMobileUI() &&
            !document.documentElement.classList.contains('arborito-desktop');
        const badge =
            con && !hideConBadgeDesktop && !hideConBadgeMobileConstruct
                ? `<span class="shrink-0 rounded-full bg-amber-400/25 dark:bg-amber-500/20 text-amber-900 dark:text-amber-100 text-[9px] font-black px-2 py-0.5 uppercase tracking-wide border border-amber-500/30" role="status">🚧 ${escHtml(conLabel)}</span>`
                : '';
        const meta =
            opts.showMeta && opts.metaText
                ? `<span class="mobile-label-meta">${escHtml(opts.metaText)}</span>`
                : '';
        if (!badge && !meta) return '';

        return `
            <div class="min-w-0 flex-1 text-left">
                <div class="flex items-start gap-1.5 min-w-0 flex-wrap">
                    ${meta}
                    ${badge}
                </div>
            </div>`;
    }

/**
     * Curriculum row beside trunk: title/meta (construction mode, etc.). Version switching
     * lives on the root panel chip, not here (avoids duplicating the floating chip).
     * @param {{ showMeta?: boolean, metaText?: string }} [titleOpts]
     */
export function buildCurriculumChromeTitleRowHTML(titleOpts = {}) {
        const src = store.value.activeSource;
        if (!src) return '';
        const isDesktopForest =
            typeof document !== 'undefined' && document.documentElement.classList.contains('arborito-desktop');
        const con = !!store.value.constructionMode;
        /* Desktop + construction: panel already shows title; avoid duplicate floating name. */
        const hideFloatingTreeName = con && isDesktopForest;
        const explore = store.value.viewMode === 'explore';
        const title = this.buildCurriculumTitleHTML(titleOpts);
        const nameHint = curriculumTreeDisplayName(store.ui);

        const fallback =
            !hideFloatingTreeName &&
            (!explore || isDesktopForest) &&
            !title.trim() &&
            nameHint
                ? `<span class="mobile-label-text" title="${escAttr(nameHint)}">${escHtml(nameHint)}</span>`
                : '';

        const ui = store.ui;
        return `
            <div class="arborito-mobile-curriculum-chrome arborito-mobile-curriculum-chrome--title-only flex w-full min-w-0 flex-col items-stretch gap-2">
                <div class="mobile-label-row__text min-w-0 flex-1 flex items-start justify-between gap-2">
                    <div class="min-w-0 flex-1 flex flex-col items-start gap-1">
                        ${title}
                        ${fallback}
                    </div>
                </div>
            </div>`;
    }

export function buildTreeSwitcherHTML(opts = {}) {
    const ui = store.ui;
    const open = !!this._treeSwitcherOpen;
    const btnLabel = ui.treeSwitcherOpenAria || ui.treeSwitcherUnifiedAria || 'Switch tree';
    const active = store.value.activeSource;
    const activeTreeName = curriculumTreeDisplayName(ui) || (ui.sourcesActiveTreeFallback || 'Tree');
    const q = String(this._treeSwitcherQuery || '');
    const qPh = escAttr(ui.treeSwitcherSearchPh || ui.sourcesUnifiedSearchPlaceholder || 'Search…');
    const loading = !!store.value.treeHydrating;
    const moreTreesLabel = ui.treeSwitcherMoreTrees || ui.sourcesUnifiedMoreTrees || ui.sourcesOpen || 'Get more trees';
    const chip = !!opts.chip;
    const url = String(active?.url || '');
    const isLocal =
        active?.type === 'local' || url.startsWith('local://') || fileSystem.isLocal;
    const eyebrow = escHtml(ui.treeSwitcherEyebrow || ui.sourcesTreeLabel || 'Tree');
    const sub = escHtml(
        isLocal
            ? ui.sourcesPillLocal || ui.treeSwitcherLocalSub || 'Local'
            : ui.sourcesPillInstalled || ui.treeSwitcherInstalledSub || 'Installed'
    );
    const icon = isLocal ? '🏡' : '🌳';
    const chev = open ? '▲' : '▼';

    const triggerBtn = chip
        ? `<button type="button" id="${TREE_SWITCHER_BTN_ID}" class="arborito-timeline-chip arborito-timeline-chip--btn arborito-tree-switcher-chip flex items-start gap-2 rounded-2xl border-2 shadow-sm px-2.5 py-2 min-w-0 w-full" aria-label="${escAttr(
              btnLabel
          )}" title="${escAttr(btnLabel)}" aria-expanded="${open}">
                <span class="arborito-switcher-chip-icon text-lg leading-none shrink-0 mt-0.5" aria-hidden="true">${icon}</span>
                <span class="min-w-0 flex-1 text-left space-y-0.5">
                    <span class="arborito-switcher-chip-eyebrow">${eyebrow}</span>
                    <span class="arborito-switcher-chip-title line-clamp-2 break-words">${escHtml(activeTreeName)}</span>
                    <span class="arborito-switcher-chip-sub line-clamp-2 break-words">${sub}</span>
                </span>
                <span class="arborito-switcher-chip-chev shrink-0 mt-1" aria-hidden="true">${chev}</span>
            </button>`
        : `<button type="button" id="${TREE_SWITCHER_BTN_ID}" class="arborito-tree-switcher-btn" aria-label="${escAttr(
              btnLabel
          )}" title="${escAttr(btnLabel)}">
                <span class="arborito-tree-switcher-btn__name">${escHtml(activeTreeName)}</span>
                <span class="arborito-tree-switcher-btn__chev" aria-hidden="true">▾</span>
            </button>`;

    return `
        <div class="arborito-tree-switcher-host${chip ? ' arborito-tree-switcher-host--chip' : ''}">
            ${triggerBtn}
            <div id="${TREE_SWITCHER_BACKDROP_ID}" class="arborito-tree-switcher-backdrop${open ? ' is-open' : ''}" aria-hidden="${open ? 'false' : 'true'}"></div>
            <div id="${TREE_SWITCHER_PANEL_ID}" class="arborito-tree-switcher-panel${open ? ' is-open' : ''}" role="dialog" aria-modal="true" aria-label="${escAttr(
                ui.treeSwitcherTitle || 'Switch tree'
            )}">
                <div class="arborito-tree-switcher-head">
                    <div class="arborito-tree-switcher-title-row">
                        <p class="arborito-tree-switcher-title">${escHtml(ui.treeSwitcherTitle || 'Switch tree')}</p>
                        <button type="button" class="arborito-tree-switcher-close" data-act="close" aria-label="${escAttr(
                            ui.close || 'Close'
                        )}" title="${escAttr(ui.close || 'Close')}">✕</button>
                    </div>
                    <div class="arborito-tree-switcher-search-row">
                        <input id="${TREE_SWITCHER_SEARCH_ID}" type="search" autocomplete="off" value="${escAttr(
                            q
                        )}" placeholder="${qPh}" class="arborito-tree-switcher-search" aria-label="${escAttr(
                            ui.treeSwitcherSearchAria || ui.treeSwitcherSearchPh || ui.sourcesUnifiedSearchPlaceholder || 'Search'
                        )}" ${loading ? 'disabled' : ''}/>
                        ${
                            loading
                                ? `<span class="arborito-tree-switcher-loading">${escHtml(ui.treeSwitcherChipLoading || ui.loading || 'Loading…')}</span>`
                                : ''
                        }
                    </div>
                </div>
                <div id="${TREE_SWITCHER_LIST_ID}" class="arborito-tree-switcher-list" role="list"></div>
                <div class="arborito-tree-switcher-footer">
                    <button type="button" id="${TREE_SWITCHER_MORE_ID}" class="arborito-tree-switcher-more" aria-label="${escAttr(
                        moreTreesLabel
                    )}" title="${escAttr(moreTreesLabel)}">${escHtml(moreTreesLabel)}</button>
                </div>
            </div>
        </div>`;
}

function _treeSwitcherSourcesForUi() {
    const out = [];
    const active = store.value.activeSource;
    const activeUrl = String(active?.url || '');
    const activeId = String(active?.id || '');

    // Local
    const locals = store.userStore?.state?.localTrees || [];
    for (const t of locals) {
        if (!t) continue;
        const id = String(t.id || '');
        const name = String(t.name || '').trim() || id;
        out.push({
            kind: 'local',
            id,
            name,
            url: `local://${id}`,
            isActive: activeId && id === activeId
        });
    }

    // Installed (community sources)
    const comm = store.value.communitySources || [];
    for (const s of comm) {
        if (!s) continue;
        const id = String(s.id || '');
        const name = String(s.name || '').trim() || id;
        const url = String(s.url || '');
        out.push({
            kind: 'installed',
            id,
            name,
            url,
            isActive: (activeId && id === activeId) || (activeUrl && url && String(url) === String(activeUrl))
        });
    }
    return out;
}

function _scoreSwitcherMatch(q, name) {
    const qq = String(q || '').trim().toLowerCase();
    if (!qq) return 1;
    const h = String(name || '').trim().toLowerCase();
    if (!h) return 0;
    if (h === qq) return 100;
    if (h.startsWith(qq)) return 50;
    if (h.includes(qq)) return 10;
    return 0;
}

function _renderTreeSwitcherListHtml(qRaw) {
    const ui = store.ui;
    const q = String(qRaw || '');
    const all = _treeSwitcherSourcesForUi()
        .map((s) => ({ s, score: _scoreSwitcherMatch(q, s.name) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => (b.s.isActive ? 1000 : 0) + b.score - ((a.s.isActive ? 1000 : 0) + a.score))
        .map(({ s }) => {
            const pill =
                s.kind === 'local'
                    ? escHtml(ui.sourcesPillLocal || 'Local')
                    : escHtml(ui.sourcesPillInstalled || 'Installed');
            const pillCls =
                s.kind === 'local'
                    ? 'arborito-tree-switcher-pill arborito-tree-switcher-pill--local'
                    : 'arborito-tree-switcher-pill arborito-tree-switcher-pill--installed';
            const activeCls = s.isActive ? ' is-active' : '';
            const emoji = s.kind === 'local' ? '🏡' : '🌳';
            const avatarCls =
                s.kind === 'local'
                    ? 'arborito-tree-switcher-avatar arborito-tree-switcher-avatar--local'
                    : 'arborito-tree-switcher-avatar arborito-tree-switcher-avatar--installed';
            return `<button type="button" class="${TREE_SWITCHER_ITEM_CLASS}${activeCls}" role="listitem" data-tree-id="${escAttr(
                s.id
            )}" data-tree-url="${escAttr(s.url)}" data-tree-kind="${escAttr(s.kind)}" data-tree-name="${escAttr(
                s.name
            )}" ${s.isActive ? 'aria-current="true"' : ''}>
                <span class="${avatarCls}" aria-hidden="true">${emoji}</span>
                <span class="arborito-tree-switcher-item-body">
                    <span class="arborito-tree-switcher-item-name" title="${escAttr(s.name)}">${escHtml(s.name)}</span>
                    <span class="${pillCls}">${pill}</span>
                </span>
                ${
                    s.isActive
                        ? '<span class="arborito-tree-switcher-item-check" aria-hidden="true">✓</span>'
                        : ''
                }
            </button>`;
        });

    // Pagination: render only first N and show an affordance to narrow query.
    const cap = 80;
    const truncated = all.length > cap;
    const srcs = truncated ? all.slice(0, cap) : all;

    if (!srcs.length) {
        return `<div class="arborito-tree-switcher-empty">${escHtml(
            ui.treeSwitcherEmpty || ui.sourcesUnifiedEmpty || 'No results.'
        )}</div>`;
    }
    let truncLine = '';
    if (truncated) {
        const hintTpl = ui.treeSwitcherListTruncHint;
        if (hintTpl && /\{\{shown\}\}/.test(String(hintTpl)) && /\{\{total\}\}/.test(String(hintTpl))) {
            truncLine = String(hintTpl)
                .replace(/\{\{shown\}\}/g, String(cap))
                .replace(/\{\{total\}\}/g, String(all.length));
        } else if (ui.sourcesUnifiedListTruncBody && /\{\{n\}\}/.test(String(ui.sourcesUnifiedListTruncBody))) {
            truncLine = String(ui.sourcesUnifiedListTruncBody).replace(/\{\{n\}\}/g, String(cap));
        } else {
            truncLine = `Showing ${cap} of ${all.length}. Narrow your search.`;
        }
    }
    const moreHint = truncated
        ? `<div class="arborito-tree-switcher-empty arborito-tree-switcher-empty--trunc">${escHtml(truncLine)}</div>`
        : '';
    return `<div class="arborito-tree-switcher-carousel" role="list">${srcs.join('')}${moreHint}</div>`;
}

function _renderVersionTimelineHtml(graph) {
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

async function _ensureLocalSnapshotsLoaded(graph) {
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
        graph._mobileRenderKey = null;
        const docPanel =
            typeof document !== 'undefined' ? document.getElementById(TREE_SWITCHER_PANEL_ID) : null;
        if (docPanel && _refreshVersionTimelineInOpenPanel(graph, docPanel)) {
            _bindLocalSnapshotSwitch(graph, docPanel);
        } else {
            graph.refreshCurriculumChrome?.();
        }
    }
}

function _refreshVersionTimelineInOpenPanel(graph, panel) {
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

function _replacePanelSectionHtml(panel, selector, html) {
    try {
        if (!panel) return false;
        const host = panel.querySelector(selector);
        if (!host) return false;
        host.outerHTML = html || '';
        return true;
    } catch {
        return false;
    }
}

function _bindLocalSnapshotSwitch(graph, panel) {
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
                graph._mobileRenderKey = null;
                graph.refreshCurriculumChrome?.();
            }
        });
    });
}

function _renderSnapshotsAdminHtml(graph) {
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

function _bindSnapshotsAdminActions(graph, panel) {
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
            graph._mobileRenderKey = null;
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
                graph._mobileRenderKey = null;
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
                graph._mobileRenderKey = null;
                _refreshSnapshotsAdminInOpenPanel(graph, panel);
                _bindSnapshotsAdminActions(graph, panel);
            }
        });
    }
}

async function _ensureSnapshotsAdminLoaded(graph) {
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
        graph._mobileRenderKey = null;
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

function _portalCurriculumSwitcherToBody(panel, backdrop) {
    if (typeof document === 'undefined') return;
    const body = document.body;
    if (!body) return;
    if (backdrop && backdrop.parentElement !== body) {
        body.appendChild(backdrop);
    }
    if (panel && panel.parentElement !== body) {
        body.appendChild(panel);
        panel.classList.add('arborito-tree-switcher-panel--portaled');
    }
}

function _unportalCurriculumSwitcherFromBody(panel, backdrop) {
    if (!panel && !backdrop) return;
    try {
        backdrop?.remove();
    } catch {
        /* ignore */
    }
    try {
        panel?.remove();
    } catch {
        /* ignore */
    }
}

export function buildUnifiedCurriculumSwitcherHTML() {
    const state = store.value;
    const ui = store.ui;
    const src = state.activeSource;
    if (!src) return '';

    const open = !!this._treeSwitcherOpen;
    const releases = state.availableReleases || [];
    const vp = getVersionPresentation(src, releases, ui);
    const treeName = curriculumTreeDisplayName(ui) || (ui.sourcesActiveTreeFallback || 'Tree');

    const eyebrow = escHtml(ui.treeSwitcherUnifiedEyebrow || ui.treeSwitcherOpenAria || 'Version and tree');
    const versionLine = escHtml(vp.isLocal ? (ui.sourcesPillLocal || 'Local') : (vp.chipSub || ''));
    const treeLine = escHtml(treeName);
    const icon = vp.isLocal ? '🏡' : '🌳';
    const chev = open ? '▲' : '▼';
    const btnLabel = ui.treeSwitcherUnifiedAria || ui.treeSwitcherOpenAria || 'Switch version and tree';

    /* In construction too: “More trees” / sources (unified panel footer used to be hidden). */
    const showMoreTreesBtn = true;
    const tab = (this._curriculumSwitcherTab === 'tree' || this._curriculumSwitcherTab === 'version')
        ? this._curriculumSwitcherTab
        : 'tree';

    const tabBtn = (id, label, isActive) => `
      <button type="button" class="arborito-curriculum-switcher-tab${isActive ? ' is-active' : ''}" data-tab="${escAttr(
          id
      )}" aria-pressed="${isActive ? 'true' : 'false'}">${escHtml(label)}</button>`;

    return `
      <div class="arborito-curriculum-switcher-host">
        <button type="button" id="${CURRICULUM_SWITCHER_BTN_ID}" data-arborito-version-kind="${escAttr(
            vp.versionKind || 'rolling'
        )}" class="arborito-timeline-chip arborito-timeline-chip--btn arborito-curriculum-switcher-chip flex items-start gap-2 rounded-2xl border-2 shadow-sm px-2.5 py-2 min-w-0 w-full" aria-label="${escAttr(
            btnLabel
        )}" title="${escAttr(btnLabel)}" aria-expanded="${open}" aria-haspopup="dialog">
          <span class="arborito-switcher-chip-icon text-lg leading-none shrink-0 mt-0.5" aria-hidden="true">${icon}</span>
          <span class="min-w-0 flex-1 text-left space-y-0.5">
            <span class="arborito-switcher-chip-eyebrow">${eyebrow}</span>
            <span class="arborito-chip-tree-line arborito-switcher-chip-title line-clamp-2 break-words">${treeLine}</span>
            <span class="arborito-chip-version-line${vp.isLocal ? ' arborito-chip-version-line--local' : ''} arborito-switcher-chip-sub line-clamp-2 break-words">${versionLine}</span>
          </span>
          <span class="arborito-switcher-chip-chev shrink-0 mt-1" aria-hidden="true">${chev}</span>
        </button>

        <div id="${TREE_SWITCHER_BACKDROP_ID}" class="arborito-tree-switcher-backdrop${open ? ' is-open' : ''}" aria-hidden="${open ? 'false' : 'true'}"></div>
        <div id="${TREE_SWITCHER_PANEL_ID}" class="arborito-tree-switcher-panel${open ? ' is-open' : ''}" data-tab="${escAttr(
            tab
        )}" role="dialog" aria-modal="true" aria-label="${escAttr(
            ui.treeSwitcherUnifiedTitle || ui.treeSwitcherTitle || 'Switch version and tree'
        )}">
          <div class="arborito-tree-switcher-head">
            <div class="arborito-tree-switcher-title-row">
              <p class="arborito-tree-switcher-title">${escHtml(ui.treeSwitcherUnifiedTitle || ui.treeSwitcherTitle || 'Switch version and tree')}</p>
              <button type="button" class="arborito-tree-switcher-close" data-act="close" aria-label="${escAttr(
                  ui.close || 'Close'
              )}" title="${escAttr(ui.close || 'Close')}">✕</button>
            </div>
            <div class="arborito-curriculum-switcher-tabs" role="tablist" aria-label="${escAttr(
                ui.curriculumSwitcherTabsAria || ui.treeSwitcherUnifiedAria || 'Version or tree'
            )}">
              ${tabBtn('tree', ui.treeSwitcherTitle || ui.navSources || 'Tree', tab === 'tree')}
              ${tabBtn('version', ui.releasesVersionUiTitle || ui.menuVersion || 'Version', tab === 'version')}
            </div>
          </div>

          <div class="arborito-curriculum-switcher-scroll">
            <div class="arborito-switcher-pane arborito-switcher-pane--version" role="tabpanel">
              ${_renderVersionTimelineHtml(this)}
              ${_renderSnapshotsAdminHtml(this)}
            </div>
            <div class="arborito-switcher-pane arborito-switcher-pane--tree" role="tabpanel">
              <div class="arborito-curriculum-switcher-block">
                <div class="arborito-curriculum-switcher-block__head">
                  <p class="arborito-curriculum-switcher-block__title">${escHtml(ui.treeSwitcherTitle || 'Tree')}</p>
                </div>
                <div class="arborito-tree-switcher-search-row">
                  <input id="${TREE_SWITCHER_SEARCH_ID}" type="search" autocomplete="off" value="${escAttr(
                      String(this._treeSwitcherQuery || '')
                  )}" placeholder="${escAttr(
                      ui.treeSwitcherSearchPh || ui.sourcesUnifiedSearchPlaceholder || 'Search…'
                  )}" class="arborito-tree-switcher-search" aria-label="${escAttr(
                      ui.treeSwitcherSearchAria || ui.treeSwitcherSearchPh || ui.sourcesUnifiedSearchPlaceholder || 'Search'
                  )}" ${store.value.treeHydrating ? 'disabled' : ''}/>
                  ${
                      store.value.treeHydrating
                          ? `<span class="arborito-tree-switcher-loading">${escHtml(
                                ui.treeSwitcherChipLoading || ui.loading || 'Loading…'
                            )}</span>`
                          : ''
                  }
                </div>
                <div id="${TREE_SWITCHER_LIST_ID}" class="arborito-tree-switcher-list" role="list"></div>
              </div>
            </div>
          </div>

          ${
              showMoreTreesBtn
                  ? `<div class="arborito-tree-switcher-footer">
            <button type="button" id="${TREE_SWITCHER_MORE_ID}" class="arborito-tree-switcher-more" aria-label="${escAttr(
                ui.treeSwitcherMoreTrees || ui.sourcesUnifiedMoreTrees || ui.sourcesOpen || 'Get more trees'
            )}" title="${escAttr(ui.treeSwitcherMoreTrees || ui.sourcesUnifiedMoreTrees || ui.sourcesOpen || 'Get more trees')}">${escHtml(
                        ui.treeSwitcherMoreTrees || ui.sourcesUnifiedMoreTrees || ui.sourcesOpen || 'Get more trees'
                    )}</button>
          </div>`
                  : ''
          }
        </div>
      </div>`;
}

export function bindVersionSwitchAnchors(scope, cfg) {
        if (!scope) return;
        const { toggleId, liveBtnId, itemClass, afterToggle } = cfg;
        const toggle = scope.querySelector(`#${toggleId}`);
        if (toggle) {
            bindMobileTap(toggle, (e) => {
                e.stopPropagation();
                // Local trees: pill opens the Versions modal (snapshots still exist locally).
                const kind = toggle.getAttribute('data-arborito-version-kind');
                if (kind === 'local') {
                    store.dispatchEvent(new CustomEvent('open-curriculum-switcher', { detail: { preferTab: 'version' } }));
                    return;
                }
                const opening = !this._versionMenuOpen;
                if (!opening) {
                    this._clearVersionDropdownPanelStyles();
                }
                this._versionMenuOpen = opening;
                if (afterToggle) afterToggle();
                else this.refreshCurriculumChrome();
            });
        }
        const liveBtn = scope.querySelector(`#${liveBtnId}`);
        if (liveBtn) {
            bindMobileTap(liveBtn, (e) => {
                e.stopPropagation();
                applyLiveSwitch();
                this.afterVersionSwitchCloseMenu();
            });
        }
        scope.querySelectorAll(`.${itemClass}`).forEach((btn) => {
            bindMobileTap(btn, (e) => {
                e.stopPropagation();
                const raw = btn.getAttribute('data-json');
                if (!raw) return;
                try {
                    const data = JSON.parse(decodeURIComponent(raw));
                    applyReleaseSwitch(data);
                } catch {
                    return;
                }
                this.afterVersionSwitchCloseMenu();
            });
        });
    }

/** Wires the single curriculum block (same IDs on mobile and desktop; only one mounted). */
export function bindCurriculumChrome(scope, afterToggle) {
        if (!scope) return;
        // Unified: one trigger opens one overlay.
        const btn = scope.querySelector(`#${CURRICULUM_SWITCHER_BTN_ID}`);
        const panel = scope.querySelector(`#${TREE_SWITCHER_PANEL_ID}`);
        const backdrop = scope.querySelector(`#${TREE_SWITCHER_BACKDROP_ID}`);
        const inp = scope.querySelector(`#${TREE_SWITCHER_SEARCH_ID}`);
        const list = scope.querySelector(`#${TREE_SWITCHER_LIST_ID}`);
        const more = scope.querySelector(`#${TREE_SWITCHER_MORE_ID}`);

        const close = () => {
            if (!this._treeSwitcherOpen) return;
            this._treeSwitcherOpen = false;
            if (panel) panel.classList.remove('is-open');
            if (backdrop) backdrop.classList.remove('is-open');
            _unportalCurriculumSwitcherFromBody(panel, backdrop);
            this._mobileRenderKey = null;
            if (afterToggle) afterToggle();
            else this.refreshCurriculumChrome();
        };
        const open = () => {
            if (this._treeSwitcherOpen) return;
            this._treeSwitcherOpen = true;
            this._curriculumSwitcherTab = 'tree';
            if (panel) panel.classList.add('is-open');
            if (backdrop) backdrop.classList.add('is-open');
            _portalCurriculumSwitcherToBody(panel, backdrop);
            void _ensureSnapshotsAdminLoaded(this);
            // Local snapshots should be visible outside construction mode too.
            const vpNow = getVersionPresentation(store.value.activeSource, store.value.availableReleases || [], store.ui);
            if (vpNow.isLocal) void _ensureLocalSnapshotsLoaded(this);
            const docPanel = typeof document !== 'undefined' ? document.getElementById(TREE_SWITCHER_PANEL_ID) : null;
            if (docPanel) {
                docPanel.setAttribute('data-tab', 'tree');
                docPanel.querySelectorAll('.arborito-curriculum-switcher-tab[data-tab]').forEach((btn2) => {
                    const tt = String(btn2.getAttribute('data-tab') || '');
                    const on = tt === 'tree';
                    btn2.classList.toggle('is-active', on);
                    btn2.setAttribute('aria-pressed', on ? 'true' : 'false');
                });
            }
            const docList = docPanel?.querySelector?.(`#${TREE_SWITCHER_LIST_ID}`) || null;
            if (docList) {
                docList.innerHTML = _renderTreeSwitcherListHtml(this._treeSwitcherQuery || '');
                if (typeof this._bindTreeSwitcherListButtons === 'function') this._bindTreeSwitcherListButtons();
            }
            const verInp = docPanel?.querySelector?.(`#${CURRICULUM_SWITCHER_VERSION_SEARCH_ID}`) || null;
            if (verInp && verInp instanceof HTMLInputElement) {
                verInp.oninput = () => {
                    this._versionSwitcherQuery = verInp.value || '';
                    // Refresh just the version timeline block (portaled-safe).
                    _refreshVersionTimelineInOpenPanel(this, docPanel);
                    // Re-bind version buttons after HTML replacement.
                    const dp = typeof document !== 'undefined' ? document.getElementById(TREE_SWITCHER_PANEL_ID) : null;
                    const liveBtn2 = dp?.querySelector?.(`#${CURRICULUM_SWITCHER_VERSION_LIVE_ID}`);
                    if (liveBtn2) {
                        bindMobileTap(liveBtn2, (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            applyLiveSwitch();
                            close();
                        });
                    }
                    dp?.querySelectorAll?.(`.${CURRICULUM_SWITCHER_VERSION_ITEM_CLASS}`).forEach((b) => {
                        bindMobileTap(b, (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const raw = b.getAttribute('data-json');
                            if (!raw) return;
                            try {
                                const data = JSON.parse(decodeURIComponent(raw));
                                applyReleaseSwitch(data);
                            } catch {
                                return;
                            }
                            close();
                        });
                    });
                    // Also re-bind local snapshot items if present.
                    if (dp) _bindLocalSnapshotSwitch(this, dp);
                };
            }
            if (inp && inp instanceof HTMLInputElement) {
                try { inp.focus({ preventScroll: true }); } catch { inp.focus(); }
                try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch { /* ignore */ }
            }
            // Tabs
            docPanel?.querySelectorAll?.('.arborito-curriculum-switcher-tab[data-tab]').forEach((b) => {
                bindMobileTap(b, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const t = String(b.getAttribute('data-tab') || '');
                    if (t !== 'tree' && t !== 'version') return;
                    if (this._curriculumSwitcherTab === t) return;
                    this._curriculumSwitcherTab = t;
                    const dp = typeof document !== 'undefined' ? document.getElementById(TREE_SWITCHER_PANEL_ID) : null;
                    if (dp) {
                        dp.setAttribute('data-tab', t);
                        dp.querySelectorAll('.arborito-curriculum-switcher-tab[data-tab]').forEach((btn2) => {
                            const tt = String(btn2.getAttribute('data-tab') || '');
                            const on = tt === t;
                            btn2.classList.toggle('is-active', on);
                            btn2.setAttribute('aria-pressed', on ? 'true' : 'false');
                        });
                    }
                    const dl = dp?.querySelector?.(`#${TREE_SWITCHER_LIST_ID}`) || null;
                    if (t === 'tree' && dl) {
                        dl.innerHTML = _renderTreeSwitcherListHtml(this._treeSwitcherQuery || '');
                        if (typeof this._bindTreeSwitcherListButtons === 'function') this._bindTreeSwitcherListButtons();
                    }
                    if (dp) {
                        _bindLocalSnapshotSwitch(this, dp);
                        _bindSnapshotsAdminActions(this, dp);
                    }
                });
            });
            // Bind version actions inside the unified panel.
            const liveBtn = docPanel?.querySelector?.(`#${CURRICULUM_SWITCHER_VERSION_LIVE_ID}`);
            if (liveBtn) {
                bindMobileTap(liveBtn, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    applyLiveSwitch();
                    close();
                });
            }
            docPanel?.querySelectorAll?.(`.${CURRICULUM_SWITCHER_VERSION_ITEM_CLASS}`).forEach((b) => {
                bindMobileTap(b, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const raw = b.getAttribute('data-json');
                    if (!raw) return;
                    try {
                        const data = JSON.parse(decodeURIComponent(raw));
                        applyReleaseSwitch(data);
                    } catch {
                        return;
                    }
                    close();
                });
            });
            const localBtn = docPanel?.querySelector?.(`#${CURRICULUM_SWITCHER_VERSION_LOCAL_ID}`);
            if (localBtn) {
                bindMobileTap(localBtn, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    close();
                });
            }

            if (docPanel) _bindLocalSnapshotSwitch(this, docPanel);
            if (docPanel) _bindSnapshotsAdminActions(this, docPanel);
        };

        if (btn) {
            bindMobileTap(btn, (e) => {
                e.preventDefault();
                e.stopPropagation();
                const hydrating = !!store.value.treeHydrating;
                if (hydrating) return;
                if (this._treeSwitcherOpen) close();
                else open();
            });
        }
        if (backdrop) {
            bindMobileTap(backdrop, (e) => {
                e.preventDefault();
                e.stopPropagation();
                close();
            });
        }
        if (panel) {
            panel.querySelectorAll('[data-act="close"]').forEach((b) => {
                bindMobileTap(b, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    close();
                });
            });
        }
        if (inp && inp instanceof HTMLInputElement) {
            inp.oninput = () => {
                if (this._treeSwitcherSearchDebounce != null) clearTimeout(this._treeSwitcherSearchDebounce);
                this._treeSwitcherSearchDebounce = setTimeout(() => {
                    this._treeSwitcherSearchDebounce = null;
                    this._treeSwitcherQuery = inp.value || '';
                    if (list) {
                        list.innerHTML = _renderTreeSwitcherListHtml(this._treeSwitcherQuery);
                        if (typeof this._bindTreeSwitcherListButtons === 'function') this._bindTreeSwitcherListButtons();
                    }
                }, 140);
            };
        }
        if (more) {
            bindMobileTap(more, (e) => {
                e.preventDefault();
                e.stopPropagation();
                close();
                store.setModal('sources');
            });
        }
        const bindListButtons = () => {
            if (!list) return;
            list.querySelectorAll(`.${TREE_SWITCHER_ITEM_CLASS}`).forEach((b) => {
                bindMobileTap(b, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (store.value.treeHydrating) return;
                    const kind = String(b.getAttribute('data-tree-kind') || '');
                    const id = String(b.getAttribute('data-tree-id') || '');
                    const url = String(b.getAttribute('data-tree-url') || '');
                    const treeName = String(b.getAttribute('data-tree-name') || '').trim() || id;
                    if (!id || !url) return;
                    if (kind === 'local') {
                        store.loadData({ id, name: treeName, url, type: 'local', isTrusted: true }, false);
                    } else {
                        // Installed community source: lookup for full metadata when possible.
                        const src = (store.value.communitySources || []).find((s) => String(s.id) === String(id));
                        store.loadData(src || { id, name: treeName, url, type: 'community' }, true);
                    }
                    close();
                });
            });
        };

        if (list) bindListButtons();

        // Expose a lightweight binder so we can re-bind after list HTML refreshes.
        this._bindTreeSwitcherListButtons = bindListButtons;
    }

/**
 * Programmatically open the unified curriculum switcher overlay.
 * Used to redirect legacy entrypoints (sidebar, auto-open after version travel).
 */
export function openUnifiedCurriculumSwitcher() {
    this._versionMenuOpen = false;
    this._treeSwitcherOpen = true;
    this._mobileRenderKey = null;
    if (typeof this.refreshCurriculumChrome === 'function') this.refreshCurriculumChrome();
}

export function renderMobileTopBanner() {
        const el = this.querySelector('#mobile-overlays');
        if (!el) return;
        el.className =
            'absolute top-0 left-0 right-0 z-40 flex flex-col items-center pointer-events-none px-3';
        el.style.paddingTop = 'max(0.35rem, env(safe-area-inset-top))';

        const ui = store.ui;
        const pendingId = this.pendingMoveNodeId;
        if (pendingId && store.value.constructionMode && fileSystem.features.canWrite) {
            const moving = store.findNode(pendingId);
            if (moving && moving.type !== 'root') {
                el.style.display = 'flex';
                const hint =
                    ui.movePickOnTreeHint ||
                    ui.movePickOnTreeBanner ||
                    'Open the destination folder, then tap Move here.';
                const name = moving.name || '';
                el.innerHTML = `
                <div class="arborito-move-pick-banner pointer-events-auto w-full max-w-xl rounded-xl border border-amber-500/45 bg-amber-50 dark:bg-amber-950/88 text-amber-950 dark:text-amber-50 px-3 py-2 shadow-lg flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                    <p class="text-xs font-bold leading-snug m-0">${escHtml(hint)}${name ? ` <span class="font-black">${escHtml(name)}</span>` : ''}</p>
                    <button type="button" class="arborito-move-pick-cancel shrink-0 text-xs font-black uppercase tracking-wide px-3 py-1.5 rounded-lg bg-amber-200/90 dark:bg-amber-900/75 text-amber-950 dark:text-amber-100 border border-amber-700/15">${escHtml(
                        ui.cancel || 'Cancel'
                    )}</button>
                </div>`;
                el.querySelector('.arborito-move-pick-cancel')?.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.pendingMoveNodeId = null;
                    this.invalidateMobilePrototypeKeys();
                    this.renderMobileTopBanner();
                    if (store.value.data) this.renderMobilePrototypeTree(store.value.data);
                });
                return;
            }
            this.pendingMoveNodeId = null;
        }

        el.innerHTML = '';
        el.style.display = 'none';
    }

/**
     * Barra de herramientas del nodo en el panel del camino (sustituye al dock flotante).
     */
export function createMobileNodeToolbarElement(node) {
        const ui = store.ui;
        const canWrite = fileSystem.features.canWrite;
        const wrap = document.createElement('div');
        wrap.className = 'mobile-node-toolbar';
        wrap.setAttribute('role', 'toolbar');
        if (!node) return wrap;

        if (!canWrite) {
            wrap.innerHTML = `<div class="mobile-node-toolbar--readonly"><span aria-hidden="true">🔒</span> ${ui.graphReadOnly || 'Read Only'}</div>`;
            return wrap;
        }

        const isRoot = node.type === 'root';
        const canAddChildren = node.type !== 'exam';
        const isFolderNode = node.type === 'root' || node.type === 'branch';
        const canMove = !isRoot && canWrite && fileSystem.features.canMove;
        const ct = constructionToolbarUi(ui, node);

        const inner = document.createElement('div');
        inner.className = 'mobile-node-toolbar-inner';

        const addBtn = (act, icon, title, opts = {}) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'mobile-node-tool' + (opts.danger ? ' mobile-node-tool--danger' : '');
            b.setAttribute('data-act', act);
            b.title = title;
            b.setAttribute('aria-label', title);
            b.innerHTML = `<span class="mobile-node-tool__ic" aria-hidden="true">${icon}</span>`;
            if (opts.disabled) b.disabled = true;
            inner.appendChild(b);
        };

        if (canMove) addBtn('move', '✥', ui.graphMove || 'Move');
        addBtn('edit', isRoot ? '📋' : '✏️', ct.editLabel || 'Edit');
        if (canAddChildren) {
            // Only folders (root/branch) can create children. A lesson/leaf should not offer “Add folder”.
            if (isFolderNode) {
                addBtn('add-folder', ct.addFolderIconHtml, ct.addFolderLabel || 'Add folder');
                addBtn('add-file', ct.addLessonIconHtml, ct.addLessonLabel || 'Add lesson');
            }
        }
        if (!isRoot) {
            addBtn('delete', '🗑️', ui.graphDelete || 'Delete', { danger: true });
        }

        wrap.appendChild(inner);
        return wrap;
    }

export function bindMobileNodeToolbar(wrap, node) {
        wrap.querySelectorAll('.mobile-node-tool[data-act]').forEach((btn) => {
            bindMobileTap(btn, async (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (btn.disabled) return;
                this.selectedNodeId = node.id;
                const act = btn.getAttribute('data-act');
                if (act === 'move') this.openMoveNodePicker();
                else if (act === 'edit') {
                    if (node.type === 'branch' || node.type === 'root') store.setModal({ type: 'node-properties', node });
                    else store.openEditor(node);
                } else if (act === 'delete') await this.handleDockAction('delete');
                else if (act === 'add-folder') await this.handleDockAction('new-folder');
                else if (act === 'add-file') await this.handleDockAction('new-file');
            });
        });
    }

export function buildMobileInlineNodeToolsHTML(node, opts = {}) {
        const ui = store.ui;
        const canWrite = fileSystem.features.canWrite;
        if (!node || !canWrite) return '';
        const compactClass = opts.compact ? ' mobile-inline-tools--compact' : '';
        const isRoot = node.type === 'root';
        const canAddChildren = node.type !== 'exam';
        const isFolderNode = node.type === 'root' || node.type === 'branch';
        const canMove = !isRoot && fileSystem.features.canMove;
        const folderContextDimmed = !!opts.folderContextDimmed;
        const revealDelete = opts.revealDelete !== false;
        const omitDelete = !!opts.omitDelete;
        const ct = constructionToolbarUi(ui, node);
        const folderHint = ct.folderHint;

        const btn = (act, iconHtml, title, extra = '', disabled = false) =>
            `<button type="button" class="mobile-inline-tool${extra}" data-act="${act}" aria-label="${escAttr(title)}" title="${escAttr(title)}"${disabled ? ' disabled' : ''}><span aria-hidden="true">${iconHtml}</span></button>`;

        const nodeToolsAria = ct.toolsGroupAria || 'Node tools';
        const isConstructLesson =
            !!store.value.constructionMode && (node.type === 'leaf' || node.type === 'exam');
        const isConstructFolder = !!store.value.constructionMode && node.type === 'branch' && !isRoot;
        const openLessonLabel = ui.graphOpenLessonEditor || 'Edit lesson';
        const gearSvg =
            '<svg class="mobile-inline-tool__svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.075-.124l-1.217.456a1.125 1.125 0 01-1.37-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>';

        let inner = `<div class="mobile-inline-tools${compactClass}" role="group" aria-label="${escHtml(nodeToolsAria)}">`;
        if (canMove) inner += btn('move', '↕️', ui.graphMove || 'Move');
        if (isConstructLesson) {
            inner += btn('edit', gearSvg, openLessonLabel, ' mobile-inline-tool--gear');
        }
        if (!isRoot && !omitDelete) {
            // In construction mode for lessons/exams we never hide the delete
            // button: on mobile there is no hover and requiring select-first is confusing.
            // Also in construction the ✕ must always be visible (mobile/desktop):
            // hiding it behind hover/selection is annoying, especially on touch.
            const shouldHide = revealDelete && !store.value.constructionMode;
            const delReveal = shouldHide ? ' mobile-inline-tool--hover-reveal' : '';
            if (isConstructFolder) {
                const viewFolderLabel = ui.graphViewFolder || 'View folder';
                inner += `<button type="button" class="mobile-inline-tool mobile-inline-tool--view-folder" data-act="view-folder" aria-label="${escAttr(
                    viewFolderLabel
                )}" title="${escAttr(viewFolderLabel)}"><span class="mobile-inline-tool__label">${escHtml(
                    viewFolderLabel
                )}</span></button>`;
            }
            inner += btn('delete', '✕', ui.graphDelete || 'Delete', ` mobile-inline-tool--danger${delReveal}`);
        }
        inner += `</div>`;

        const hostExtra = folderContextDimmed ? ' mobile-inline-tools-host--folder-context-dimmed' : '';
        const hostTitle = folderContextDimmed && folderHint ? ` title="${escAttr(folderHint)}"` : '';
        return `<div class="mobile-inline-tools-host${hostExtra}"${hostTitle}>${inner}</div>`;
    }

export function createMobileInlineNodeTools(node, opts = {}) {
        const html = this.buildMobileInlineNodeToolsHTML(node, opts);
        if (!html) return null;
        const host = document.createElement('div');
        host.innerHTML = html;
        return host.firstElementChild;
    }

export async function runMobileNodeAction(node, act) {
        if (!node || !act) return;
        if (act === 'move') {
            if (node.type === 'root') return;
            this.selectedNodeId = node.id;
            this.openMoveNodePicker();
            return;
        }
        if (act === 'edit') {
            this.selectedNodeId = node.id;
            this.isMoveMode = false;
            if (node.type === 'branch' || node.type === 'root') store.setModal({ type: 'node-properties', node });
            else store.openEditor(node);
            return;
        }
        if (act === 'delete' || act === 'add-folder' || act === 'add-file') {
            this.selectedNodeId = node.id;
            const dock =
                act === 'add-folder' ? 'new-folder' : act === 'add-file' ? 'new-file' : 'delete';
            await this.handleDockAction(dock);
        }
    }

export function bindMobileInlineNodeTools(scope, node) {
        if (!scope || !node) return;
        scope.querySelectorAll('.mobile-inline-tool[data-act]').forEach((btn) => {
            bindMobileTap(btn, async (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (btn.disabled || btn.classList.contains('is-disabled')) return;
                const act = btn.getAttribute('data-act');
                if (act === 'view-folder') {
                    this.selectedNodeId = node.id;
                    this.isMoveMode = false;
                    let n = store.findNode(node.id);
                    if (!n || n.type !== 'branch') return;
                    if (n.hasUnloadedChildren && (!n.children || n.children.length === 0)) {
                        await store.loadNodeChildren(n);
                        n = store.findNode(node.id) || n;
                    }
                    this.mobilePath.push(n.id);
                    this.invalidateMobilePrototypeKeys();
                    this._mobileRenderKey = null;
                    this.renderMobilePrototypeTree(store.value.data);
                    schedulePersistTreeUiState(store);
                    return;
                }
                await this.runMobileNodeAction(node, act);
                this._mobileRenderKey = null;
                if (store.value.data) this.renderMobilePrototypeTree(store.value.data);
            });
        });
    }
