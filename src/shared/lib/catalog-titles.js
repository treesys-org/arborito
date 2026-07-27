/**
 * Catalog titles per curriculum language (`meta.titles` / directory `titles`).
 */

import { normalizeAppLangCode } from '../../core/i18n.js';

/**
 * @param {unknown} titles
 * @returns {Record<string, string>}
 */
export function normalizeTitlesMap(titles) {
    if (!titles || typeof titles !== 'object' || Array.isArray(titles)) return {};
    /** @type {Record<string, string>} */
    const out = {};
    for (const [k, v] of Object.entries(titles)) {
        const code = String(k || '')
            .trim()
            .toUpperCase();
        const t = String(v || '').trim();
        if (code && t) out[code] = t;
    }
    return out;
}

/**
 * @param {{ titles?: unknown }|null|undefined} meta
 * @returns {Record<string, string>}
 */
export function resolveManifestTitles(meta) {
    return normalizeTitlesMap(meta?.titles);
}

/**
 * @param {{ descriptions?: unknown }|null|undefined} meta
 * @returns {Record<string, string>}
 */
export function resolveManifestDescriptions(meta) {
    return normalizeTitlesMap(meta?.descriptions);
}

/**
 * @param {Record<string, string>} titles
 * @param {string} [lang]
 * @param {string} [fallback]
 */
export function pickTitleForLang(titles, lang, fallback = '') {
    const map = normalizeTitlesMap(titles);
    const raw = String(lang || '').trim();
    const code = raw ? normalizeAppLangCode(raw) : '';
    if (code && map[code]) return map[code];
    if (raw) {
        const upper = raw.toUpperCase();
        if (map[upper]) return map[upper];
    }
    const values = Object.values(map);
    if (values.length) return values[0];
    return String(fallback || '').trim();
}

/**
 * Forest / Discover display title for a directory row.
 * @param {{ title?: string, titles?: unknown }|null|undefined} row
 * @param {string} [uiLang]
 */
export function resolveDirectoryRowTitle(row, uiLang) {
    const fromMap = pickTitleForLang(row?.titles, uiLang, '');
    if (fromMap) return fromMap;
    const title = String(row?.title || '').trim();
    return title || 'Arborito';
}

/**
 * Build `titles` from in-memory tree language roots.
 * @param {{ languages?: Record<string, { name?: string }> }|null|undefined} tree
 * @returns {Record<string, string>}
 */
export function titlesFromTreeLanguages(tree) {
    const langs = tree?.languages && typeof tree.languages === 'object' ? tree.languages : {};
    /** @type {Record<string, string>} */
    const out = {};
    for (const [code, root] of Object.entries(langs)) {
        const n = String(root?.name || '').trim();
        const key = String(code || '')
            .trim()
            .toUpperCase();
        if (key && n) out[key] = n;
    }
    return out;
}

/** Built-in private starter blurbs that must never look like a public course summary. */
const PLACEHOLDER_CATALOG_DESCRIPTIONS = new Set([
    'mi jardín privado',
    'my private garden',
]);

/**
 * True when `text` is empty or the old plantBranch defaultGardenName placeholder.
 * Used for **network** Discover / installed listings only — local garden rows may
 * still show “Mi Jardín Privado” as a private starter blurb.
 * @param {unknown} text
 * @param {{ defaultGardenName?: string }|null|undefined} [ui]
 */
export function isPlaceholderCatalogDescription(text, ui) {
    const t = String(text || '').trim();
    if (!t) return true;
    const lower = t.toLowerCase();
    if (PLACEHOLDER_CATALOG_DESCRIPTIONS.has(lower)) return true;
    const fromUi = String(ui?.defaultGardenName || '').trim().toLowerCase();
    return !!(fromUi && lower === fromUi);
}

/**
 * Directory / row description for display (skips placeholder garden blurbs).
 * @param {{ descriptions?: unknown, description?: unknown, listDescription?: unknown }|null|undefined} row
 * @param {string} lang
 * @param {{ defaultGardenName?: string }|null|undefined} [ui]
 */
export function resolveCatalogDescription(row, lang, ui) {
    const raw =
        pickTitleForLang(row?.descriptions, lang, '') ||
        String(row?.listDescription || row?.description || '').trim();
    return isPlaceholderCatalogDescription(raw, ui) ? '' : raw;
}

/**
 * Descriptions map from language roots (when roots carry description).
 * @param {{ languages?: Record<string, { description?: string }> }|null|undefined} tree
 * @returns {Record<string, string>}
 */
export function descriptionsFromTreeLanguages(tree) {
    const langs = tree?.languages && typeof tree.languages === 'object' ? tree.languages : {};
    /** @type {Record<string, string>} */
    const out = {};
    for (const [code, root] of Object.entries(langs)) {
        const n = String(root?.description || '').trim();
        const key = String(code || '')
            .trim()
            .toUpperCase();
        if (key && n) out[key] = n;
    }
    return out;
}

/**
 * Join all title strings for search / trigram indexing.
 * @param {{ title?: string, titles?: unknown }|null|undefined} row
 */
export function catalogTitlesSearchBlob(row) {
    const parts = [String(row?.title || '').trim()];
    for (const t of Object.values(normalizeTitlesMap(row?.titles))) {
        if (t && !parts.includes(t)) parts.push(t);
    }
    return parts.filter(Boolean).join(' ');
}

/**
 * Placeholder names used when a share code / pub / branch id is planted before the
 * bundle title is known. Forest must replace these once the course loads.
 * @param {unknown} name
 */
export function isPlaceholderCommunitySourceName(name) {
    const n = String(name || '').trim();
    if (!n) return true;
    if (/^Code\s*#?\s*/i.test(n)) return true;
    if (/^Public\s*[·•]/i.test(n)) return true;
    if (/^(brn|tre)-/i.test(n)) return true;
    return false;
}

/**
 * Best display title for a loaded arborito / arborito-tree bundle (or raw tree).
 * @param {object|null|undefined} bundleOrTree
 * @param {string} [uiLang]
 * @returns {string}
 */
export function resolveLoadedBundleDisplayTitle(bundleOrTree, uiLang) {
    if (!bundleOrTree || typeof bundleOrTree !== 'object') return '';
    const isBundle =
        bundleOrTree.format === 'arborito-bundle' ||
        bundleOrTree.format === 'arborito-tree' ||
        (bundleOrTree.meta && bundleOrTree.tree);
    const meta = isBundle ? bundleOrTree.meta || {} : {};
    const tree = isBundle ? bundleOrTree.tree || null : bundleOrTree;
    const fromMap = pickTitleForLang(
        meta.titles || titlesFromTreeLanguages(tree),
        uiLang,
        ''
    );
    if (fromMap && !isPlaceholderCommunitySourceName(fromMap)) return fromMap;
    const metaTitle = String(meta.title || '').trim();
    if (metaTitle && !isPlaceholderCommunitySourceName(metaTitle)) return metaTitle;
    const universe = String(tree?.universeName || '').trim();
    if (universe && !isPlaceholderCommunitySourceName(universe)) return universe;
    const fromLangs = pickTitleForLang(titlesFromTreeLanguages(tree), uiLang, '');
    if (fromLangs && !isPlaceholderCommunitySourceName(fromLangs)) return fromLangs;
    return '';
}
