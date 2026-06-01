import { store } from '../../../core/store.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { schedulePersistTreeUiState } from '../tree-ui-persist.js';
import { fileSystem } from '../../backup-export/filesystem.js';
import { NODE_PROPERTY_EMOJIS } from '../node-property-emojis.js';
import { escHtml, escAttr } from './graph-mobile-shared.js';
import { curriculumTreeDisplayName } from '../../version-updates/version-switch-logic.js';

/** Valid move parent folder: not the node itself nor any descendant. */
function isValidMoveParentFolder(movingId, folderId) {
    const moving = store.findNode(movingId);
    if (!moving || moving.type === 'root') return false;
    if (String(movingId) === String(folderId)) return false;
    const invalid = new Set();
    const markDesc = (n) => {
        invalid.add(String(n.id));
        (n.children || []).forEach(markDesc);
    };
    markDesc(moving);
    if (invalid.has(String(folderId))) return false;
    const folder = store.findNode(folderId);
    return !!(folder && (folder.type === 'root' || folder.type === 'branch'));
}

/** Show “Move here” on the open folder while picking destination in the tree. */
function shouldShowMoveHereInPanel(graph, currentFolder) {
    const pid = graph.pendingMoveNodeId;
    if (!pid || !store.value.constructionMode || !fileSystem.features.canWrite) {
        return false;
    }
    const moving = store.findNode(pid);
    if (!moving || moving.type === 'root') return false;
    if (!currentFolder || (currentFolder.type !== 'root' && currentFolder.type !== 'branch')) return false;
    if (!isValidMoveParentFolder(pid, currentFolder.id)) return false;
    if (String(currentFolder.id) === String(moving.parentId)) return false;
    return true;
}

export function moveHereButtonMarkup(graph, folder, ui) {
    if (!shouldShowMoveHereInPanel(graph, folder)) return '';
    const label = ui.moveHereInFolder || 'Move here';
    return `<div class="mobile-panel-move-here-wrap w-full mt-1.5"><button type="button" class="mobile-panel-move-here" aria-label="${escAttr(label)}">${escHtml(
        label
    )}</button></div>`;
}

export function bindMoveHereButton(graph, panel, folderNode) {
    const btn = panel.querySelector('.mobile-panel-move-here');
    if (!btn) return;
    const destId = String(folderNode.id);
    const srcId = graph.pendingMoveNodeId;
    graph.bindMobileTap(btn, async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const moving = store.findNode(srcId);
        if (!moving || !shouldShowMoveHereInPanel(graph, folderNode)) return;
        await store.moveNode(moving, destId);
        graph.pendingMoveNodeId = null;
        graph.invalidateMobilePrototypeKeys();
        graph.renderMobileTopBanner();
        if (store.value.data) graph.renderMobilePrototypeTree(store.value.data);
        schedulePersistTreeUiState(store);
    });
}

function abortConstructionFabDocListeners(graph) {
    if (graph._constructionFabAbort) {
        graph._constructionFabAbort.abort();
        graph._constructionFabAbort = null;
    }
}

export function closeConstructionEmojiPicker(graph) {
    if (typeof graph._emojiPickerCleanup === 'function') {
        graph._emojiPickerCleanup();
        graph._emojiPickerCleanup = null;
    }
    graph.mobileTreeUI?.querySelector('.mobile-construction-emoji-pop')?.remove();
}

function closeAllFabMenusInTree(graph) {
    const root = graph.mobileTreeUI;
    if (!root) return;
    root.querySelectorAll('.mobile-construction-fab-menu').forEach((m) => {
        m.hidden = true;
    });
    root.querySelectorAll('.mobile-construction-fab').forEach((f) => f.setAttribute('aria-expanded', 'false'));
}

/**
 * Compact emoji picker (same set as properties / lesson header).
 * @param {any} graph
 */
export function openConstructionEmojiPicker(graph, anchorEl, node) {
    closeConstructionEmojiPicker(graph);
    closeAllFabMenusInTree(graph);
    if (!graph.mobileTreeUI || !anchorEl || !node) return;
    const ui = store.ui;
    const pop = document.createElement('div');
    pop.className = 'mobile-construction-emoji-pop';
    pop.setAttribute('role', 'listbox');
    const aria = ui.lessonTocEmojiPlaceholder || ui.graphEdit || 'Emoji';
    pop.innerHTML = `<div class="mobile-construction-emoji-pop__grid">${NODE_PROPERTY_EMOJIS.map(
        (e) =>
            `<button type="button" class="mobile-construction-emoji-pop__btn" data-emoji="${e}" aria-label="${escAttr(aria)} ${escAttr(e)}">${e}</button>`
    ).join('')}</div>`;
    graph.mobileTreeUI.appendChild(pop);

    const place = () => {
        const r = anchorEl.getBoundingClientRect();
        const w = pop.offsetWidth || 220;
        const h = pop.offsetHeight || 180;
        let left = r.left + r.width / 2 - w / 2;
        left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
        let top = r.bottom + 8;
        if (top + h > window.innerHeight - 12) {
            top = Math.max(8, r.top - h - 8);
        }
        pop.style.left = `${left}px`;
        pop.style.top = `${top}px`;
    };

    requestAnimationFrame(() => {
        place();
    });

    const onDoc = (ev) => {
        if (pop.contains(ev.target)) return;
        closeConstructionEmojiPicker(graph);
    };
    setTimeout(() => document.addEventListener('click', onDoc, true), 0);
    graph._emojiPickerCleanup = () => {
        document.removeEventListener('click', onDoc, true);
        pop.remove();
        graph._emojiPickerCleanup = null;
    };

    pop.querySelectorAll('[data-emoji]').forEach((btn) => {
        graph.bindMobileTap(btn, async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const em = btn.getAttribute('data-emoji');
            closeConstructionEmojiPicker(graph);
            const n = store.findNode(node.id) || node;
            await graph.applyConstructionNodeIcon(n, em);
            graph.invalidateMobilePrototypeKeys();
            if (store.value.data) graph.renderMobilePrototypeTree(store.value.data);
            schedulePersistTreeUiState(store);
        });
    });
}

export function constructionPanelHeadEmojiMarkup(graph, current, ui) {
    if (!store.value.constructionMode || !fileSystem.features.canWrite) return '';
    if (current.type === 'root') return '';
    if (current.type !== 'branch') return '';
    let ic = current.icon;
    if (!ic) ic = current.type === 'root' ? '🏠' : '📁';
    const label = (ui.graphChangeIcon || ui.graphEdit || 'Icon').trim();
    return `<button type="button" class="mobile-panel-head-emoji" aria-label="${escAttr(label)}" title="${escAttr(label)}"><span class="mobile-panel-head-emoji__ic" aria-hidden="true">${escHtml(ic)}</span></button>`;
}

/**
 * Floating “+” button with menu (new folder / new lesson) on the open folder.
 * @param {any} graph
 */
export function mountConstructionCreateFab(graph, panel, folderNode) {
    closeConstructionEmojiPicker(graph);
    abortConstructionFabDocListeners(graph);
    if (!store.value.constructionMode || !fileSystem.features.canWrite || !panel || !folderNode) return;
    if (folderNode.type !== 'root' && folderNode.type !== 'branch') return;

    // Ensure we don't accumulate duplicate FAB hosts across incremental renders.
    try {
        panel.querySelectorAll('.mobile-construction-fab-host').forEach((n) => n.remove());
    } catch {
        /* ignore */
    }

    const ui = store.ui;
    const wrap = document.createElement('div');
    wrap.className = 'mobile-construction-fab-host';
    const addAria = (ui.graphAddChildFabAria || ui.graphAddFolder || 'Add').trim();
    const folderL = (ui.graphFabNewFolder || ui.graphAddFolder || 'New folder').trim();
    const lessonL = (ui.graphFabNewLesson || ui.graphAddLesson || 'New lesson').trim();
    const examL = (ui.graphFabNewExam || ui.graphAddExam || 'New exam').trim();
    const isRootFolder = folderNode.type === 'root';
    // Use a folder glyph (not a leaf) even at the curriculum root.
    const folderMenuIc = '📁';
    const lessonMenuIc = isRootFolder ? '📖' : '📄';
    wrap.innerHTML = `
      <div class="mobile-construction-fab-root">
        <div class="mobile-construction-fab-menu" hidden role="menu" aria-label="${escAttr(addAria)}">
          <button type="button" class="mobile-construction-fab-menu__btn" data-fab-act="new-folder" role="menuitem">
            <span class="mobile-construction-fab-menu__btn-ic" aria-hidden="true">${folderMenuIc}</span>
            <span class="mobile-construction-fab-menu__btn-txt">${escHtml(folderL)}</span>
          </button>
          <button type="button" class="mobile-construction-fab-menu__btn" data-fab-act="new-file" role="menuitem">
            <span class="mobile-construction-fab-menu__btn-ic" aria-hidden="true">${lessonMenuIc}</span>
            <span class="mobile-construction-fab-menu__btn-txt">${escHtml(lessonL)}</span>
          </button>
          <button type="button" class="mobile-construction-fab-menu__btn" data-fab-act="new-exam" role="menuitem">
            <span class="mobile-construction-fab-menu__btn-ic" aria-hidden="true">📝</span>
            <span class="mobile-construction-fab-menu__btn-txt">${escHtml(examL)}</span>
          </button>
        </div>
        <button type="button" class="mobile-construction-fab" aria-haspopup="true" aria-expanded="false" aria-label="${escAttr(addAria)}">+</button>
      </div>`;
    panel.appendChild(wrap);
    panel.classList.add('mobile-children-panel--fab-pad');

    const menu = wrap.querySelector('.mobile-construction-fab-menu');
    const fab = wrap.querySelector('.mobile-construction-fab');
    const ac = new AbortController();
    graph._constructionFabAbort = ac;

    const closeMenu = () => {
        if (!menu || !fab) return;
        menu.hidden = true;
        fab.setAttribute('aria-expanded', 'false');
    };

    const openMenu = () => {
        if (!menu || !fab) return;
        menu.hidden = false;
        fab.setAttribute('aria-expanded', 'true');
    };

    graph.bindMobileTap(fab, (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeConstructionEmojiPicker(graph);
        if (menu.hidden) openMenu();
        else closeMenu();
    });

    wrap.querySelectorAll('[data-fab-act]').forEach((b) => {
        graph.bindMobileTap(b, async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const act = b.getAttribute('data-fab-act');
            closeMenu();
            graph.selectedNodeId = folderNode.id;
            graph.isMoveMode = false;
            if (act === 'new-folder') await graph.handleDockAction('new-folder', { skipPrompt: true });
            else if (act === 'new-file') await graph.handleDockAction('new-file', { skipPrompt: true });
            else if (act === 'new-exam') await graph.handleDockAction('new-exam', { skipPrompt: true });
            graph.invalidateMobilePrototypeKeys();
            if (store.value.data) graph.renderMobilePrototypeTree(store.value.data);
            schedulePersistTreeUiState(store);
        });
    });

    document.addEventListener(
        'click',
        (ev) => {
            if (!wrap.contains(ev.target)) closeMenu();
        },
        { signal: ac.signal, capture: true }
    );

    closeMenu();
}

/** Folder title in panel chip; at root includes version control (explore). */
export function panelTitleCellRead(graph, current, ui) {
    if (current.type !== 'root') {
        const t = current.name || '';
        return `<span class="mobile-panel-title" title="${escAttr(t)}">${escHtml(t)}</span>`;
    }
    const name = curriculumTreeDisplayName(ui);
    if (store.value.viewMode !== 'explore' || typeof graph.buildVersionSwitchHTML !== 'function') {
        return `<span class="mobile-panel-title" title="${escAttr(name)}">${escHtml(name)}</span>`;
    }
    /* Unified chip already shows tree name; do not duplicate above. */
    return `<div class="mobile-panel-root-head flex flex-col min-w-0 flex-1 gap-0.5"><div class="mobile-panel-version-slot w-full min-w-0 mt-1">${graph.buildVersionSwitchHTML()}</div></div>`;
}

function openMobileRenameSheet(graph, node, initialName) {
    const ui = store.ui || {};
    const existing = document.querySelector('.arborito-mobile-rename-sheet');
    if (existing) existing.remove();
    const sheet = document.createElement('div');
    sheet.className = 'arborito-mobile-rename-sheet fixed inset-0 z-[85] flex items-end justify-center bg-slate-950/50 animate-in fade-in';
    const label = ui.graphEdit || ui.graphRename || 'Rename';
    sheet.innerHTML = `<div class="arborito-mobile-rename-sheet__panel w-full max-w-lg bg-white dark:bg-slate-900 rounded-t-2xl border-t border-slate-200 dark:border-slate-700 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl" role="dialog" aria-label="${escAttr(label)}">
        <p class="arborito-eyebrow arborito-eyebrow--sm m-0 mb-2">${escHtml(label)}</p>
        <input type="text" class="arborito-mobile-rename-sheet__input arborito-input text-base mb-3" value="${escAttr(initialName || '')}" />
        <div class="flex gap-2 justify-end">
            <button type="button" class="arborito-mobile-rename-sheet__cancel px-4 py-2.5 rounded-xl font-bold text-sm text-slate-600 dark:text-slate-300">${escHtml(ui.cancel || 'Cancel')}</button>
            <button type="button" class="arborito-mobile-rename-sheet__save px-5 py-2.5 rounded-xl font-bold text-sm bg-indigo-600 text-white">${escHtml(ui.save || 'Save')}</button>
        </div>
    </div>`;
    document.body.appendChild(sheet);
    const inp = sheet.querySelector('.arborito-mobile-rename-sheet__input');
    const close = () => sheet.remove();
    sheet.addEventListener('click', (ev) => {
        if (ev.target === sheet) close();
    });
    sheet.querySelector('.arborito-mobile-rename-sheet__cancel')?.addEventListener('click', close);
    sheet.querySelector('.arborito-mobile-rename-sheet__save')?.addEventListener('click', async () => {
        await graph.renameNodeFromConstruction(node, inp?.value || '');
        close();
        graph.invalidateMobilePrototypeKeys();
        if (store.value.data) graph.renderMobilePrototypeTree(store.value.data);
        schedulePersistTreeUiState(store);
    });
    requestAnimationFrame(() => {
        inp?.focus();
        if (inp && typeof inp.select === 'function') inp.select();
    });
}

export function startConstructionRename(graph, node, name) {
    if (!node || node.type === 'root') return;
    graph.selectedNodeId = node.id;
    graph.isMoveMode = false;
    if (shouldShowMobileUI()) {
        openMobileRenameSheet(graph, node, name);
        return;
    }
    graph._inlineRenameNodeId = node.id;
    graph.invalidateMobilePrototypeKeys();
    if (store.value.data) graph.renderMobilePrototypeTree(store.value.data);
    schedulePersistTreeUiState(store);
}

export function constructionPanelTitleMarkup(graph, current, ui) {
    const canWrite = fileSystem.features.canWrite;
    const isConstruct = store.value.constructionMode;
    const rootName = current.type === 'root' ? curriculumTreeDisplayName(ui) : '';
    const title = current.type === 'root' ? rootName : (current.name || '');
    const renaming =
        isConstruct &&
        canWrite &&
        current.type !== 'root' &&
        String(graph._inlineRenameNodeId || '') === String(current.id);
    if (renaming) {
        return `<input type="text" class="mobile-panel-title-input mobile-panel-title-input--inset" value="${escAttr(title)}" aria-label="${escAttr(
            ui.graphEdit || 'Rename'
        )}" />`;
    }
    if (isConstruct && canWrite && current.type !== 'root') {
        /* Pencil is rendered separately, right next to the icon (see panel header). */
        return `<span class="mobile-panel-title-row flex items-center gap-1 min-w-0 flex-1">
            <span class="mobile-panel-title mobile-panel-title-slot flex-1 min-w-0 truncate" title="${escAttr(title)}">${escHtml(
            current.name || ''
        )}</span>
        </span>`;
    }
    const versionSlot =
        current.type === 'root' &&
        store.value.viewMode === 'explore' &&
        typeof graph.buildVersionSwitchHTML === 'function'
            ? `<div class="mobile-panel-version-slot w-full min-w-0 mt-1">${graph.buildVersionSwitchHTML()}</div>`
            : '';
    const titleSpan =
        current.type === 'root'
            ? `<span class="mobile-panel-title" title="${escAttr(rootName)}">${escHtml(rootName)}</span>`
            : `<span class="mobile-panel-title" title="${escAttr(title)}">${escHtml(current.name || '')}</span>`;
    if (current.type === 'root' && versionSlot) {
        return `<div class="mobile-panel-root-head flex flex-col min-w-0 flex-1 gap-0.5">${versionSlot}</div>`;
    }
    return titleSpan;
}
