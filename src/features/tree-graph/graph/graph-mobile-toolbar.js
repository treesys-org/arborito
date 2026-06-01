import { store } from '../../../core/store.js';
import { fileSystem } from '../../backup-export/filesystem.js';
import { bindMobileTap } from '../../../shared/ui/mobile-tap.js';
import { escHtml, escAttr } from './graph-mobile-shared.js';

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
        let inner = `<div class="mobile-inline-tools${compactClass}" role="group" aria-label="${escHtml(nodeToolsAria)}">`;
        if (canMove) inner += btn('move', '↕️', ui.graphMove || 'Move');
        if (!isRoot && !omitDelete) {
            // In construction mode for lessons/exams we never hide the delete
            // button: on mobile there is no hover and requiring select-first is confusing.
            // Also in construction the ✕ must always be visible (mobile/desktop):
            // hiding it behind hover/selection is annoying, especially on touch.
            const shouldHide = revealDelete && !store.value.constructionMode;
            const delReveal = shouldHide ? ' mobile-inline-tool--hover-reveal' : '';
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
                await this.runMobileNodeAction(node, act);
                this.invalidateMobilePrototypeKeys();
                if (store.value.data) this.renderMobilePrototypeTree(store.value.data);
            });
        });
    }
