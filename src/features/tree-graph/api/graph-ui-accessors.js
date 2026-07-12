/**
 * Read graph UI fields from store (replaces engine property accessors).
 */
import { getArboritoStore } from '../../../core/store-singleton.js';
import { createDefaultGraphUi } from './graph-ui-state.js';

function storeRef() {
    return getArboritoStore();
}

export function getGraphUi() {
    const store = storeRef();
    if (!store) return createDefaultGraphUi();
    return store.state.graphUi || createDefaultGraphUi();
}

export function getMobilePath() {
    const p = getGraphUi().mobilePath;
    return Array.isArray(p) ? p.map(String) : [];
}

export function getSelectedNodeId() {
    const id = getGraphUi().selectedNodeId;
    return id != null ? String(id) : null;
}

export function getPendingMoveNodeId() {
    const id = getGraphUi().pendingMoveNodeId;
    return id != null ? String(id) : null;
}

export function getInlineRenameNodeId() {
    const id = getGraphUi().inlineRenameNodeId;
    return id != null ? String(id) : null;
}

export function isMoveMode() {
    return !!getGraphUi().isMoveMode;
}

export function isTreeSwitcherOpen() {
    return !!getGraphUi().treeSwitcherOpen;
}
