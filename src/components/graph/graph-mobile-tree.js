import { store } from '../../store.js';
import { schedulePersistTreeUiState } from '../../utils/tree-ui-persist.js';
import { fileSystem } from '../../services/filesystem.js';
import { NODE_PROPERTY_EMOJIS } from '../../utils/node-property-emojis.js';
import { escHtml, escAttr } from './graph-mobile.js';
import { VERSION_TOGGLE_ID } from './graph-version.js';
import { curriculumTreeDisplayName } from '../../utils/version-switch-logic.js';
import { TreeUtils } from '../../utils/tree-utils.js';
import { iconArboritoPixelSvg } from '../sidebar-utils.js';

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

/** Mobile construction at root: saved scroll must not push trunk under the course card again. */
function shouldZeroMobileConstructionRootTrunkScroll(graph) {
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

function moveHereButtonMarkup(graph, folder, ui) {
    if (!shouldShowMoveHereInPanel(graph, folder)) return '';
    const label = ui.moveHereInFolder || 'Move here';
    return `<div class="mobile-panel-move-here-wrap w-full mt-1.5"><button type="button" class="mobile-panel-move-here" aria-label="${escAttr(label)}">${escHtml(
        label
    )}</button></div>`;
}

function bindMoveHereButton(graph, panel, folderNode) {
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

function closeConstructionEmojiPicker(graph) {
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
function openConstructionEmojiPicker(graph, anchorEl, node) {
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

function constructionPanelHeadEmojiMarkup(graph, current, ui) {
    if (!store.value.constructionMode || !fileSystem.features.canWrite) return '';
    if (current.type === 'root') return '';
    if (current.type !== 'branch') return '';
    let ic = current.icon;
    if (!ic) ic = current.type === 'root' ? '🏠' : '📁';
    const label = (ui.graphChangeIcon || ui.graphEdit || 'Icon').trim();
    return `<button type="button" class="mobile-panel-head-emoji" aria-label="${escAttr(label)}" title="${escAttr(label)}"><span class="mobile-panel-head-emoji__ic" aria-hidden="true">${escHtml(ic)}</span></button>`;
}

function bindPanelHeadEmoji(graph, headEl, current) {
    if (!headEl || !current) return;
    const btn = headEl.querySelector('.mobile-panel-head-emoji');
    if (!btn) return;
    graph.bindMobileTap(btn, (e) => {
        e.preventDefault();
        e.stopPropagation();
        openConstructionEmojiPicker(graph, btn, current);
    });
}

/**
 * Floating “+” button with menu (new folder / new lesson) on the open folder.
 * @param {any} graph
 */
function mountConstructionCreateFab(graph, panel, folderNode) {
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
function panelTitleCellRead(graph, current, ui) {
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

function constructionPanelTitleMarkup(graph, current, ui) {
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
        return `<span class="mobile-panel-title mobile-panel-title-slot" title="${escAttr(title)}">${escHtml(
            current.name || ''
        )}</span>`;
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

function bindPanelTitleRename(graph, headEl, node) {
    if (!headEl || !node) return;
    const header = headEl.querySelector('.mobile-panel-header');
    if (!header) return;
    const inp = header.querySelector('.mobile-panel-title-input');
    if (inp) {
        let done = false;
        let docPtr = null;
        const disarmDoc = () => {
            if (docPtr) {
                document.removeEventListener('pointerdown', docPtr, true);
                docPtr = null;
            }
        };
        const finish = async (commit) => {
            if (done) return;
            done = true;
            disarmDoc();
            if (!commit) {
                graph._inlineRenameNodeId = null;
            } else {
                await graph.renameNodeFromConstruction(node, inp.value);
                graph._inlineRenameNodeId = null;
            }
            graph.invalidateMobilePrototypeKeys();
            if (store.value.data) graph.renderMobilePrototypeTree(store.value.data);
            schedulePersistTreeUiState(store);
        };
        docPtr = (ev) => {
            const el = ev.target;
            if (!(el instanceof Node)) return;
            if (el === inp || inp.contains(el)) return;
            void finish(true);
        };
        document.addEventListener('pointerdown', docPtr, true);
        requestAnimationFrame(() => {
            inp.focus();
            if (typeof inp.select === 'function') inp.select();
        });
        inp.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') {
                ev.preventDefault();
                void finish(true);
            } else if (ev.key === 'Escape') {
                ev.preventDefault();
                void finish(false);
            }
        });
        inp.addEventListener('blur', () => void finish(true));
        return;
    }
    const slot = header.querySelector('.mobile-panel-title-slot');
    if (!slot || !store.value.constructionMode || !fileSystem.features.canWrite || node.type === 'root') return;
    graph.bindMobileTap(slot, (e) => {
        e.preventDefault();
        e.stopPropagation();
        graph._inlineRenameNodeId = node.id;
        graph.selectedNodeId = node.id;
        graph.isMoveMode = false;
        graph.invalidateMobilePrototypeKeys();
        if (store.value.data) graph.renderMobilePrototypeTree(store.value.data);
        schedulePersistTreeUiState(store);
    });
}

function bindChildInlineRename(graph, row, child) {
    const inp = row.querySelector('.mobile-child-name-input');
    if (inp) {
        let done = false;
        let docPtr = null;
        const disarmDoc = () => {
            if (docPtr) {
                document.removeEventListener('pointerdown', docPtr, true);
                docPtr = null;
            }
        };
        const finish = async (commit) => {
            if (done) return;
            done = true;
            disarmDoc();
            if (!commit) {
                graph._inlineRenameNodeId = null;
            } else {
                await graph.renameNodeFromConstruction(child, inp.value);
                graph._inlineRenameNodeId = null;
            }
            graph.invalidateMobilePrototypeKeys();
            if (store.value.data) graph.renderMobilePrototypeTree(store.value.data);
            schedulePersistTreeUiState(store);
        };
        docPtr = (ev) => {
            const el = ev.target;
            if (!(el instanceof Node)) return;
            if (el === inp || inp.contains(el)) return;
            void finish(true);
        };
        document.addEventListener('pointerdown', docPtr, true);
        requestAnimationFrame(() => {
            inp.focus();
            if (typeof inp.select === 'function') inp.select();
        });
        inp.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') {
                ev.preventDefault();
                void finish(true);
            } else if (ev.key === 'Escape') {
                ev.preventDefault();
                void finish(false);
            }
        });
        inp.addEventListener('blur', () => void finish(true));
        return;
    }
    const slot = row.querySelector('.mobile-child-name-slot');
    if (!slot || !store.value.constructionMode || !fileSystem.features.canWrite || child.type === 'root') return;
    graph.bindMobileTap(slot, (e) => {
        e.preventDefault();
        e.stopPropagation();
        graph._inlineRenameNodeId = child.id;
        graph.selectedNodeId = child.id;
        graph.isMoveMode = false;
        graph.invalidateMobilePrototypeKeys();
        if (store.value.data) graph.renderMobilePrototypeTree(store.value.data);
        schedulePersistTreeUiState(store);
    });
}

/**
 * Clears `renderMobilePrototypeTree` cache so the next render repaints full DOM
 * (trunk knots, panel rows, listeners). Call after `mobilePath` or selection changes.
 */
export function invalidateMobilePrototypeKeys() {
    this._mobileStructureKey = undefined;
    this._mobileConstructionKey = undefined;
}

/**
 * Fila de etiqueta del camino (el nodo activo comparte `current` con el panel de hijos).
 * @param {object} graph
 * @param {{ node: object, index: number, pathNodes: object[] }} p
 */
function createMobilePathLabelRow(graph, { node, index, pathNodes }) {
    const isActive = index === pathNodes.length - 1;
    const labelRow = document.createElement('div');
    const showRootVersion =
        index === 0 && store.value.viewMode === 'explore' && store.value.activeSource;

    if (showRootVersion) {
        // Panel chip already includes tree + version; do not repeat name on path row.
        labelRow.removeAttribute('id');
        labelRow.className = `mobile-label-row ${isActive ? 'is-active' : ''} mobile-label-row--suppress-title`;
        labelRow.innerHTML = `<span class="mobile-label-text" title=""></span>`;
    } else {
        // Panel (chip) already shows active node title; keep the row here
        // for trunk alignment (and CTAs) without duplicating the name.
        const suppressActiveTitle = isActive && node.type !== 'root';
        const rowTitle = suppressActiveTitle
            ? ''
            : (node.type === 'root'
                  ? curriculumTreeDisplayName(store.ui)
                  : (node.name || ''));
        labelRow.removeAttribute('id');
        labelRow.className = `mobile-label-row ${isActive ? 'is-active' : ''}${suppressActiveTitle ? ' mobile-label-row--suppress-title' : ''}`;
        labelRow.innerHTML = `<span class="mobile-label-text" title="${escAttr(rowTitle)}">${escHtml(rowTitle)}</span>`;
    }

    if (isActive) {
        const ui = store.ui;
        const listedKids = Array.isArray(node.children) ? node.children : [];
        const hasChildren = listedKids.length > 0;
        const isConstruct = !!store.value.constructionMode;
        const isDesktopChrome =
            typeof document !== 'undefined' &&
            document.documentElement.classList.contains('arborito-desktop');
        /*
         * Avoid duplicating Forum/Arcade CTAs.
         * Panel header (chip) already renders them with children and at “end of branch”.
         * When the path row adds them too, mobile shows duplicates (reported bug).
         *
         * Desktop also has global header, so they must not appear here.
         */
        const showPathArcade = false;

        if (showPathArcade) {
            const actions = document.createElement('div');
            actions.className = 'mobile-path-actions';
            const mkBtn = (cls, label, emoji) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = cls;
                b.setAttribute('aria-label', label);
                b.title = label;
                b.textContent = `${label} ${emoji}`.trim();
                return b;
            };

            const forumPath = mkBtn(
                'mobile-path-cta mobile-path-cta--forum',
                ui.navForum || 'Forum',
                '💬'
            );
            graph.bindMobileTap(forumPath, (ev) => {
                ev?.preventDefault?.();
                ev?.stopPropagation?.();
                store.setModal({ type: 'forum', placeId: node.id });
            });
            actions.appendChild(forumPath);

            const arcade = mkBtn(
                'mobile-path-cta mobile-path-cta--arcade',
                ui.mobileArcadeCta || ui.navArcade || 'Arcade',
                '🎮'
            );
            graph.bindMobileTap(arcade, (ev) => {
                ev?.preventDefault?.();
                ev?.stopPropagation?.();
                const moduleId =
                    node.type === 'leaf' || node.type === 'exam'
                        ? (node.parentId || node.id)
                        : node.id;
                store.setModal({ type: 'arcade', preSelectedNodeId: moduleId });
            });
            actions.appendChild(arcade);

            labelRow.appendChild(actions);
        }
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
    } else if (isActive && store.value.constructionMode && fileSystem.features.canWrite) {
        graph.bindMobileTap(labelRow, (ev) => {
            const t = ev?.target;
            if (t && typeof t.closest === 'function') {
                if (
                    t.closest(
                        '#arborito-curriculum-switcher-btn, #arborito-tree-switcher-btn, #arborito-tree-switcher-panel, #arborito-tree-switcher-backdrop, .arborito-tree-switcher-chip, .arborito-tree-switcher-host, .arborito-curriculum-switcher-host, #arborito-version-toggle, #arborito-version-dropdown-panel, #arborito-version-dropdown-backdrop, .arborito-version-archive-item, #arborito-version-live, .mobile-panel-version-slot'
                    )
                )
                    return;
            }
            graph.selectedNodeId = node.id;
            graph.isMoveMode = false;
            graph.invalidateMobilePrototypeKeys();
            graph.renderMobilePrototypeTree(store.value.data);
        });
        const listedKids = Array.isArray(node.children) ? node.children : [];
        /*
         * Inline tools on path row: only when NOT already in panel header.
         * If children in memory, or lazy children (`hasUnloadedChildren`), or construction with write,
         * panel already renders `parentToolsHtml` — duplicating here leaves “VIEW FOLDER / ✕”
         * floating outside the chip (column-reverse), especially at “end of branch”.
         */
        const deferFolderToolsToPanel =
            listedKids.length > 0 ||
            !!node.hasUnloadedChildren ||
            (!!store.value.constructionMode && fileSystem.features.canWrite);
        if (!deferFolderToolsToPanel) {
            const inlineTools = graph.createMobileInlineNodeTools(node, { compact: true, revealDelete: false });
            if (inlineTools) {
                labelRow.appendChild(inlineTools);
                graph.bindMobileInlineNodeTools(inlineTools, node);
            }
        }
    }
    return labelRow;
}

/**
 * Updates only active label, panel header, and row selection — does not touch trunk (knots).
 */
export function applyMobileConstructionChromeOnly(root) {
    if (!root || !this.mobileRightCol) return;

    const pathNodes = [];
    let tailCurrent = root;
    pathNodes.push(tailCurrent);
    for (let i = 1; i < this.mobilePath.length; i++) {
        const targetId = String(this.mobilePath[i]);
        const next = TreeUtils.resolvePathChild(tailCurrent, targetId, (tid) => store.findNode(tid));
        if (!next) break;
        tailCurrent = next;
        pathNodes.push(tailCurrent);
    }

    const activeIndex = pathNodes.length - 1;
    const branch = this.mobileRightCol.querySelector('.mobile-active-branch');
    if (!branch) return;

    const oldLabel = branch.querySelector('.mobile-label-row');
    if (oldLabel) {
        const newLabel = createMobilePathLabelRow(this, {
            node: pathNodes[activeIndex],
            index: activeIndex,
            pathNodes
        });
        oldLabel.replaceWith(newLabel);
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
    }

    const panel = branch.querySelector('.mobile-children-panel');
    if (!panel) return;

    const children = Array.isArray(tailCurrent.children) ? tailCurrent.children : [];
    const ui = store.ui;
    const head = panel.querySelector('.mobile-panel-head');
    if (head) {
        const isConstruct = store.value.constructionMode;
        const canWrite = fileSystem.features.canWrite;
        const sel = this.selectedNodeId;
        const hideInlineWhilePickingMove = !!this.pendingMoveNodeId;
        const directChildSelected =
            sel != null && children.some((c) => String(c.id) === String(sel));
        const parentToolsHtml =
            isConstruct && canWrite
                ? this.buildMobileInlineNodeToolsHTML(tailCurrent, {
                      compact: true,
                      folderContextDimmed: directChildSelected && !hideInlineWhilePickingMove,
                      revealDelete: false,
                      omitDelete: true
                  })
                : '';
        const backBtnHtml =
            this.mobilePath && this.mobilePath.length > 1
                ? `<button type="button" class="mobile-panel-back" aria-label="${escAttr(ui.navBack || ui.close || 'Back')}" title="${escAttr(ui.navBack || ui.close || 'Back')}">←</button>`
                : '';
        const actionsHtml = !isConstruct
            ? `<div class="mobile-panel-actions">
                    <button type="button" class="mobile-panel-cta mobile-panel-cta--forum" aria-label="${escAttr(ui.navForum || 'Forum')}" title="${escAttr(ui.navForum || 'Forum')}">${escHtml(ui.navForum || 'Forum')} 💬</button>
                    <button type="button" class="mobile-panel-cta mobile-panel-cta--arcade" aria-label="${escAttr(ui.mobileArcadeCta || ui.navArcade || 'Arcade')}" title="${escAttr(ui.mobileArcadeCta || ui.navArcade || 'Arcade')}">${escHtml(ui.mobileArcadeCta || ui.navArcade || 'Arcade')} 🎮</button>
                </div>`
            : '';
        const moveHereHtml = moveHereButtonMarkup(this, tailCurrent, ui);
        const headEmoji =
            isConstruct && canWrite ? constructionPanelHeadEmojiMarkup(this, tailCurrent, ui) : '';
        const titleCell =
            isConstruct && canWrite
                ? constructionPanelTitleMarkup(this, tailCurrent, ui)
                : panelTitleCellRead(this, tailCurrent, ui);
        head.innerHTML = `<div class="mobile-panel-header">${backBtnHtml}${headEmoji}${titleCell}${actionsHtml}</div>
            ${parentToolsHtml}
            ${moveHereHtml}`;
        const headTools = head.querySelector('.mobile-inline-tools-host');
        if (headTools) this.bindMobileInlineNodeTools(headTools, tailCurrent);
        bindMoveHereButton(this, head, tailCurrent);
        bindPanelHeadEmoji(this, head, tailCurrent);
        bindPanelTitleRename(this, head, tailCurrent);
        const backBtn = head.querySelector('.mobile-panel-back');
        if (backBtn) {
            this.bindMobileTap(backBtn, (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (this.mobilePath && this.mobilePath.length > 1) {
                    this.mobilePath = this.mobilePath.slice(0, -1);
                    this.invalidateMobilePrototypeKeys();
                    this.renderMobilePrototypeTree(store.value.data);
                    schedulePersistTreeUiState(store);
                }
            });
        }
        const forumBtnHead = head.querySelector('.mobile-panel-cta--forum');
        if (forumBtnHead) {
            this.bindMobileTap(forumBtnHead, (e) => {
                e.preventDefault();
                e.stopPropagation();
                store.setModal({ type: 'forum', placeId: tailCurrent.id });
            });
        }
        const arcadeBtn = head.querySelector('.mobile-panel-cta--arcade');
        if (arcadeBtn) {
            this.bindMobileTap(arcadeBtn, (e) => {
                e.preventDefault();
                e.stopPropagation();
                store.setModal({ type: 'arcade', preSelectedNodeId: tailCurrent.id });
            });
        }
        // On empty branches, this “chrome-only” shortcut must still keep the FAB (+).
        if (isConstruct && canWrite) {
            mountConstructionCreateFab(this, panel, tailCurrent);
        }
    }

    const isConstruct = store.value.constructionMode;
    const sel = this.selectedNodeId;
    const canWrite = fileSystem.features.canWrite;
    const hideInlineWhilePickingMove = !!this.pendingMoveNodeId;
    const kids = Array.isArray(tailCurrent.children) ? tailCurrent.children : [];

    panel.querySelectorAll('.mobile-child-row[data-node-id]').forEach((row) => {
        const id = row.getAttribute('data-node-id');
        const isRowSel = isConstruct && sel != null && String(id) === String(sel);
        row.classList.toggle('mobile-child-row--selected', !!isRowSel);

        const child = kids.find((c) => String(c.id) === String(id));
        if (!child) return;

        const wantTools = isConstruct && canWrite && !hideInlineWhilePickingMove;
        const toolsHtml = wantTools ? this.buildMobileInlineNodeToolsHTML(child, { compact: true }) : '';

        let host = row.querySelector('.mobile-inline-tools-host');
        if (!toolsHtml) {
            host?.remove();
            return;
        }
        if (host) {
            host.outerHTML = toolsHtml;
        } else {
            const tpl = document.createElement('template');
            tpl.innerHTML = toolsHtml.trim();
            const newHost = tpl.content.firstElementChild;
            const trail = row.querySelector('.mobile-child-folder-trail');
            const arrow = row.querySelector('.mobile-child-arrow');
            const insertBeforeEl =
                trail && trail.parentNode === row ? trail : arrow && arrow.parentNode === row ? arrow : null;
            if (newHost && insertBeforeEl) {
                row.insertBefore(newHost, insertBeforeEl);
            } else if (newHost) {
                row.appendChild(newHost);
            }
        }
        host = row.querySelector('.mobile-inline-tools-host');
        if (host) this.bindMobileInlineNodeTools(host, child);
    });
}

export function renderMobilePrototypeTree(root) {
        if (!root) return;

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

        // Persist/restore user's manual scroll position in the outline panel (no auto-scroll).
        const sourceKey = String(store.value.activeSource?.id || 'default');
        const trunkScrollKey = `arborito-mobile-trunk-scroll:${sourceKey}`;
        const trunkScrollElInit = this.mobileTrunkContainer;
        if (trunkScrollElInit && !this._mobileTrunkScrollPersistBound) {
            this._mobileTrunkScrollPersistBound = true;
            trunkScrollElInit.addEventListener(
                'scroll',
                () => {
                    try {
                        const st = Number(trunkScrollElInit.scrollTop || 0);
                        const persist = shouldZeroMobileConstructionRootTrunkScroll(this) ? 0 : st;
                        localStorage.setItem(trunkScrollKey, String(persist));
                    } catch {
                        /* ignore */
                    }
                },
                { passive: true }
            );
        }

        const pathNodes = [];
        let current = root;
        pathNodes.push(current);
        let pendingDeeperPathLoad = false;
        const wantIds = Array.isArray(this.mobilePath) ? this.mobilePath.map((x) => String(x)) : [];

        for (let i = 1; i < this.mobilePath.length; i++) {
            const targetId = String(this.mobilePath[i]);
            let next = TreeUtils.resolvePathChild(current, targetId, (tid) => store.findNode(tid));
            if (!next) {
                /*
                 * Deep trees: after reload/hydrate, `mobilePath` may reference valid ids
                 * not yet materialized (lazy children). If parent has `hasUnloadedChildren`,
                 * request load and do NOT truncate path (that removes back button).
                 */
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

        // Only truncate mobilePath if we are not waiting on lazy children to materialize deeper ids.
        if (!pendingDeeperPathLoad) {
            this.mobilePath = pathNodes.map((n) => n.id);
        } else if (wantIds.length && String(wantIds[0]) === String(root.id)) {
            // Keep the intended path stable while children are loading.
            this.mobilePath = wantIds;
        }

        const trunkPathGrew =
            prevPathDepthForGrowth != null && pathNodes.length > prevPathDepthForGrowth;

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

        const harvested = (store.value.gamification && store.value.gamification.seeds) || [];
        const completedSet = store.value.completedNodes;
        /** Includes titles and language: without this tree does not repaint on rename or curriculum language change. */
        const pathDigest = pathNodes
            .map((n) => `${String(n.id)}:${String(n.type)}:${String(n.name ?? '').slice(0, 240)}`)
            .join('\u001e');
        const childrenDigest = (Array.isArray(current.children) ? current.children : [])
            .map((c) => `${String(c.id)}:${String(c.name ?? '').slice(0, 240)}:${c.type || ''}`)
            .join('\u001e');
        const structureKey = JSON.stringify({
            path: this.mobilePath,
            curriculumTitleSig: curriculumTreeDisplayName(store.ui).slice(0, 240),
            childIds: (current.children || []).map(c => c.id),
            childHydration: (Array.isArray(current.children) ? current.children : []).map((c) => [
                c.id,
                c.hasUnloadedChildren ? 1 : 0,
                Array.isArray(c.children) ? c.children.length : 0
            ]),
            pathDigest,
            childrenDigest,
            uiLang: store.value.lang || '',
            curriculumEditLang: store.value.curriculumEditLang || '',
            completedCount: completedSet ? completedSet.size : 0,
            harvestedIds: harvested.map(h => h.id).sort(),
            sourceId: store.value.activeSource?.id || '',
            versionMenuOpen: !!this._versionMenuOpen,
            activeUrl: store.value.activeSource?.url || '',
            desktopForest: document.documentElement.classList.contains('arborito-desktop'),
            nostrLiveSeeds: store.value.nostrLiveSeeds,
            inlineRenameId: this._inlineRenameNodeId != null ? String(this._inlineRenameNodeId) : ''
        });
        const constructionKey = JSON.stringify({
            constructionMode: !!store.value.constructionMode,
            constructSel: this.selectedNodeId != null ? String(this.selectedNodeId) : '',
            canWrite: fileSystem.features.canWrite,
            pendingMove: this.pendingMoveNodeId != null ? String(this.pendingMoveNodeId) : '',
            inlineRenameId: this._inlineRenameNodeId != null ? String(this._inlineRenameNodeId) : ''
        });

        if (structureKey === this._mobileStructureKey && constructionKey === this._mobileConstructionKey) {
            return;
        }

        const onlyChrome =
            structureKey === this._mobileStructureKey && this._mobileStructureKey !== undefined;

        /*
         * “Chrome-only” shortcut (construction selection, panel tools): only if trunk already
         * painted `.mobile-active-branch`. If `graph-update` beats `state-change` when entering
         * construction, structure cache may match but DOM has no panel yet —
         * applying here and returning left only root knot and empty canvas.
         */
        if (onlyChrome) {
            const branchReady = !!this.mobileRightCol?.querySelector('.mobile-active-branch');
            if (branchReady) {
                this._mobileConstructionKey = constructionKey;
                const trunkEl = this.mobileTrunkContainer;
                const savedScroll = shouldZeroMobileConstructionRootTrunkScroll(this)
                    ? 0
                    : trunkEl
                      ? trunkEl.scrollTop
                      : 0;
                this.applyMobileConstructionChromeOnly(root);
                this.scheduleMobilePrototypeOverlay(false);
                if (this._versionMenuOpen) {
                    requestAnimationFrame(() => this.positionVersionDropdownPanel());
                }
                this._syncMobileTreeUiLayer();
                if (trunkEl) {
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            if (this.mobileTrunkContainer) this.mobileTrunkContainer.scrollTop = savedScroll;
                        });
                    });
                }
                return;
            }
            this.invalidateMobilePrototypeKeys();
        }

        this._mobileStructureKey = structureKey;
        this._mobileConstructionKey = constructionKey;

        const trunkScrollEl = this.mobileTrunkContainer;
        let preserveTrunkScroll = trunkScrollEl ? trunkScrollEl.scrollTop : 0;
        if (trunkScrollEl) {
            try {
                const raw = localStorage.getItem(trunkScrollKey);
                const saved = raw != null ? Number(raw) : NaN;
                if (Number.isFinite(saved) && saved >= 0) preserveTrunkScroll = saved;
            } catch {
                /* ignore */
            }
        }
        if (shouldZeroMobileConstructionRootTrunkScroll(this)) {
            preserveTrunkScroll = 0;
        }
        const pathBeforeRebuild = JSON.stringify(this.mobilePath);

        abortConstructionFabDocListeners(this);
        closeConstructionEmojiPicker(this);
        this.mobileKnotsContainer.innerHTML = '';
        this.mobileRightCol.innerHTML = '';

        pathNodes.forEach((node, index) => {
            const isActive = index === pathNodes.length - 1;
            const isCompleted = store.isCompleted && store.isCompleted(node.id);
            const isHarvested = harvested.find(h => String(h.id) === String(node.id));
            const stateClass = isHarvested ? ' state-harvested' : node.isEmpty ? ' state-empty' : isCompleted ? ' state-completed' : '';

            const wrapper = document.createElement('div');
            wrapper.className = 'mobile-knot-wrapper';

            const knot = document.createElement('div');
            knot.className = `mobile-knot mobile-knot-tone-${this.getMobileTone(node)}${isActive ? ' active' : ''}${!isActive ? stateClass : ''}`;
            if (index === 0 && node.type === 'root') {
                // Root: always show the Arborito SVG mark instead of a text/emoji label.
                knot.classList.add('mobile-knot--svg');
                knot.innerHTML = iconArboritoPixelSvg({ size: 20, className: 'mobile-knot__svg' });
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

                const panel = document.createElement('div');
                panel.className = 'mobile-children-panel';

                const children = Array.isArray(current.children) ? current.children : [];
                const ui = store.ui;
                if (children.length === 0) {
                    if (current.hasUnloadedChildren) {
                        const loading = ui.mobileLoadingCount || 'Loading…';
                        panel.innerHTML =
                            `<div class="mobile-panel-header">${escHtml(loading)}</div>` +
                            `<div class="mobile-empty-branch">` +
                            `<div class="mobile-empty-branch-icon">⏳</div>` +
                            `<div class="mobile-empty-branch-text">${escHtml(loading)}</div></div>`;
                        // Construction: even while children are still lazy, keep FAB (+) available.
                        if (store.value.constructionMode && fileSystem.features.canWrite) {
                            mountConstructionCreateFab(this, panel, current);
                        }
                        store
                            .loadNodeChildren(current)
                            .then(() => {
                                this.invalidateMobilePrototypeKeys();
                                this.renderMobilePrototypeTree(store.value.data);
                            })
                            .catch(() => {
                                /* ignore */
                            });
                    } else {
                        const moveHereHtml = moveHereButtonMarkup(this, current, ui);
                        const isConstructEmpty = store.value.constructionMode;
                        const canWriteEmpty = fileSystem.features.canWrite;
                        if (isConstructEmpty && canWriteEmpty) {
                            const parentToolsEmpty =
                                this.buildMobileInlineNodeToolsHTML(current, {
                                    compact: true,
                                    folderContextDimmed: false,
                                    revealDelete: false,
                                    omitDelete: true
                                }) || '';
                            const backBtnEmpty =
                                this.mobilePath && this.mobilePath.length > 1
                                    ? `<button type="button" class="mobile-panel-back" aria-label="${escAttr(ui.navBack || ui.close || 'Back')}" title="${escAttr(ui.navBack || ui.close || 'Back')}">←</button>`
                                    : '';
                            const headEmojiEmpty = constructionPanelHeadEmojiMarkup(this, current, ui);
                            const titleCellEmpty = constructionPanelTitleMarkup(this, current, ui);
                            panel.innerHTML = `<div class="mobile-panel-head">
                                    <div class="mobile-panel-header">${backBtnEmpty}${headEmojiEmpty}${titleCellEmpty}</div>
                                    ${parentToolsEmpty}
                                    ${moveHereHtml}
                                </div>`
                                + `<div class="mobile-empty-branch">`
                                + `<div class="mobile-empty-branch-icon" aria-hidden="true"></div>`
                                + `<div class="mobile-empty-branch-text">${escHtml(ui.mobileEndOfBranch || 'End of Branch')}</div></div>`;
                            const headElEmpty = panel.querySelector('.mobile-panel-head');
                            bindMoveHereButton(this, headElEmpty || panel, current);
                            const headToolsEmpty = headElEmpty?.querySelector('.mobile-inline-tools-host');
                            if (headToolsEmpty) this.bindMobileInlineNodeTools(headToolsEmpty, current);
                            bindPanelHeadEmoji(this, headElEmpty || panel, current);
                            bindPanelTitleRename(this, headElEmpty || panel, current);
                            const backBtnEmptyEl = panel.querySelector('.mobile-panel-back');
                            if (backBtnEmptyEl) {
                                this.bindMobileTap(backBtnEmptyEl, (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (this.mobilePath && this.mobilePath.length > 1) {
                                        this.mobilePath = this.mobilePath.slice(0, -1);
                                        this.invalidateMobilePrototypeKeys();
                                        this.renderMobilePrototypeTree(store.value.data);
                                        schedulePersistTreeUiState(store);
                                    }
                                });
                            }
                            mountConstructionCreateFab(this, panel, current);
                        } else {
                            const isConstructExplore = store.value.constructionMode;
                            const canWriteExplore = fileSystem.features.canWrite;
                            const backBtnExplore =
                                this.mobilePath && this.mobilePath.length > 1
                                    ? `<button type="button" class="mobile-panel-back" aria-label="${escAttr(ui.navBack || ui.close || 'Back')}" title="${escAttr(ui.navBack || ui.close || 'Back')}">←</button>`
                                    : '';
                            const headEmojiExplore =
                                isConstructExplore && canWriteExplore
                                    ? constructionPanelHeadEmojiMarkup(this, current, ui)
                                    : '';
                            const titleCellExplore =
                                isConstructExplore && canWriteExplore
                                    ? constructionPanelTitleMarkup(this, current, ui)
                                    : panelTitleCellRead(this, current, ui);
                            const parentToolsExplore =
                                isConstructExplore && canWriteExplore
                                    ? this.buildMobileInlineNodeToolsHTML(current, {
                                          compact: true,
                                          folderContextDimmed: false,
                                          revealDelete: false,
                                          omitDelete: true
                                      }) || ''
                                    : '';
                            panel.innerHTML = `<div class="mobile-panel-head">
                            <div class="mobile-panel-header">${backBtnExplore}${headEmojiExplore}${titleCellExplore}${!isConstructExplore ? `<div class="mobile-panel-actions"><button type="button" class="mobile-panel-cta mobile-panel-cta--forum" aria-label="${escAttr(ui.navForum || 'Forum')}" title="${escAttr(ui.navForum || 'Forum')}">${escHtml(ui.navForum || 'Forum')} 💬</button><button type="button" class="mobile-panel-cta mobile-panel-cta--arcade" aria-label="${escAttr(ui.mobileArcadeCta || ui.navArcade || 'Arcade')}" title="${escAttr(ui.mobileArcadeCta || ui.navArcade || 'Arcade')}">${escHtml(ui.mobileArcadeCta || ui.navArcade || 'Arcade')} 🎮</button></div>` : ''}</div>
                            ${parentToolsExplore}
                            ${moveHereHtml}
                        </div>`
                                + `<div class="mobile-empty-branch">`
                                + `<div class="mobile-empty-branch-icon" aria-hidden="true"></div>`
                                + `<div class="mobile-empty-branch-text">${escHtml(ui.mobileEndOfBranch || 'End of Branch')}</div></div>`;
                            const headElExplore = panel.querySelector('.mobile-panel-head');
                            const headToolsExplore = headElExplore?.querySelector('.mobile-inline-tools-host');
                            if (headToolsExplore) this.bindMobileInlineNodeTools(headToolsExplore, current);
                            bindMoveHereButton(this, headElExplore || panel, current);
                            bindPanelHeadEmoji(this, headElExplore || panel, current);
                            bindPanelTitleRename(this, headElExplore || panel, current);
                            const backBtnElExplore = panel.querySelector('.mobile-panel-back');
                            if (backBtnElExplore) {
                                this.bindMobileTap(backBtnElExplore, (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (this.mobilePath && this.mobilePath.length > 1) {
                                        this.mobilePath = this.mobilePath.slice(0, -1);
                                        this.invalidateMobilePrototypeKeys();
                                        this.renderMobilePrototypeTree(store.value.data);
                                        schedulePersistTreeUiState(store);
                                    }
                                });
                            }
                            const forumBtnExplore = panel.querySelector('.mobile-panel-cta--forum');
                            if (forumBtnExplore) {
                                this.bindMobileTap(forumBtnExplore, (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    store.setModal({ type: 'forum', placeId: current.id });
                                });
                            }
                            const arcadeBtnExplore = panel.querySelector('.mobile-panel-cta--arcade');
                            if (arcadeBtnExplore) {
                                this.bindMobileTap(arcadeBtnExplore, (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    store.setModal({ type: 'arcade', preSelectedNodeId: current.id });
                                });
                            }
                        }
                    }
                } else {
                    const isConstruct = store.value.constructionMode;
                    const canWrite = fileSystem.features.canWrite;
                    const sel = this.selectedNodeId;
                    const hideInlineWhilePickingMove = !!this.pendingMoveNodeId;
                    const directChildSelected =
                        sel != null && children.some((c) => String(c.id) === String(sel));
                    const parentToolsHtml =
                        isConstruct && canWrite
                            ? this.buildMobileInlineNodeToolsHTML(current, {
                                  compact: true,
                                  folderContextDimmed: directChildSelected && !hideInlineWhilePickingMove,
                                  revealDelete: false,
                                  omitDelete: true
                              })
                            : '';
                    const backBtnHtml =
                        this.mobilePath && this.mobilePath.length > 1
                            ? `<button type="button" class="mobile-panel-back" aria-label="${escAttr(ui.navBack || ui.close || 'Back')}" title="${escAttr(ui.navBack || ui.close || 'Back')}">←</button>`
                            : '';
                    const moveHereHtml = moveHereButtonMarkup(this, current, ui);
                    const headEmojiMain =
                        isConstruct && canWrite ? constructionPanelHeadEmojiMarkup(this, current, ui) : '';
                    const titleCellMain =
                        isConstruct && canWrite
                            ? constructionPanelTitleMarkup(this, current, ui)
                            : panelTitleCellRead(this, current, ui);
                    panel.innerHTML = `<div class="mobile-panel-head">
                            <div class="mobile-panel-header">${backBtnHtml}${headEmojiMain}${titleCellMain}${!isConstruct ? `<div class="mobile-panel-actions"><button type="button" class="mobile-panel-cta mobile-panel-cta--forum" aria-label="${escAttr(ui.navForum || 'Forum')}" title="${escAttr(ui.navForum || 'Forum')}">${escHtml(ui.navForum || 'Forum')} 💬</button><button type="button" class="mobile-panel-cta mobile-panel-cta--arcade" aria-label="${escAttr(ui.mobileArcadeCta || ui.navArcade || 'Arcade')}" title="${escAttr(ui.mobileArcadeCta || ui.navArcade || 'Arcade')}">${escHtml(ui.mobileArcadeCta || ui.navArcade || 'Arcade')} 🎮</button></div>` : ''}</div>
                            ${parentToolsHtml}
                            ${moveHereHtml}
                        </div>`;
                    const headElMain = panel.querySelector('.mobile-panel-head');
                    const headTools = headElMain?.querySelector('.mobile-inline-tools-host');
                    if (headTools) this.bindMobileInlineNodeTools(headTools, current);
                    bindMoveHereButton(this, headElMain || panel, current);
                    bindPanelHeadEmoji(this, headElMain || panel, current);
                    bindPanelTitleRename(this, headElMain || panel, current);
                    const backBtn = panel.querySelector('.mobile-panel-back');
                    if (backBtn) {
                        this.bindMobileTap(backBtn, (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (this.mobilePath && this.mobilePath.length > 1) {
                                this.mobilePath = this.mobilePath.slice(0, -1);
                                this.invalidateMobilePrototypeKeys();
                                this.renderMobilePrototypeTree(store.value.data);
                                schedulePersistTreeUiState(store);
                            }
                        });
                    }
                    const forumBtnMain = panel.querySelector('.mobile-panel-cta--forum');
                    if (forumBtnMain) {
                        this.bindMobileTap(forumBtnMain, (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            store.setModal({ type: 'forum', placeId: current.id });
                        });
                    }
                    const arcadeBtn = panel.querySelector('.mobile-panel-cta--arcade');
                    if (arcadeBtn) {
                        this.bindMobileTap(arcadeBtn, (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            store.setModal({ type: 'arcade', preSelectedNodeId: current.id });
                        });
                    }
                    children.forEach((child) => {
                        const hasKidsLoaded = child.children && child.children.length > 0;
                        const tone = this.getMobileTone(child);
                        const childCompleted = store.isCompleted && store.isCompleted(child.id);
                        const childHarvested = harvested.find(h => String(h.id) === String(child.id));
                        const childState = childHarvested ? ' state-harvested' : child.isEmpty ? ' state-empty' : childCompleted ? ' state-completed' : '';
                        const rowState = childHarvested ? '' : child.isEmpty ? ' is-empty' : childCompleted ? ' is-completed' : '';
                        const isFolderRow = child.type === 'branch';

                        let childIcon = child.icon;
                        if (child.type === 'exam' && childCompleted) childIcon = '✔';
                        else if (!childIcon) {
                            if (child.type === 'branch') childIcon = '📁';
                            else if (child.type === 'exam') childIcon = '📝';
                            else childIcon = '📖';
                        }

                        const hideInlineWhilePickingMove = !!this.pendingMoveNodeId;
                        const isRowSel =
                            isConstruct &&
                            canWrite &&
                            !hideInlineWhilePickingMove &&
                            this.selectedNodeId != null &&
                            String(child.id) === String(this.selectedNodeId);
                        const childTools =
                            isConstruct && canWrite && !hideInlineWhilePickingMove
                                ? this.buildMobileInlineNodeToolsHTML(child, { compact: true })
                                : '';

                        const row = document.createElement('div');
                        const cname = child.name || '';
                        const nameLine = `${escHtml(cname)}${childCompleted ? ' · ✔' : ''}`;
                        const renamingRow =
                            isConstruct &&
                            canWrite &&
                            String(this._inlineRenameNodeId || '') === String(child.id);
                        const nameBlock = renamingRow
                            ? `<input type="text" class="mobile-child-name-input mobile-child-name-input--inset" value="${escAttr(cname)}" aria-label="${escAttr(
                                  ui.graphEdit || 'Rename'
                              )}" />`
                            : `<div class="mobile-child-name mobile-child-name-slot" title="${escAttr(cname)}">${nameLine}</div>`;
                        row.className = `mobile-child-row${rowState}${isRowSel ? ' mobile-child-row--selected' : ''}${
                            isFolderRow ? ' mobile-child-row--folder' : ''
                        }`;
                        row.setAttribute('data-node-id', String(child.id));
                        const showArrow = isFolderRow || hasKidsLoaded;
                        const useFolderTrail =
                            isFolderRow && isConstruct && canWrite && !hideInlineWhilePickingMove;
                        const dateStr = useFolderTrail ? formatBranchUpdatedLabel(child) : '';
                        const dateHint = ui.graphFolderUpdatedHint || 'Last update';
                        const folderTrailHtml = useFolderTrail
                            ? `<div class="mobile-child-folder-trail">${
                                  dateStr
                                      ? `<span class="mobile-child-folder-meta" title="${escAttr(
                                            `${dateHint}: ${dateStr}`
                                        )}">${escHtml(dateStr)}</span>`
                                      : ''
                              }<div class="mobile-child-arrow" aria-hidden="true">›</div></div>`
                            : showArrow
                              ? `<div class="mobile-child-arrow" aria-hidden="true">›</div>`
                              : '';
                        const iconHit =
                            isConstruct && canWrite && !hideInlineWhilePickingMove
                                ? `<button type="button" class="mobile-child-icon-btn" aria-label="${escAttr(
                                      ui.graphChangeIcon || ui.graphEdit || 'Icon'
                                  )}"><span class="mobile-child-icon" aria-hidden="true">${childIcon}</span></button>`
                                : `<span class="mobile-child-icon" aria-hidden="true">${childIcon}</span>`;
                        row.innerHTML = `<div class="mobile-child-knot tone-${tone}${childState}">${iconHit}</div>`
                            + `<div class="mobile-child-info">`
                            + nameBlock
                            + `</div>`
                            + childTools
                            + folderTrailHtml;
                        const iconBtn = row.querySelector('.mobile-child-icon-btn');
                        if (iconBtn) {
                            this.bindMobileTap(iconBtn, (ev) => {
                                ev.preventDefault();
                                ev.stopPropagation();
                                openConstructionEmojiPicker(this, iconBtn, child);
                            });
                        }
                        this.bindMobileTap(row, async (e) => {
                            try {
                                const t = e?.target;
                                const fromIconBtn =
                                    t && typeof t.closest === 'function' && t.closest('.mobile-child-icon-btn');
                                if (fromIconBtn) return;
                                const fromTools =
                                    t &&
                                    typeof t.closest === 'function' &&
                                    t.closest('.mobile-inline-tools');
                                if (fromTools) return;
                                const fromNameInput =
                                    t && typeof t.closest === 'function' && t.closest('.mobile-child-name-input');
                                if (fromNameInput) return;
                                const fromNameSlot =
                                    t && typeof t.closest === 'function' && t.closest('.mobile-child-name-slot');
                                if (
                                    fromNameSlot &&
                                    store.value.constructionMode &&
                                    fileSystem.features.canWrite
                                ) {
                                    return;
                                }

                                if (
                                    store.value.constructionMode &&
                                    fileSystem.features.canWrite &&
                                    !this.pendingMoveNodeId
                                ) {
                                    this.selectedNodeId = child.id;
                                    this.isMoveMode = false;
                                }
                                if (child.type === 'leaf' || child.type === 'exam') {
                                    if (store.value.constructionMode && fileSystem.features.canWrite) {
                                        this.invalidateMobilePrototypeKeys();
                                        if (store.value.data) this.renderMobilePrototypeTree(store.value.data);
                                        return;
                                    }
                                    await store.openNodeFromMobileTree(child.id);
                                    return;
                                }
                                if (child.type === 'branch') {
                                    if (child.hasUnloadedChildren && (!child.children || child.children.length === 0)) {
                                        await store.loadNodeChildren(child);
                                    }
                                    const folderRowStrictNav =
                                        store.value.constructionMode &&
                                        fileSystem.features.canWrite &&
                                        !this.pendingMoveNodeId;
                                    if (folderRowStrictNav) {
                                        const hitArrow =
                                            t &&
                                            typeof t.closest === 'function' &&
                                            t.closest('.mobile-child-arrow');
                                        if (!hitArrow) {
                                            this.invalidateMobilePrototypeKeys();
                                            if (store.value.data) this.renderMobilePrototypeTree(store.value.data);
                                            return;
                                        }
                                    }
                                    this.mobilePath.push(child.id);
                                    this.invalidateMobilePrototypeKeys();
                                    this.renderMobilePrototypeTree(store.value.data);
                                    schedulePersistTreeUiState(store);
                                    return;
                                }
                                await store.openNodeFromMobileTree(child.id);
                            } catch (err) {
                                console.error('Mobile tree navigation failed', err);
                            }
                        });

                        const toolsHost = row.querySelector('.mobile-inline-tools-host');
                        if (toolsHost) this.bindMobileInlineNodeTools(toolsHost, child);
                        bindChildInlineRename(this, row, child);

                        const wrap = document.createElement('div');
                        wrap.className = 'mobile-child-wrap';
                        wrap.appendChild(row);
                        panel.appendChild(wrap);
                    });
                }
                branchWrap.appendChild(panel);
                this.mobileRightCol.appendChild(branchWrap);
            } else {
                this.mobileRightCol.appendChild(labelRow);
            }
        });

        /*
         * Safety net: in construction mode, always ensure the current folder panel has the FAB.
         * Some incremental/chrome-only refresh paths can replace header/rows without re-mounting it.
         */
        if (store.value.constructionMode && fileSystem.features.canWrite) {
            try {
                const branch = this.mobileRightCol?.querySelector('.mobile-active-branch');
                const panel = branch?.querySelector?.('.mobile-children-panel');
                if (panel) {
                    mountConstructionCreateFab(this, panel, current);
                }
            } catch {
                /* ignore */
            }
        }

        if (this.mobileVersionFixedSlot) {
            const slot = this.mobileVersionFixedSlot;
            slot.innerHTML = '';
            slot.hidden = true;
            slot.setAttribute('aria-hidden', 'true');
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

        const pathDepth = pathNodes.length;
        this._prevMobilePathDepth = pathDepth;
        this._lastMobileBranchChildCount = (current.children || []).length;

        const pathKeyScroll = JSON.stringify(this.mobilePath);
        this._prevMobileScrollPath = pathKeyScroll;

        const pathUnchangedForScroll =
            JSON.stringify(this.mobilePath) === pathBeforeRebuild;
        if (trunkScrollEl) {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    if (this.mobileTrunkContainer) {
                        this.mobileTrunkContainer.scrollTop = preserveTrunkScroll;
                    }
                });
            });
        }

        this.scheduleMobilePrototypeOverlay(false);
        if (this._versionMenuOpen) {
            requestAnimationFrame(() => this.positionVersionDropdownPanel());
        }
        this._syncMobileTreeUiLayer();
    }
