import { store } from '../../../core/store.js';
import { shouldShowMobileUI } from '../../../shared/ui/breakpoints.js';
import { schedulePersistTreeUiState } from '../tree-ui-persist.js';
import { fileSystem } from '../../backup-export/filesystem.js';
import {
    openConstructionEmojiPicker,
    startConstructionRename
} from './graph-mobile-tree-panel-tools.js';

export function bindPanelHeadEmoji(graph, headEl, current) {
    if (!headEl || !current) return;
    const btn = headEl.querySelector('.mobile-panel-head-emoji');
    if (!btn) return;
    graph.bindMobileTap(btn, (e) => {
        e.preventDefault();
        e.stopPropagation();
        openConstructionEmojiPicker(graph, btn, current);
    });
}

export function bindPanelTitleRename(graph, headEl, node) {
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
            finish(true).catch(() => {});
        };
        document.addEventListener('pointerdown', docPtr, true);
        requestAnimationFrame(() => {
            inp.focus();
            if (typeof inp.select === 'function') inp.select();
        });
        inp.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') {
                ev.preventDefault();
                finish(true).catch(() => {});
            } else if (ev.key === 'Escape') {
                ev.preventDefault();
                finish(false).catch(() => {});
            }
        });
        inp.addEventListener('blur', () => finish(true).catch(() => {}));
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

export function bindChildInlineRename(graph, row, child) {
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
            finish(true).catch(() => {});
        };
        document.addEventListener('pointerdown', docPtr, true);
        requestAnimationFrame(() => {
            inp.focus();
            if (typeof inp.select === 'function') inp.select();
        });
        inp.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') {
                ev.preventDefault();
                finish(true).catch(() => {});
            } else if (ev.key === 'Escape') {
                ev.preventDefault();
                finish(false).catch(() => {});
            }
        });
        inp.addEventListener('blur', () => finish(true).catch(() => {}));
        return;
    }
    const pencil = row.querySelector('.mobile-child-rename-btn');
    const renameLbl = store.ui?.graphRename || store.ui?.graphEdit || 'Rename';
    const triggerRename = (e) => {
        e.preventDefault();
        e.stopPropagation();
        startConstructionRename(graph, child, child.name || '');
    };
    if (pencil) graph.bindMobileTap(pencil, triggerRename);
    const slot = row.querySelector('.mobile-child-name-slot');
    if (!slot || !store.value.constructionMode || !fileSystem.features.canWrite || child.type === 'root') return;
    slot.addEventListener('dblclick', triggerRename);
    if (!shouldShowMobileUI()) {
        graph.bindMobileTap(slot, triggerRename);
    }
}

export function bindPanelRenamePencil(graph, headEl, node) {
    if (!headEl || !node || node.type === 'root') return;
    const btn = headEl.querySelector('.mobile-panel-rename-btn');
    if (!btn || !store.value.constructionMode || !fileSystem.features.canWrite) return;
    graph.bindMobileTap(btn, (e) => {
        e.preventDefault();
        e.stopPropagation();
        startConstructionRename(graph, node, node.name || '');
    });
    const slot = headEl.querySelector('.mobile-panel-title-slot');
    if (slot && !shouldShowMobileUI()) {
        slot.addEventListener('dblclick', (e) => {
            e.preventDefault();
            e.stopPropagation();
            startConstructionRename(graph, node, node.name || '');
        });
    }
}
