import { getPanelRef } from '../app/panel-refs.js';
import { getArboritoStore } from '../core/store-singleton.js';
import { closePreviewAction } from './learning-store-actions.js';
import {
    findNodeAction,
    navigateToAction,
    toggleNodeAction,
} from './tree-graph-store-actions.js';
import { goHomeAction, requestGoHomeAction } from './shell-ui-store-actions.js';
import { searchAction, searchBroadAction } from './search-store-actions.js';

export async function confirmLeaveActiveQuizIfNeededAction() {
    const contentEl = getPanelRef('content');
    if (contentEl && typeof contentEl.confirmLeaveIfNeeded === 'function') {
        return contentEl.confirmLeaveIfNeeded();
    }
    return true;
}

/**
 * Opens lesson/exam in content shell (never Studio modal).
 * @param {object} node
 */
export function openEditorAction(node) {
    const store = getArboritoStore();
    if (!store || !node) return;
    const isLesson = node.type === 'leaf' || node.type === 'exam';
    if (isLesson) {
        const sel = store.state.selectedNode;
        const already = sel && String(sel.id) === String(node.id);
        if (!already) {
            void navigateToAction(node.id, node);
        }
        return;
    }
    if (node.type === 'branch' || node.type === 'root') {
        store.update({ modal: { type: 'node-properties', node } });
    }
}

export async function loadNodeChildrenAction(node, opts) {
    const store = getArboritoStore();
    if (!store?.graphLogic) return undefined;
    return store.graphLogic.loadNodeChildren(node, opts);
}

export async function moveNodeAction(node, newParentId) {
    const store = getArboritoStore();
    if (!store?.graphLogic) return undefined;
    return store.graphLogic.moveNode(node, newParentId);
}

/** Cross-panel navigation, dominio piloto jr (sin lógica en mixin). */
export const navigationActions = {
    confirmLeaveActiveQuizIfNeeded: confirmLeaveActiveQuizIfNeededAction,
    openEditor: openEditorAction,
    loadNodeChildren: loadNodeChildrenAction,
    moveNode: moveNodeAction,
};

/** Store.prototype bundle, thin bind to *-store-actions.js. */
export const storeNavigationSearchMethods = {
    findNode: findNodeAction,
    navigateTo: navigateToAction,
    toggleNode: toggleNodeAction,
    loadNodeChildren: loadNodeChildrenAction,
    moveNode: moveNodeAction,
    goHome: goHomeAction,
    requestGoHome: requestGoHomeAction,
    confirmLeaveActiveQuizIfNeeded: confirmLeaveActiveQuizIfNeededAction,
    closePreview: closePreviewAction,
    openEditor: openEditorAction,
    search: searchAction,
    searchBroad: searchBroadAction,
};
