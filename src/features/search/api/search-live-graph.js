import { TreeUtils } from '../../tree-graph/api/tree-utils.js';
import {
    entryMatchesSearchQuery,
    matchesSearchTokens,
    mergeSearchEntriesById,
} from './search-index-core.js';

function langKeyBase(code) {
    return String(code || '')
        .trim()
        .toUpperCase()
        .replace(/[-_]/g, '')
        .slice(0, 2);
}

/**
 * Active curriculum language only — never mixes ES/EN (or other) trees in one query.
 * @returns {{ root: object, lang: string }[]}
 */
function curriculumRootsForSearch(store, rawGraphData, fallbackData) {
    const langs = rawGraphData?.languages;
    const entries = [];
    if (langs && typeof langs === 'object' && !Array.isArray(langs)) {
        for (const [code, root] of Object.entries(langs)) {
            if (root && typeof root === 'object') {
                entries.push({ root, lang: String(code).toUpperCase() });
            }
        }
    }
    if (!entries.length && fallbackData) {
        const lang =
            (typeof store?.getCurrentContentLangKey === 'function' && store.getCurrentContentLangKey()) ||
            store?.state?.lang ||
            'EN';
        entries.push({ root: fallbackData, lang: String(lang).toUpperCase() });
        return entries;
    }
    if (entries.length <= 1) return entries;

    const preferred =
        (typeof store?.getCurrentContentLangKey === 'function' && store.getCurrentContentLangKey()) ||
        store?.state?.lang ||
        '';
    const prefBase = langKeyBase(preferred);
    if (!prefBase) return [];
    return entries.filter((e) => langKeyBase(e.lang) === prefBase);
}

/**
 * Immediate in-memory search over the loaded graph (no IndexedDB).
 * @param {string} [langUpper]
 */
export function searchLiveGraph(data, query, activeSource, langUpper = '') {
    if (!query || String(query).length < 2) return [];
    const q = TreeUtils.cleanString(query);
    if (!q) return [];

    const out = [];
    const seen = new Set();
    const lang = langUpper ? String(langUpper).toUpperCase() : '';

    const push = (node, crumb) => {
        if (!node || node.id == null || seen.has(String(node.id))) return;
        const name = node.name != null ? String(node.name) : '';
        const description = node.description != null ? String(node.description) : '';
        const pathStr = node.path != null ? String(node.path) : crumb || '';
        const body =
            (node.type === 'leaf' || node.type === 'exam') && typeof node.content === 'string'
                ? node.content.slice(0, 4000)
                : '';
        if (!entryMatchesSearchQuery({ name, description, searchBody: body }, q)) return;
        seen.add(String(node.id));
        out.push({
            id: String(node.id),
            name,
            type: node.type,
            icon: node.icon || '',
            description,
            path: crumb || pathStr || name,
            searchBody: body,
            lang,
        });
    };

    const walk = (node, parts) => {
        if (!node || typeof node !== 'object') return;
        const nextParts =
            node.type === 'root' ? parts : [...parts, node.name != null ? String(node.name) : ''];
        const crumb = nextParts.filter(Boolean).join(' / ');
        if (node.type === 'root' || node.type === 'branch' || node.type === 'leaf' || node.type === 'exam') {
            push(node, crumb);
        }
        if (Array.isArray(node.children)) {
            for (const c of node.children) walk(c, nextParts);
        }
    };

    if (data) walk(data, []);

    const sourceName = activeSource?.name ? String(activeSource.name) : '';
    const rootId =
        (data && data.id != null ? String(data.id) : '') ||
        (activeSource?.id != null ? String(activeSource.id) : '');
    if (
        sourceName &&
        rootId &&
        matchesSearchTokens(TreeUtils.cleanString(sourceName), q) &&
        !seen.has(rootId)
    ) {
        seen.add(rootId);
        out.unshift({
            id: rootId,
            name: sourceName,
            type: 'root',
            icon: (data && data.icon) || '🌳',
            description: (data && data.description) || '',
            path: sourceName,
            searchBody: '',
            lang,
        });
    }

    return out;
}

/**
 * Search only the active curriculum language (UI/content). Never mixes languages.
 * @param {import('../../../stores/shell-store.js').ShellStore | null} store
 */
export function searchLiveGraphFromStore(store, query) {
    if (!store?.state) return [];
    const { data, rawGraphData, activeSource } = store.state;
    if (!activeSource?.id && !activeSource?.url) return [];

    let merged = [];
    for (const { root, lang } of curriculumRootsForSearch(store, rawGraphData, data)) {
        merged = mergeSearchEntriesById(merged, searchLiveGraph(root, query, activeSource, lang));
    }

    const metaBits = [
        activeSource?.name,
        rawGraphData?.universeName,
        rawGraphData?.meta?.title,
        rawGraphData?.meta?.description,
    ]
        .filter(Boolean)
        .join(' ');
    const q = TreeUtils.cleanString(query);
    if (q && metaBits && matchesSearchTokens(TreeUtils.cleanString(metaBits), q)) {
        const anchor = data || curriculumRootsForSearch(store, rawGraphData, null)[0]?.root;
        const rootId =
            (anchor?.id != null ? String(anchor.id) : '') ||
            (activeSource?.id != null ? String(activeSource.id) : '');
        if (rootId && !merged.some((r) => String(r.id) === rootId)) {
            merged.unshift({
                id: rootId,
                name: String(activeSource?.name || anchor?.name || metaBits).slice(0, 120),
                type: 'root',
                icon: anchor?.icon || '🌳',
                description: String(rawGraphData?.meta?.description || anchor?.description || ''),
                path: String(activeSource?.name || anchor?.name || ''),
                searchBody: '',
            });
        }
    }

    return merged;
}
