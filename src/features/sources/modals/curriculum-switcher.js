import { store } from '../../../core/store.js';
import {
    curriculumTreeDisplayName,
    getVersionPresentation,
    applyReleaseSwitch,
    applyLiveSwitch
} from '../../version-updates/version-switch-logic.js';
import { bindMobileTap } from '../../../shared/ui/mobile-tap.js';
import {
    escHtml,
    escAttr,
    treeSwitcherPanelHeroHtml,
    bindTreeSwitcherCloseButtons,
    _renderTreeSwitcherListHtml,
    CURRICULUM_SWITCHER_BTN_ID,
    CURRICULUM_SWITCHER_VERSION_LIVE_ID,
    CURRICULUM_SWITCHER_VERSION_ITEM_CLASS,
    CURRICULUM_SWITCHER_VERSION_LOCAL_ID,
    CURRICULUM_SWITCHER_VERSION_SEARCH_ID,
    TREE_SWITCHER_BACKDROP_ID,
    TREE_SWITCHER_PANEL_ID,
    TREE_SWITCHER_SEARCH_ID,
    TREE_SWITCHER_LIST_ID,
    TREE_SWITCHER_MORE_ID,
    TREE_SWITCHER_ITEM_CLASS
} from '../../tree-graph/graph/graph-mobile-shared.js';
import {
    _renderVersionTimelineHtml,
    _refreshVersionTimelineInOpenPanel,
    _ensureLocalSnapshotsLoaded,
    _bindLocalSnapshotSwitch
} from '../../version-updates/version-timeline.js';
import {
    _renderSnapshotsAdminHtml,
    _ensureSnapshotsAdminLoaded,
    _bindSnapshotsAdminActions
} from '../../version-updates/snapshots-admin.js';

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
    const panelTitle = escHtml(ui.treeSwitcherUnifiedTitle || ui.treeSwitcherTitle || 'Switch version and tree');
    const panelHero = treeSwitcherPanelHeroHtml(ui, panelTitle);

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
            ${panelHero}
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
            this.invalidateMobilePrototypeKeys();
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
            bindTreeSwitcherCloseButtons(docPanel || panel, close);
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
            bindTreeSwitcherCloseButtons(panel, close);
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
 * Called by the graph host after a version-travel auto-redirect.
 */
export function openUnifiedCurriculumSwitcher() {
    this._versionMenuOpen = false;
    this._treeSwitcherOpen = true;
    if (typeof this.invalidateMobilePrototypeKeys === 'function') this.invalidateMobilePrototypeKeys();
    if (typeof this.refreshCurriculumChrome === 'function') this.refreshCurriculumChrome();
}
