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

function langKeyBase(code) {
    return String(code || '')
        .trim()
        .toUpperCase()
        .replace(/[-_]/g, '')
        .slice(0, 2);
}

function curriculumLangCodes(rawGraphData, fallbackLang) {
    const langs = rawGraphData?.languages;
    if (langs && typeof langs === 'object') {
        const codes = Object.keys(langs).map((c) => String(c).toUpperCase().slice(0, 8));
        if (codes.length) return codes;
    }
    return [String(fallbackLang || 'EN').toUpperCase().slice(0, 8)];
}

/** Resolve the single curriculum language used for search (never mixes langs). */
export function resolveSearchContentLang(store, langUi) {
    const raw = store?.state?.rawGraphData;
    const preferred =
        (typeof store?.getCurrentContentLangKey === 'function' && store.getCurrentContentLangKey()) ||
        langUi ||
        store?.state?.lang ||
        'EN';
    const prefCode = String(preferred || 'EN').toUpperCase().slice(0, 8);
    const langs = curriculumLangCodes(raw, langUi || preferred);
    const prefBase = langKeyBase(prefCode);
    const matched = langs.find((c) => langKeyBase(c) === prefBase);
    if (matched) return matched;
    /* Only if the tree has a single language, use it — never spill into a second lang. */
    if (langs.length === 1) return langs[0];
    return prefCode;
}

function sameSearchLang(a, b) {
    const ba = langKeyBase(a);
    const bb = langKeyBase(b);
    if (!ba || !bb) return !a || !b;
    return ba === bb;
}

/** IndexedDB overlay for the active content language only — no other-lang fallback. */
async function getLocalOverlayContentLangOnly(store, langUi, prefix) {
    const src = store.state.activeSource;
    const raw = store.state.rawGraphData;
    if (!(src && src.id) || !raw) return [];
    const code = resolveSearchContentLang(store, langUi);
    return (await getLocalShardOverlay(src, raw, code, prefix)) || [];
}

function filterResultsToContentLang(rows, contentLang) {
    if (!Array.isArray(rows) || !rows.length) return [];
    const base = langKeyBase(contentLang);
    if (!base) return rows;
    return rows.filter((n) => {
        const lang = n?.lang;
        if (lang == null || lang === '') return true;
        return sameSearchLang(lang, contentLang);
    });
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

    const contentLang = resolveSearchContentLang(store, store.state.lang);
    const live = searchLiveGraphFromStore(store, query);

    const cache =
        store.state.searchCache && typeof store.state.searchCache === 'object'
            ? store.state.searchCache
            : {};
    const getLocalOverlay = (langU, prefix) => getLocalOverlayContentLangOnly(store, langU, prefix);
    let indexed = [];
    try {
        indexed = await TreeUtils.search(
            query,
            store.state.activeSource,
            contentLang,
            cache,
            getLocalOverlay
        );
        if (store.state.searchCache !== cache) {
            commitSearchState({ searchCache: cache });
        }
    } catch (e) {
        console.warn('[Arborito] search index', e);
    }
    return filterResultsToContentLang(mergeSearchEntriesById(live, indexed), contentLang);
}

export async function searchBroadAction(char) {
    const store = getArboritoStore();
    if (!hasSearchableSource(store)) return [];

    const contentLang = resolveSearchContentLang(store, store.state.lang);
    const live = char ? searchLiveGraphFromStore(store, char) : [];

    const cache =
        store.state.searchCache && typeof store.state.searchCache === 'object'
            ? store.state.searchCache
            : {};
    const getLocalOverlay = (langU, prefix) => getLocalOverlayContentLangOnly(store, langU, prefix);
    let indexed = [];
    try {
        indexed = await TreeUtils.searchBroad(
            char,
            store.state.activeSource,
            contentLang,
            cache,
            getLocalOverlay
        );
        if (store.state.searchCache !== cache) {
            commitSearchState({ searchCache: cache });
        }
    } catch (e) {
        console.warn('[Arborito] search broad index', e);
    }
    return filterResultsToContentLang(mergeSearchEntriesById(live, indexed), contentLang);
}

export { findNodeAction, navigateToAction };

/** Acciones búsqueda, dominio en este módulo. */
export const searchActions = {
    search: searchAction,
    searchBroad: searchBroadAction,
    findNode: findNodeAction,
    navigateTo: navigateToAction,
};
