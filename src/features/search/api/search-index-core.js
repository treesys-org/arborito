/**
 * Tokenization and shards by 2-letter prefix used by the local IndexedDB
 * search index and by any static `data/search/` shards a tree may host.
 */

import { TreeUtils } from '../../tree-graph/api/tree-utils.js';

export const SEARCH_INDEX_FORMAT_VERSION = 1;

/** @param {string} text */
export function tokenizeForSearch(text) {
    if (!text) return [];
    const cleaned = TreeUtils.cleanString(text);
    if (!cleaned) return [];
    return cleaned.split(' ').filter((w) => w.length >= 2);
}

/** @param {string} hay cleaned haystack */
/** @param {string} q cleaned query */
export function matchesSearchTokens(hay, q) {
    if (!hay || !q) return false;
    if (hay.includes(q)) return true;
    const tokens = q.split(' ').filter((t) => t.length >= 2);
    if (!tokens.length) return false;
    return tokens.every((t) => hay.includes(t));
}

/**
 * Match name / description / body only.
 * Path (breadcrumb) is excluded so a parent title like "… Linux" does not
 * surface unrelated children such as "Inspección física".
 * @param {{ name?: string, n?: string, description?: string, d?: string, searchBody?: string, sb?: string, b?: string }} entry
 * @param {string} query raw or cleaned
 */
export function entryMatchesSearchQuery(entry, query) {
    if (!entry) return false;
    const q = TreeUtils.cleanString(query);
    if (!q) return false;
    const own = TreeUtils.cleanString(
        `${entry.name || entry.n || ''} ${entry.description || entry.d || ''} ${entry.searchBody || entry.sb || entry.b || ''}`
    );
    return matchesSearchTokens(own, q);
}

/** Max lesson body characters indexed (lightweight full-text). */
const SEARCH_BODY_SNIPPET_MAX = 12000;

/**
 * Plain text to search inside lesson markdown (independent of editor-engine).
 * @param {string} raw
 * @param {number} [max]
 */
function lessonRawToSearchPlain(raw, max = SEARCH_BODY_SNIPPET_MAX) {
    let s = String(raw || '');
    s = s.replace(/^---[\s\S]*?---\s*/m, '');
    s = s.replace(/```[\s\S]*?```/g, ' ');
    s = s.replace(/`[^`]+`/g, ' ');
    s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    s = s.replace(/[#>*_|[\]()]/g, ' ');
    s = s.replace(/\s+/g, ' ').trim();
    if (s.length > max) s = s.slice(0, max);
    return s;
}

function nodeToSearchEntry(node, langUpper, breadcrumbPath) {
    if (!node || node.id == null) return null;
    const t = node.type;
    if (t !== 'leaf' && t !== 'exam' && t !== 'branch' && t !== 'root') return null;
    return {
        id: String(node.id),
        n: node.name != null ? String(node.name) : '',
        t,
        i: node.icon != null ? String(node.icon) : '',
        d: node.description != null ? String(node.description) : '',
        p: breadcrumbPath || (node.path != null ? String(node.path) : ''),
        l: langUpper,
        c: !!node.isCertifiable
    };
}

/**
 * @param {object} root
 * @param {string} langUpper
 * @returns {object[]}
 */
export function flattenTreeSearchEntries(root, langUpper) {
    const out = [];
    const seen = new WeakSet();
    const walk = (node, pathParts) => {
        if (!node || typeof node !== 'object') return;
        if (seen.has(node)) return;
        seen.add(node);
        const parts =
            node.type === 'root'
                ? pathParts
                : [...pathParts, node.name != null ? String(node.name) : ''];
        const crumb = parts.filter(Boolean).join(' / ');
        const entry = nodeToSearchEntry(node, langUpper, node.path != null ? String(node.path) : crumb);
        if (entry) out.push(entry);
        if (node.children && Array.isArray(node.children)) {
            for (const c of node.children) walk(c, parts);
        }
    };
    walk(root, []);
    return out;
}

/**
 * Same as `flattenTreeSearchEntries` but adds `sb` (body snippet) on leaves/exams with content.
 */
export function flattenTreeSearchEntriesWithLessonBody(root, langUpper) {
    const out = [];
    const seen = new WeakSet();
    const walk = (node, pathParts) => {
        if (!node || typeof node !== 'object') return;
        if (seen.has(node)) return;
        seen.add(node);
        const parts =
            node.type === 'root'
                ? pathParts
                : [...pathParts, node.name != null ? String(node.name) : ''];
        const crumb = parts.filter(Boolean).join(' / ');
        const entry = nodeToSearchEntry(node, langUpper, node.path != null ? String(node.path) : crumb);
        if (entry) {
            if (
                (node.type === 'leaf' || node.type === 'exam') &&
                typeof node.content === 'string' &&
                node.content.length > 0
            ) {
                const sb = lessonRawToSearchPlain(node.content);
                if (sb) entry.sb = sb;
            }
            out.push(entry);
        }
        if (node.children && Array.isArray(node.children)) {
            for (const c of node.children) walk(c, parts);
        }
    };
    walk(root, []);
    return out;
}

/**
 * @param {object} entry, { id, n, t, i, d, p, l, c }
 * @param {Record<string, object[]>} shardMap, mutado
 */
function addEntryToSearchShards(entry, shardMap) {
    const body = entry.sb || entry.b || '';
    const text = `${entry.n || ''} ${entry.d || ''} ${entry.p || ''} ${body}`;
    const words = tokenizeForSearch(text);
    const prefixes = new Set();
    for (const w of words) {
        if (w.length >= 2) prefixes.add(w.slice(0, 2));
    }
    const titleClean = TreeUtils.cleanString(entry.n || '');
    if (titleClean.length >= 2) {
        prefixes.add(titleClean.slice(0, 2));
    }
    const lang = entry.l || 'EN';
    for (const prefix of prefixes) {
        const key = `${lang}_${prefix}`;
        if (!shardMap[key]) shardMap[key] = [];
        shardMap[key].push({
            id: entry.id,
            n: entry.n,
            t: entry.t,
            i: entry.i,
            d: entry.d,
            p: entry.p,
            l: entry.l,
            c: entry.c,
            ...(body ? { sb: body } : {})
        });
    }
}

/**
 * @param {object[]} entries
 * @returns {Record<string, object[]>}
 */
export function buildShardMapFromEntries(entries) {
    const shardMap = {};
    for (const e of entries) {
        addEntryToSearchShards(e, shardMap);
    }
    return shardMap;
}

/**
 * Fusiona dos listas de entradas por `id` (gana `overlay` sobre `base`).
 * @param {object[]} base
 * @param {object[]} overlay
 */
export function mergeSearchEntriesById(base, overlay) {
    const map = new Map();
    for (const item of base || []) {
        if (item && item.id != null) map.set(String(item.id), normalizeShardItem(item));
    }
    for (const item of overlay || []) {
        if (item && item.id != null) map.set(String(item.id), normalizeShardItem(item));
    }
    return [...map.values()];
}

function normalizeShardItem(item) {
    return {
        id: String(item.id),
        name: item.n != null ? item.n : item.name,
        type: item.t != null ? item.t : item.type,
        icon: item.i != null ? item.i : item.icon,
        description: item.d != null ? item.d : item.description,
        path: item.p != null ? item.p : item.path,
        lang: item.l != null ? item.l : item.lang,
        isCertifiable: item.c != null ? item.c : item.isCertifiable,
        searchBody: item.sb != null ? item.sb : item.searchBody
    };
}

/** Clave de almacenamiento IndexedDB: un bucket por fuente activa. */
export function computeTreeStorageKey(sourceId) {
    return String(sourceId);
}
