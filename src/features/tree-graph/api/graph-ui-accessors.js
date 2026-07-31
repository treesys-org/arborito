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
