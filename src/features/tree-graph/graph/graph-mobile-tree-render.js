/* ──────────────────────────────────────────────────────────────────────────
 * Trunk renderer (single, adaptive — phones and desktop).
 *
 * The exports here are merged onto `<arborito-graph>.prototype` by `graph.js`.
 * The single entry point `renderMobilePrototypeTree(rootData)` rebuilds the
 * canvas: knot column on the left, active branch panel on the right with the
 * children rows. Skips work via two flat string signatures (`_lastTrunkSig`,
 * `_lastChildrenSig`) — no `JSON.stringify` cache keys, no "chrome-only"
 * fast path, no per-key fan-out: the function is short enough that always
 * doing one rebuild on signature mismatch is cheap and predictable.
 *
 * Where to look for visual changes:
 *   • knot / row markup → bottom of `renderMobilePrototypeTree` + `tree-row.js`
 *   • panel header → `panel-head.js` (shared by every variant)
 *   • children rows → `renderChildrenRows` below
 *   • SVG line + scroll math → `graph-mobile-overlay.js`
 * ────────────────────────────────────────────────────────────────────────── */

import { store } from '../../../core/store.js';
import { fileSystem } from '../../backup-export/filesystem.js';
import { schedulePersistTreeUiState } from '../tree-ui-persist.js';
import { escHtml, escAttr } from './graph-mobile-shared.js';
import { VERSION_TOGGLE_ID } from '../../version-updates/version-graph-helpers.js';
import { curriculumTreeDisplayName } from '../../version-updates/version-switch-logic.js';
import { TreeUtils } from '../tree-utils.js';
import { iconArboritoRootSvg } from '../../shell-chrome/sidebar-utils.js';
import {
    mountConstructionCreateFab,
    openConstructionEmojiPicker,
    closeConstructionEmojiPicker,
} from './graph-mobile-tree-panel-tools.js';
import { bindChildInlineRename } from './graph-mobile-tree-bindings.js';
import { buildPanelHead, bindPanelHead } from './panel-head.js';

/* ── Inlined from the former graph-mobile-tree-row.js ───────────────────── */

/** Short date for folder row (keep away from delete in construction). */
function formatBranchUpdatedLabel(node) {
    const raw = node?._meta?.updatedAt ?? node?.meta?.updatedAt ?? node?.updatedAt;
    if (raw == null || raw === '') return '';
    try {
        const d = new Date(typeof raw === 'number' ? raw : String(raw));
        if (Number.isNaN(d.getTime())) return '';
        return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
        return '';
    }
}

/** Path label row (the active node shares `current` with the children panel). */
function createMobilePathLabelRow(graph, { node, index, pathNodes }) {
    const isActive = index === pathNodes.length - 1;
    const labelRow = document.createElement('div');
    const showRootVersion =
        index === 0 && store.value.viewMode === 'explore' && store.value.activeSource;

    if (showRootVersion) {
        /* Panel chip already includes tree + version; do not repeat the name. */
        labelRow.className = `mobile-label-row ${isActive ? 'is-active' : ''} mobile-label-row--suppress-title`;
        labelRow.innerHTML = `<span class="mobile-label-text" title=""></span>`;
    } else {
        /* Active node's title is shown by the panel chip; keep the row here for
         * trunk alignment without duplicating the name. */
        const suppressActiveTitle = isActive && node.type !== 'root';
        const rowTitle = suppressActiveTitle
            ? ''
            : node.type === 'root'
              ? curriculumTreeDisplayName(store.ui)
              : node.name || '';
        labelRow.className = `mobile-label-row ${isActive ? 'is-active' : ''}${
            suppressActiveTitle ? ' mobile-label-row--suppress-title' : ''
        }`;
        labelRow.innerHTML = `<span class="mobile-label-text" title="${escAttr(rowTitle)}">${escHtml(rowTitle)}</span>`;
    }

    if (!isActive) {
        const tapEl = showRootVersion ? labelRow.querySelector('.mobile-label-row__text') : labelRow;
        if (tapEl) {
            graph.bindMobileTap(tapEl, () => {
                graph.mobilePath = graph.mobilePath.slice(0, index + 1);
                graph.invalidateMobilePrototypeKeys();
                graph.renderMobilePrototypeTree(store.value.data);
                schedulePersistTreeUiState(store);
            });
        }
    } else if (store.value.constructionMode && fileSystem.features.canWrite) {
        graph.bindMobileTap(labelRow, (ev) => {
            const t = ev?.target;
            if (
                t &&
                typeof t.closest === 'function' &&
                t.closest(
                    '#arborito-curriculum-switcher-btn, #arborito-tree-switcher-btn, #arborito-tree-switcher-panel, #arborito-tree-switcher-backdrop, .arborito-tree-switcher-chip, .arborito-tree-switcher-host, .arborito-curriculum-switcher-host, #arborito-version-toggle, #arborito-version-dropdown-panel, #arborito-version-dropdown-backdrop, .arborito-version-archive-item, #arborito-version-live, .mobile-panel-version-slot'
                )
            ) {
                return;
            }
            graph.selectedNodeId = node.id;
            graph.isMoveMode = false;
            graph.invalidateMobilePrototypeKeys();
            graph.renderMobilePrototypeTree(store.value.data);
        });
        /* Inline tools on the path row only when the panel is NOT already
         * rendering them (avoids duplicate "VIEW FOLDER / ✕" floating outside
         * the chip in column-reverse layout, especially at end-of-branch). */
        const listedKids = Array.isArray(node.children) ? node.children : [];
        const deferFolderToolsToPanel =
            listedKids.length > 0 ||
            !!node.hasUnloadedChildren ||
            !!store.value.constructionMode;
        if (!deferFolderToolsToPanel) {
            const inlineTools = graph.createMobileInlineNodeTools(node, {
                compact: true,
                revealDelete: false,
            });
            if (inlineTools) {
                labelRow.appendChild(inlineTools);
                graph.bindMobileInlineNodeTools(inlineTools, node);
            }
        }
    }
    return labelRow;
}

/* ── Inlined from the former graph-mobile-tree-state.js ─────────────────── */

/** Mobile construction at root: saved scroll must not push the trunk under
 *  the course card again. */
function shouldZeroConstructionRootTrunkScroll(graph) {
    if (!store.value.constructionMode || !fileSystem.features.canWrite) return false;
    if (typeof document === 'undefined') return false;
    const docRoot = document.documentElement;
    if (
        !docRoot.classList.contains('arborito-construction-mobile') ||
        docRoot.classList.contains('arborito-desktop')
    ) {
        return false;
    }
    const p = graph?.mobilePath;
    return Array.isArray(p) && p.length <= 1;
}

/** Post-layout scroll: recompute from path on navigation; preserve on same-path
 *  re-renders. */
function finishPathRenderScroll(graph, opts) {
    const { syncScroll, preserveTrunkScroll, pathNodes } = opts;
    graph.scheduleMobilePrototypeOverlay();
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            const el = graph.mobileTrunkContainer;
            if (syncScroll) {
                graph.syncMobilePathScroll(pathNodes);
            } else if (el && preserveTrunkScroll != null && Number.isFinite(preserveTrunkScroll)) {
                el.scrollTop = preserveTrunkScroll;
            }
            graph.clampMobileTrunkScrollForVisibleRoot(graph);
            graph.drawMobilePrototypeOverlay();
        });
    });
}

/** Cleared after `mobilePath`, selection, or completed-set changes so the next
 *  render rebuilds the full DOM (knots, panel, listeners). */
export function invalidateMobilePrototypeKeys() {
    this._lastTrunkSig = '';
    this._lastChildrenSig = '';
}

/* ── Signature helpers ──────────────────────────────────────────────────── */

function buildTrunkSig(graph, root, current, pathNodes, harvested, completedSet) {
    return [
        graph.mobilePath.join('>'),
        store.value.lang || '',
        store.value.curriculumEditLang || '',
        store.value.activeSource?.id || '',
        store.value.activeSource?.url || '',
        root?.id != null ? String(root.id) : '',
        store.value.viewMode || '',
        store.value.theme || '',
        completedSet ? completedSet.size : 0,
        harvested.length,
        store.value.nostrLiveSeeds == null ? '' : String(store.value.nostrLiveSeeds),
        document.documentElement.classList.contains('arborito-desktop') ? 'd' : 'm',
        curriculumTreeDisplayName(store.ui).slice(0, 240),
        graph._versionMenuOpen ? 'v1' : 'v0',
        graph._inlineRenameNodeId != null ? String(graph._inlineRenameNodeId) : '',
        store.value.constructionMode ? 'c1' : 'c0',
        graph.selectedNodeId != null ? String(graph.selectedNodeId) : '',
        fileSystem.features.canWrite ? 'w1' : 'w0',
        graph.pendingMoveNodeId != null ? String(graph.pendingMoveNodeId) : '',
        pathNodes.map((n) => `${n.id}:${(n.name || '').slice(0, 240)}`).join('\u001e'),
    ].join('|');
}

function buildChildrenSig(current) {
    const kids = Array.isArray(current.children) ? current.children : [];
    return kids
        .map((c) =>
            `${c.id}:${(c.name || '').slice(0, 240)}:${c.type || ''}:${
                c.hasUnloadedChildren ? 1 : 0
            }:${Array.isArray(c.children) ? c.children.length : 0}:${c.icon || ''}`
        )
        .join('\u001e');
}

/* ── Children-row helpers ───────────────────────────────────────────────── */

function buildChildIconCell(child, childIcon, isConstruct, canWrite, hideInlineWhilePickingMove, ui) {
    const editable = isConstruct && canWrite && !hideInlineWhilePickingMove;
    return editable
        ? `<button type="button" class="mobile-child-icon-btn" aria-label="${escAttr(
              ui.graphChangeIcon || ui.graphEdit || 'Icon'
          )}"><span class="mobile-child-icon" aria-hidden="true">${childIcon}</span></button>`
        : `<span class="mobile-child-icon" aria-hidden="true">${childIcon}</span>`;
}

function pickChildIcon(child, childCompleted) {
    if (child.type === 'exam' && childCompleted) return '✔';
    if (child.icon) return child.icon;
    if (child.type === 'branch') return '📁';
    if (child.type === 'exam') return '📝';
    return '📖';
}

function buildFolderTrail(child, isFolderRow, isConstruct, canWrite, hideInlineWhilePickingMove, ui, hasKidsLoaded) {
    const showArrow = isFolderRow || hasKidsLoaded;
    const useFolderTrail = isFolderRow && isConstruct && canWrite && !hideInlineWhilePickingMove;
    if (useFolderTrail) {
        const dateStr = formatBranchUpdatedLabel(child);
        const dateHint = ui.graphFolderUpdatedHint || 'Last update';
        const dateBlock = dateStr
            ? `<span class="mobile-child-folder-meta" title="${escAttr(`${dateHint}: ${dateStr}`)}">${escHtml(dateStr)}</span>`
            : '';
        return `<div class="mobile-child-folder-trail">${dateBlock}<div class="mobile-child-arrow" aria-hidden="true">›</div></div>`;
    }
    return showArrow ? `<div class="mobile-child-arrow" aria-hidden="true">›</div>` : '';
}

function renderChildRow(graph, child, ctx) {
    const { isConstruct, canWrite, hideInlineWhilePickingMove, harvested, ui } = ctx;
    const hasKidsLoaded = child.children && child.children.length > 0;
    const tone = graph.getMobileTone(child);
    const childCompleted = store.isCompleted && store.isCompleted(child.id);
    const childHarvested = harvested.find((h) => String(h.id) === String(child.id));
    const childState = childHarvested
        ? ' state-harvested'
        : child.isEmpty
          ? ' state-empty'
          : childCompleted
            ? ' state-completed'
            : '';
    const rowState = childHarvested ? '' : child.isEmpty ? ' is-empty' : childCompleted ? ' is-completed' : '';
    const isFolderRow = child.type === 'branch';

    const childIcon = pickChildIcon(child, childCompleted);

    const isRowSel =
        isConstruct &&
        canWrite &&
        !hideInlineWhilePickingMove &&
        graph.selectedNodeId != null &&
        String(child.id) === String(graph.selectedNodeId);
    const childTools =
        isConstruct && canWrite && !hideInlineWhilePickingMove
            ? graph.buildMobileInlineNodeToolsHTML(child, { compact: true })
            : '';

    const cname = child.name || '';
    const nameLine = `${escHtml(cname)}${childCompleted ? ' · ✔' : ''}`;
    const renamingRow =
        isConstruct && canWrite && String(graph._inlineRenameNodeId || '') === String(child.id);
    const renameLbl = ui.graphRename || ui.graphEdit || 'Rename';
    const nameBlock = renamingRow
        ? `<input type="text" class="mobile-child-name-input mobile-child-name-input--inset" value="${escAttr(cname)}" aria-label="${escAttr(renameLbl)}" />`
        : `<div class="mobile-child-name mobile-child-name-slot" title="${escAttr(cname)}">${nameLine}</div>`;
    const renameAffix =
        !renamingRow && isConstruct && canWrite
            ? `<button type="button" class="mobile-child-rename-btn shrink-0 text-sm leading-none p-0.5 rounded hover:bg-slate-200/60 dark:hover:bg-slate-700/60" aria-label="${escAttr(renameLbl)}" title="${escAttr(renameLbl)}">✏️</button>`
            : '';

    const row = document.createElement('div');
    row.className = `mobile-child-row${rowState}${isRowSel ? ' mobile-child-row--selected' : ''}${
        isFolderRow ? ' mobile-child-row--folder' : ''
    }`;
    row.setAttribute('data-node-id', String(child.id));

    const iconHit = buildChildIconCell(child, childIcon, isConstruct, canWrite, hideInlineWhilePickingMove, ui);
    const folderTrailHtml = buildFolderTrail(
        child,
        isFolderRow,
        isConstruct,
        canWrite,
        hideInlineWhilePickingMove,
        ui,
        hasKidsLoaded
    );

    row.innerHTML =
        `<div class="mobile-child-knot tone-${tone}${childState}">${iconHit}</div>` +
        renameAffix +
        `<div class="mobile-child-info">${nameBlock}</div>` +
        childTools +
        folderTrailHtml;

    const iconBtn = row.querySelector('.mobile-child-icon-btn');
    if (iconBtn) {
        graph.bindMobileTap(iconBtn, (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            openConstructionEmojiPicker(graph, iconBtn, child);
        });
    }

    graph.bindMobileTap(row, async (e) => {
        try {
            const t = e?.target;
            const fromIconBtn = t && typeof t.closest === 'function' && t.closest('.mobile-child-icon-btn');
            if (fromIconBtn) return;
            const fromTools = t && typeof t.closest === 'function' && t.closest('.mobile-inline-tools');
            if (fromTools) return;
            const fromNameInput = t && typeof t.closest === 'function' && t.closest('.mobile-child-name-input');
            if (fromNameInput) return;
            const fromRenameBtn = t && typeof t.closest === 'function' && t.closest('.mobile-child-rename-btn');
            if (fromRenameBtn) return;

            if (
                store.value.constructionMode &&
                fileSystem.features.canWrite &&
                !graph.pendingMoveNodeId
            ) {
                graph.selectedNodeId = child.id;
                graph.isMoveMode = false;
            }
            if (child.type === 'leaf' || child.type === 'exam') {
                if (store.value.constructionMode && fileSystem.features.canWrite) {
                    graph.selectedNodeId = child.id;
                    graph.invalidateMobilePrototypeKeys();
                    if (store.value.data) graph.renderMobilePrototypeTree(store.value.data);
                }
                await store.openNodeFromMobileTree(child.id);
                return;
            }
            if (child.type === 'branch') {
                if (child.hasUnloadedChildren && (!child.children || child.children.length === 0)) {
                    await store.loadNodeChildren(child);
                }
                graph.mobilePath.push(child.id);
                graph.invalidateMobilePrototypeKeys();
                graph.renderMobilePrototypeTree(store.value.data);
                schedulePersistTreeUiState(store);
                return;
            }
            await store.openNodeFromMobileTree(child.id);
        } catch (err) {
            console.error('Mobile tree navigation failed', err);
        }
    });

    const toolsHost = row.querySelector('.mobile-inline-tools-host');
    if (toolsHost) graph.bindMobileInlineNodeTools(toolsHost, child);
    bindChildInlineRename(graph, row, child);

    const wrap = document.createElement('div');
    wrap.className = 'mobile-child-wrap';
    wrap.appendChild(row);
    return wrap;
}

/* ── Active panel ───────────────────────────────────────────────────────── */

function buildActivePanel(graph, current, harvested, ui) {
    const panel = document.createElement('div');
    panel.className = 'mobile-children-panel';

    const children = Array.isArray(current.children) ? current.children : [];
    const isConstruct = !!store.value.constructionMode;
    const canWrite = fileSystem.features.canWrite;
    const hideInlineWhilePickingMove = !!graph.pendingMoveNodeId;
    const directChildSelected =
        graph.selectedNodeId != null &&
        children.some((c) => String(c.id) === String(graph.selectedNodeId));

    /* Lazy children: panel shows a loading state while we fetch them. The FAB
     * still mounts so the user can create siblings without waiting. */
    if (children.length === 0 && current.hasUnloadedChildren) {
        const loading = ui.mobileLoadingCount || 'Loading…';
        panel.innerHTML =
            `<div class="mobile-panel-header">${escHtml(loading)}</div>` +
            `<div class="mobile-empty-branch">` +
            `<div class="mobile-empty-branch-icon">⏳</div>` +
            `<div class="mobile-empty-branch-text">${escHtml(loading)}</div></div>`;
        if (isConstruct && canWrite) {
            mountConstructionCreateFab(graph, panel, current);
        }
        store
            .loadNodeChildren(current)
            .then(() => {
                graph.invalidateMobilePrototypeKeys();
                graph.renderMobilePrototypeTree(store.value.data);
            })
            .catch(() => {
                /* ignore */
            });
        return panel;
    }

    /* Common header (back / emoji / title / chips / tools / move-here). */
    const headHtml = buildPanelHead(graph, current, ui, { directChildSelected });

    if (children.length === 0) {
        panel.innerHTML =
            headHtml +
            `<div class="mobile-empty-branch">` +
            `<div class="mobile-empty-branch-icon" aria-hidden="true"></div>` +
            `<div class="mobile-empty-branch-text">${escHtml(ui.mobileEndOfBranch || 'End of Branch')}</div></div>`;
        bindPanelHead(graph, panel, current);
        if (isConstruct && canWrite) {
            mountConstructionCreateFab(graph, panel, current);
        }
        return panel;
    }

    panel.innerHTML = headHtml;
    bindPanelHead(graph, panel, current);

    const ctx = { isConstruct, canWrite, hideInlineWhilePickingMove, harvested, ui };
    children.forEach((child) => {
        panel.appendChild(renderChildRow(graph, child, ctx));
    });

    return panel;
}

/* ── Main render entry point ────────────────────────────────────────────── */

export function renderMobilePrototypeTree(root) {
    if (!root) return;

    /* Source switch: clear "growth pulse" memory so the new tree doesn't pulse
     * just because path depth happens to grow. */
    const growthSrc = String(store.value.activeSource?.id || '');
    if (this._growthPulseSourceId !== growthSrc) {
        this._growthPulseSourceId = growthSrc;
        this._lastMobileBranchChildCount = undefined;
    }

    const prevPathDepthForGrowth =
        typeof this._prevMobilePathDepth === 'number' ? this._prevMobilePathDepth : null;

    if (
        !Array.isArray(this.mobilePath) ||
        this.mobilePath.length === 0 ||
        String(this.mobilePath[0]) !== String(root.id)
    ) {
        this.mobilePath = [root.id];
        this._prevMobilePathDepth = undefined;
    }

    /* Walk the saved path against the live tree; if a deeper segment refers
     * to lazy children that haven't materialized yet, request a load and keep
     * the path stable so the back button doesn't disappear mid-navigation. */
    const pathNodes = [];
    let current = root;
    pathNodes.push(current);
    let pendingDeeperPathLoad = false;
    const wantIds = Array.isArray(this.mobilePath) ? this.mobilePath.map((x) => String(x)) : [];
    for (let i = 1; i < this.mobilePath.length; i++) {
        const targetId = String(this.mobilePath[i]);
        const next = TreeUtils.resolvePathChild(current, targetId, (tid) => store.findNode(tid));
        if (!next) {
            if (current?.hasUnloadedChildren) {
                pendingDeeperPathLoad = true;
                store
                    .loadNodeChildren(current)
                    .then(() => {
                        this.invalidateMobilePrototypeKeys();
                        this.renderMobilePrototypeTree(store.value.data);
                    })
                    .catch(() => {
                        /* ignore */
                    });
            }
            break;
        }
        current = next;
        pathNodes.push(current);
    }
    if (!pendingDeeperPathLoad) {
        this.mobilePath = pathNodes.map((n) => n.id);
    } else if (wantIds.length && String(wantIds[0]) === String(root.id)) {
        this.mobilePath = wantIds;
    }

    const harvested = (store.value.gamification && store.value.gamification.seeds) || [];
    const completedSet = store.value.completedNodes;

    /* One signature per dimension. If both match the previous render we are
     * already in the right state — no DOM work needed. The previous design
     * computed two `JSON.stringify({...})` keys and a separate "chrome-only"
     * fast path; the simple flat strings here cost a few µs and cover the
     * same cases without the duplication. */
    const trunkSig = buildTrunkSig(this, root, current, pathNodes, harvested, completedSet);
    const childrenSig = buildChildrenSig(current);
    if (trunkSig === this._lastTrunkSig && childrenSig === this._lastChildrenSig) return;

    /* Growth-pulse heuristics (animation: highlight the active knot when the
     * trunk grew or children were added in construction). Computed before
     * we update `_prevMobilePathDepth` / `_lastMobileBranchChildCount`. */
    const trunkPathGrew = prevPathDepthForGrowth != null && pathNodes.length > prevPathDepthForGrowth;
    const tailNodeForGrowth = pathNodes[pathNodes.length - 1];
    const branchChildCountForGrowth = (tailNodeForGrowth?.children || []).length;
    const branchChildrenGrew =
        !!store.value.constructionMode &&
        fileSystem.features.canWrite &&
        typeof this._lastMobileBranchChildCount === 'number' &&
        branchChildCountForGrowth > this._lastMobileBranchChildCount &&
        prevPathDepthForGrowth != null &&
        pathNodes.length === prevPathDepthForGrowth;
    const shouldPulseGrowthKnot = trunkPathGrew || branchChildrenGrew;

    this._lastTrunkSig = trunkSig;
    this._lastChildrenSig = childrenSig;

    /* Scroll handling: full sync on path change or first paint, otherwise
     * preserve the user's scroll position across the rebuild. */
    const trunkScrollEl = this.mobileTrunkContainer;
    const pathBeforeRebuild = JSON.stringify(this.mobilePath);
    const pathChangedForScroll =
        this._prevMobileScrollPath != null && this._prevMobileScrollPath !== pathBeforeRebuild;
    const firstPathPaint = this._prevMobileScrollPath == null;
    const syncScroll =
        pathChangedForScroll || firstPathPaint || shouldZeroConstructionRootTrunkScroll(this);
    let preserveTrunkScroll = trunkScrollEl ? trunkScrollEl.scrollTop : 0;
    if (syncScroll) preserveTrunkScroll = null;

    closeConstructionEmojiPicker(this);
    this.mobileKnotsContainer.innerHTML = '';
    this.mobileRightCol.innerHTML = '';

    pathNodes.forEach((node, index) => {
        const isActive = index === pathNodes.length - 1;
        const isCompleted = store.isCompleted && store.isCompleted(node.id);
        const isHarvested = harvested.find((h) => String(h.id) === String(node.id));
        const stateClass = isHarvested
            ? ' state-harvested'
            : node.isEmpty
              ? ' state-empty'
              : isCompleted
                ? ' state-completed'
                : '';

        const wrapper = document.createElement('div');
        wrapper.className = 'mobile-knot-wrapper';

        const knot = document.createElement('div');
        knot.className = `mobile-knot mobile-knot-tone-${this.getMobileTone(node)}${isActive ? ' active' : ''}${
            !isActive ? stateClass : ''
        }`;
        if (index === 0 && node.type === 'root') {
            knot.classList.add('mobile-knot--svg');
            knot.setAttribute('data-arbor-tour', 'graph-root');
            knot.innerHTML = iconArboritoRootSvg({
                size: 92,
                className: 'mobile-knot__svg arborito-root-knot-mark',
            });
        } else {
            knot.textContent = node.icon || '📁';
        }
        this.bindMobileTap(knot, () => {
            if (!isActive) {
                this.mobilePath = this.mobilePath.slice(0, index + 1);
                this.invalidateMobilePrototypeKeys();
                this.renderMobilePrototypeTree(store.value.data);
                schedulePersistTreeUiState(store);
                return;
            }
            if (store.value.constructionMode && fileSystem.features.canWrite) {
                this.selectedNodeId = node.id;
                this.isMoveMode = false;
                this.invalidateMobilePrototypeKeys();
                this.renderMobilePrototypeTree(store.value.data);
            }
        });
        wrapper.appendChild(knot);
        this.mobileKnotsContainer.appendChild(wrapper);

        if (isActive && shouldPulseGrowthKnot) {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    knot.classList.add('mobile-knot--growth-burst');
                    const kn = knot;
                    window.setTimeout(() => kn.classList.remove('mobile-knot--growth-burst'), 1150);
                });
            });
        }

        const labelRow = createMobilePathLabelRow(this, { node, index, pathNodes });
        if (isActive) {
            const branchWrap = document.createElement('div');
            branchWrap.className = 'mobile-active-branch';
            branchWrap.appendChild(labelRow);
            branchWrap.appendChild(buildActivePanel(this, current, harvested, store.ui));
            this.mobileRightCol.appendChild(branchWrap);
        } else {
            this.mobileRightCol.appendChild(labelRow);
        }
    });

    /* Safety net: in construction the FAB must exist on the active panel even
     * if some incremental refresh stripped it. */
    if (store.value.constructionMode && fileSystem.features.canWrite) {
        try {
            const branch = this.mobileRightCol?.querySelector('.mobile-active-branch');
            const panel = branch?.querySelector?.('.mobile-children-panel');
            if (panel) mountConstructionCreateFab(this, panel, current);
        } catch {
            /* ignore */
        }
    }

    const toggle =
        this.querySelector('#arborito-curriculum-switcher-btn') ||
        this.querySelector(`#${VERSION_TOGGLE_ID}`) ||
        this.querySelector('#arborito-tree-switcher-btn');
    if (toggle && this.mobileTreeUI) {
        this.bindCurriculumChrome(this.mobileTreeUI, () => {
            this.invalidateMobilePrototypeKeys();
            this.renderMobilePrototypeTree(store.value.data);
        });
    } else if (!toggle && this._versionMenuOpen) {
        this._versionMenuOpen = false;
        this._clearVersionDropdownPanelStyles();
    }

    this._prevMobilePathDepth = pathNodes.length;
    this._lastMobileBranchChildCount = (current.children || []).length;
    this._prevMobileScrollPath = JSON.stringify(this.mobilePath);

    finishPathRenderScroll(this, { syncScroll, preserveTrunkScroll, pathNodes });
    if (this._versionMenuOpen) {
        requestAnimationFrame(() => this.positionVersionDropdownPanel());
    }
    this._syncMobileTreeUiLayer();
}
