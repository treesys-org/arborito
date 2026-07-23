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
