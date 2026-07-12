import { TreeUtils } from '../../tree-graph/api/tree-utils.js';
import { mergeSearchEntriesById } from './search-index-core.js';

/** @param {string} hay cleaned haystack */
/** @param {string} q cleaned query */
function matchesSearchQuery(hay, q) {
    if (!hay || !q) return false;
    if (hay.includes(q)) return true;
    const tokens = q.split(' ').filter((t) => t.length >= 2);
    if (!tokens.length) return false;
    return tokens.every((t) => hay.includes(t));
}

function curriculumRoots(rawGraphData, fallbackData) {
    const roots = [];
    const langs = rawGraphData?.languages;
    if (langs && typeof langs === 'object' && !Array.isArray(langs)) {
        for (const root of Object.values(langs)) {
            if (root && typeof root === 'object') roots.push(root);
        }
    }
    if (!roots.length && fallbackData) roots.push(fallbackData);
    return roots;
}

/**
 * Immediate in-memory search over the loaded graph (no IndexedDB).
 */
export function searchLiveGraph(data, query, activeSource) {
    if (!query || String(query).length < 2) return [];
    const q = TreeUtils.cleanString(query);
    if (!q) return [];

    const out = [];
    const seen = new Set();

    const push = (node, crumb) => {
        if (!node || node.id == null || seen.has(String(node.id))) return;
        const name = node.name != null ? String(node.name) : '';
        const description = node.description != null ? String(node.description) : '';
        const pathStr = node.path != null ? String(node.path) : crumb || '';
        const body =
            (node.type === 'leaf' || node.type === 'exam') && typeof node.content === 'string'
                ? node.content.slice(0, 4000)
                : '';
        const hay = TreeUtils.cleanString(`${name} ${description} ${pathStr} ${body}`);
        if (!matchesSearchQuery(hay, q)) return;
        seen.add(String(node.id));
        out.push({
            id: String(node.id),
            name,
            type: node.type,
            icon: node.icon || '',
            description,
            path: crumb || pathStr || name,
            searchBody: body,
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
    if (sourceName && rootId && matchesSearchQuery(TreeUtils.cleanString(sourceName), q) && !seen.has(rootId)) {
        seen.add(rootId);
        out.unshift({
            id: rootId,
            name: sourceName,
            type: 'root',
            icon: (data && data.icon) || '🌳',
            description: (data && data.description) || '',
            path: sourceName,
            searchBody: '',
        });
    }

    return out;
}

/**
 * Search every loaded curriculum language plus source metadata.
 * @param {import('../../../stores/shell-store.js').ShellStore | null} store
 */
export function searchLiveGraphFromStore(store, query) {
    if (!store?.state) return [];
    const { data, rawGraphData, activeSource } = store.state;
    if (!activeSource?.id && !activeSource?.url) return [];

    let merged = [];
    for (const root of curriculumRoots(rawGraphData, data)) {
        merged = mergeSearchEntriesById(merged, searchLiveGraph(root, query, activeSource));
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
    if (q && metaBits && matchesSearchQuery(TreeUtils.cleanString(metaBits), q)) {
        const anchor = data || curriculumRoots(rawGraphData, null)[0];
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
