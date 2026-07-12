import { TreeUtils } from '../features/tree-graph/api/tree-utils.js';
import { getArboritoStore } from '../core/store-singleton.js';
import { findNodeAction, navigateToAction } from './tree-graph-store-actions.js';
import { getLocalShardOverlay } from '../features/search/api/search-index-service.js';
import { mergeSearchEntriesById } from '../features/search/api/search-index-core.js';
import { searchLiveGraphFromStore } from '../features/search/api/search-live-graph.js';

function hasSearchableSource(store) {
    const src = store?.state?.activeSource;
    return !!(src && (src.url || src.id));
}

function curriculumLangCodes(rawGraphData, fallbackLang) {
    const langs = rawGraphData?.languages;
    if (langs && typeof langs === 'object') {
        const codes = Object.keys(langs).map((c) => String(c).toUpperCase().slice(0, 8));
        if (codes.length) return codes;
    }
    return [String(fallbackLang || 'EN').toUpperCase().slice(0, 8)];
}

async function getLocalOverlayAllLangs(store, langUi, prefix) {
    const src = store.state.activeSource;
    const raw = store.state.rawGraphData;
    if (!(src && src.id) || !raw) return [];
    const langs = curriculumLangCodes(raw, langUi);
    let merged = [];
    for (const langCode of langs) {
        const rows = await getLocalShardOverlay(src, raw, langCode, prefix);
        if (rows?.length) merged = mergeSearchEntriesById(merged, rows);
    }
    return merged;
}

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
    if (!hasSearchableSource(store)) return [];

    const live = searchLiveGraphFromStore(store, query);

    const cache =
        store.state.searchCache && typeof store.state.searchCache === 'object'
            ? store.state.searchCache
            : {};
    const getLocalOverlay = (langU, prefix) => getLocalOverlayAllLangs(store, langU, prefix);
    let indexed = [];
    try {
        indexed = await TreeUtils.search(
            query,
            store.state.activeSource,
            store.state.lang,
            cache,
            getLocalOverlay
        );
        if (store.state.searchCache !== cache) {
            commitSearchState({ searchCache: cache });
        }
    } catch (e) {
        console.warn('[Arborito] search index', e);
    }
    return mergeSearchEntriesById(live, indexed);
}

export async function searchBroadAction(char) {
    const store = getArboritoStore();
    if (!hasSearchableSource(store)) return [];

    const live = char ? searchLiveGraphFromStore(store, char) : [];

    const cache =
        store.state.searchCache && typeof store.state.searchCache === 'object'
            ? store.state.searchCache
            : {};
    const getLocalOverlay = (langU, prefix) => getLocalOverlayAllLangs(store, langU, prefix);
    let indexed = [];
    try {
        indexed = await TreeUtils.searchBroad(
            char,
            store.state.activeSource,
            store.state.lang,
            cache,
            getLocalOverlay
        );
        if (store.state.searchCache !== cache) {
            commitSearchState({ searchCache: cache });
        }
    } catch (e) {
        console.warn('[Arborito] search broad index', e);
    }
    return mergeSearchEntriesById(live, indexed);
}

export { findNodeAction, navigateToAction };

/** Acciones búsqueda, dominio en este módulo. */
export const searchActions = {
    search: searchAction,
    searchBroad: searchBroadAction,
    findNode: findNodeAction,
    navigateTo: navigateToAction,
};
