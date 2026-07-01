import { TreeUtils } from '../features/tree-graph/api/tree-utils.js';
import { getArboritoStore } from '../core/store-singleton.js';
import { findNodeAction, navigateToAction } from './tree-graph-store-actions.js';

/**
 * Aplica un patch de búsqueda al singleton (sincroniza slices vía `store.update`).
 * @param {Record<string, unknown>} partial
 */
export function commitSearchState(partial) {
    const store = getArboritoStore();
    if (!store || !partial) return;
    store.update(partial);
}

export async function searchAction(query) {
    const store = getArboritoStore();
    if (!store?.state.activeSource?.url) return [];
    const getLocalOverlay = (langU, prefix) =>
        import('../features/search/api/search-index-service.js').then((m) =>
            m.getLocalShardOverlay(store.state.activeSource, store.state.rawGraphData, langU, prefix)
        );
    return TreeUtils.search(
        query,
        store.state.activeSource,
        store.state.lang,
        store.state.searchCache,
        getLocalOverlay
    );
}

export async function searchBroadAction(char) {
    const store = getArboritoStore();
    if (!store?.state.activeSource?.url) return [];
    const getLocalOverlay = (langU, prefix) =>
        import('../features/search/api/search-index-service.js').then((m) =>
            m.getLocalShardOverlay(store.state.activeSource, store.state.rawGraphData, langU, prefix)
        );
    return TreeUtils.searchBroad(
        char,
        store.state.activeSource,
        store.state.lang,
        store.state.searchCache,
        getLocalOverlay
    );
}

export { findNodeAction, navigateToAction };

/** Acciones búsqueda — dominio en este módulo. */
export const searchActions = {
    search: searchAction,
    searchBroad: searchBroadAction,
    findNode: findNodeAction,
    navigateTo: navigateToAction,
};
