/* ──────────────────────────────────────────────────────────────────────────
 * Single panel-head builder + binder.
 *
 * Replaces the three near-identical inline copies of the panel header markup
 * that used to live in `graph-mobile-tree-render.js` — one for each branch
 * variant (empty + construction, empty + explore, has-children). Each used
 * to rebuild the same back-button + emoji + title + tools + forum/arcade
 * chips on its own and call the same set of binders below.
 *
 * `buildPanelHead` returns the full `<div class="mobile-panel-head">…</div>`
 * markup; `bindPanelHead` wires every interactive element inside it. Both are
 * idempotent — missing optional elements (e.g. forum chip in construction)
 * are simply skipped.
 * ────────────────────────────────────────────────────────────────────────── */

import { store } from '../../../core/store.js';
import { fileSystem } from '../../backup-export/filesystem.js';
import { schedulePersistTreeUiState } from '../tree-ui-persist.js';
import { escHtml, escAttr } from './graph-mobile-shared.js';
import {
    moveHereButtonMarkup,
    bindMoveHereButton,
    constructionPanelHeadEmojiMarkup,
    panelTitleCellRead,
    constructionPanelTitleMarkup,
} from './graph-mobile-tree-panel-tools.js';
import {
    bindPanelHeadEmoji,
    bindPanelTitleRename,
    bindPanelRenamePencil,
} from './graph-mobile-tree-bindings.js';

/**
 * Build the `<div class="mobile-panel-head">…</div>` HTML for a folder/branch panel.
 *
 * @param {object} graph
 * @param {object} current — active node (root | branch)
 * @param {object} ui — i18n strings (store.ui)
 * @param {object} [opts]
 * @param {boolean} [opts.directChildSelected=false] — dim parent inline tools when
 *   a sibling child row is currently selected (construction mode only).
 * @returns {string}
 */
export function buildPanelHead(graph, current, ui, opts = {}) {
    const isConstruct = !!store.value.constructionMode;
    const canWrite = fileSystem.features.canWrite;
    const hideInlineWhilePickingMove = !!graph.pendingMoveNodeId;
    const directChildSelected = !!opts.directChildSelected;

    const back = (graph.mobilePath && graph.mobilePath.length > 1)
        ? `<button type="button" class="mobile-panel-back" aria-label="${escAttr(ui.navBack || ui.close || 'Back')}" title="${escAttr(ui.navBack || ui.close || 'Back')}">←</button>`
        : '';

    const headEmoji = (isConstruct && canWrite)
        ? constructionPanelHeadEmojiMarkup(graph, current, ui)
        : '';

    const titleCell = (isConstruct && canWrite)
        ? constructionPanelTitleMarkup(graph, current, ui)
        : panelTitleCellRead(graph, current, ui);

    const actions = !isConstruct
        ? `<div class="mobile-panel-actions"><button type="button" class="mobile-panel-cta mobile-panel-cta--forum" aria-label="${escAttr(ui.navForum || 'Forum')}" title="${escAttr(ui.navForum || 'Forum')}">${escHtml(ui.navForum || 'Forum')} 💬</button><button type="button" class="mobile-panel-cta mobile-panel-cta--arcade" aria-label="${escAttr(ui.mobileArcadeCta || ui.navArcade || 'Arcade')}" title="${escAttr(ui.mobileArcadeCta || ui.navArcade || 'Arcade')}">${escHtml(ui.mobileArcadeCta || ui.navArcade || 'Arcade')} 🎮</button></div>`
        : '';

    const parentTools = (isConstruct && canWrite)
        ? graph.buildMobileInlineNodeToolsHTML(current, {
              compact: true,
              folderContextDimmed: directChildSelected && !hideInlineWhilePickingMove,
              revealDelete: false,
              omitDelete: true,
          }) || ''
        : '';

    const moveHere = moveHereButtonMarkup(graph, current, ui);

    return `<div class="mobile-panel-head">
        <div class="mobile-panel-header">${back}${headEmoji}${titleCell}${actions}</div>
        ${parentTools}
        ${moveHere}
    </div>`;
}

/**
 * Wire every interactive element inside the panel head: back button, forum /
 * arcade chips, emoji picker, title rename, inline tools. Safe to call even
 * if the optional elements are missing (e.g. no chips while in construction).
 */
export function bindPanelHead(graph, panelEl, current) {
    if (!panelEl) return;
    const head = panelEl.querySelector('.mobile-panel-head') || panelEl;

    const headTools = head.querySelector('.mobile-inline-tools-host');
    if (headTools) graph.bindMobileInlineNodeTools(headTools, current);

    bindMoveHereButton(graph, head, current);
    bindPanelHeadEmoji(graph, head, current);
    bindPanelTitleRename(graph, head, current);
    bindPanelRenamePencil(graph, head, current);

    const back = head.querySelector('.mobile-panel-back');
    if (back) {
        graph.bindMobileTap(back, (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (graph.mobilePath && graph.mobilePath.length > 1) {
                graph.mobilePath = graph.mobilePath.slice(0, -1);
                graph.invalidateMobilePrototypeKeys();
                graph.renderMobilePrototypeTree(store.value.data);
                schedulePersistTreeUiState(store);
            }
        });
    }

    const forum = head.querySelector('.mobile-panel-cta--forum');
    if (forum) {
        graph.bindMobileTap(forum, (e) => {
            e.preventDefault();
            e.stopPropagation();
            store.setModal({ type: 'forum', placeId: current.id });
        });
    }

    const arcade = head.querySelector('.mobile-panel-cta--arcade');
    if (arcade) {
        graph.bindMobileTap(arcade, (e) => {
            e.preventDefault();
            e.stopPropagation();
            store.setModal({ type: 'arcade', preSelectedNodeId: current.id });
        });
    }
}
