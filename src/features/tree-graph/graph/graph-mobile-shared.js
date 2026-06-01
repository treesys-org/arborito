import { store } from '../../../core/store.js';
import { bindMobileTap } from '../../../shared/ui/mobile-tap.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { escHtml, escAttr } from '../../../shared/lib/html-escape.js';
import { modalHeroHtml } from '../../../shared/ui/modal-hero.js';

// Re-exported so existing consumers (modals, search-panel, sibling files) can
// continue importing the escape helpers through the graph-mobile family.
export { escHtml, escAttr };

// --- Tree switcher (installed sources) ---
export const TREE_SWITCHER_BTN_ID = 'arborito-tree-switcher-btn';
export const TREE_SWITCHER_BACKDROP_ID = 'arborito-tree-switcher-backdrop';
export const TREE_SWITCHER_PANEL_ID = 'arborito-tree-switcher-panel';
export const TREE_SWITCHER_SEARCH_ID = 'arborito-tree-switcher-search';
export const TREE_SWITCHER_LIST_ID = 'arborito-tree-switcher-list';
export const TREE_SWITCHER_MORE_ID = 'arborito-tree-switcher-more';
export const TREE_SWITCHER_ITEM_CLASS = 'arborito-tree-switcher-item';

// --- Unified curriculum switcher (Version + Tree) ---
export const CURRICULUM_SWITCHER_BTN_ID = 'arborito-curriculum-switcher-btn';
export const CURRICULUM_SWITCHER_VERSION_LIVE_ID = 'arborito-curriculum-switcher-version-live';
export const CURRICULUM_SWITCHER_VERSION_ITEM_CLASS = 'arborito-curriculum-switcher-version-item';
export const CURRICULUM_SWITCHER_VERSION_LOCAL_ID = 'arborito-curriculum-switcher-version-local';
export const CURRICULUM_SWITCHER_SNAP_INP_ID = 'arborito-curriculum-switcher-snap-inp';
export const CURRICULUM_SWITCHER_SNAP_CREATE_ID = 'arborito-curriculum-switcher-snap-create';
export const CURRICULUM_SWITCHER_SNAP_ITEM_CLASS = 'arborito-curriculum-switcher-snap-item';
export const CURRICULUM_SWITCHER_SNAP_DEL_CLASS = 'arborito-curriculum-switcher-snap-del';
export const CURRICULUM_SWITCHER_VERSION_SEARCH_ID = 'arborito-curriculum-switcher-version-search';
export const CURRICULUM_SWITCHER_SNAP_SEARCH_ID = 'arborito-curriculum-switcher-snap-search';

export function treeSwitcherPanelHeroHtml(ui, title) {
    const mobUi = shouldShowMobileUI();
    return modalHeroHtml(ui, {
        title,
        mobile: mobUi,
        showClose: !mobUi,
        trailingSpacer: mobUi,
        backTagClass: 'arborito-tree-switcher-close',
        titleId: 'arborito-tree-switcher-heading',
    });
}

export function bindTreeSwitcherCloseButtons(panel, close) {
    if (!panel) return;
    panel
        .querySelectorAll(
            '[data-act="close"], .arborito-tree-switcher-head .btn-close, .arborito-tree-switcher-head .arborito-tree-switcher-close'
        )
        .forEach((b) => {
            bindMobileTap(b, (e) => {
                e.preventDefault();
                e.stopPropagation();
                close();
            });
        });
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

export function _renderTreeSwitcherListHtml(qRaw) {
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
