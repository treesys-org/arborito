/**
 * Nostr-native global directory search: trigram `t` tags on publish, `#t` filter on query.
 */

/** @param {unknown} e */
export function normalizeCatalogRow(e) {
    if (!e || typeof e !== 'object') return null;
    const ownerPub = String(e.ownerPub || e.pub || '').trim();
    const universeId = String(e.universeId || e.id || '').trim();
    if (!ownerPub || !universeId) return null;
    const title = String(e.title || e.name || 'Arborito').trim() || 'Arborito';
    const shareCode = String(e.shareCode || e.code || '').trim();
    const updatedAt = String(e.updatedAt || e.updated || '').trim();
    const description = String(e.description || '').trim();
    const authorName = String(e.authorName || e.author || '').trim();
    /** @type {Record<string, unknown>} */
    const out = { ownerPub, universeId, title, shareCode, updatedAt };
    if (description) out.description = description;
    if (authorName) out.authorName = authorName;
    if (Array.isArray(e.languages) && e.languages.length) {
        const langs = Array.from(
            new Set(e.languages.map((c) => String(c || '').trim().toUpperCase()).filter(Boolean))
        ).slice(0, 16);
        if (langs.length) out.languages = langs;
    }
    if (Array.isArray(e.recommendedRelays) && e.recommendedRelays.length) {
        out.recommendedRelays = e.recommendedRelays;
    }
    return out;
}

/**
 * @param {string} qRaw
 * @param {{ title?: string, description?: string, authorName?: string }} row
 */
export function catalogRowMatchesQuery(qRaw, row) {
    /* Accent- and case-insensitive: fold both sides with the same NFKD +
     * diacritic-strip pass used for the trigram index so a search for
     * "algebra" matches a tree titled "Álgebra básica". A plain
     * `toLowerCase().includes()` here would miss every accented title. */
    const q = catalogRowSearchText(qRaw);
    if (!q) return true;
    const title = String(row?.title || '');
    const description = String(row?.description || '');
    const authorName = String(row?.authorName || '');
    const hay = catalogRowSearchText(`${title} ${description} ${authorName}`);
    return hay.includes(q);
}

/** @param {string} text */
export function catalogRowSearchText(text) {
    return String(text || '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

/**
 * @param {string} token
 * @returns {string[]}
 */
export function trigramsFromToken(token) {
    const t = catalogRowSearchText(token).replace(/\s+/g, '');
    if (t.length < 3) return t.length ? [t] : [];
    const out = [];
    for (let i = 0; i <= t.length - 3; i++) out.push(t.slice(i, i + 3));
    return out;
}

/**
 * @param {string} q
 * @returns {string[]}
 */
export function trigramsFromQuery(q) {
    const norm = catalogRowSearchText(q);
    if (!norm) return [];
    const tokens = norm.split(/\s+/).filter(Boolean);
    const set = new Set();
    for (const tok of tokens) {
        for (const tri of trigramsFromToken(tok)) set.add(tri);
    }
    if (!set.size && norm.length >= 3) {
        for (const tri of trigramsFromToken(norm)) set.add(tri);
    }
    return Array.from(set);
}

/**
 * @param {{ title?: string, description?: string, authorName?: string }} row
 * @returns {string[]}
 */
export function trigramsFromCatalogRow(row) {
    const text = catalogRowSearchText(
        `${row?.title || ''} ${row?.description || ''} ${row?.authorName || ''}`
    );
    const set = new Set();
    for (const tok of text.split(/\s+/).filter(Boolean)) {
        for (const tri of trigramsFromToken(tok)) set.add(tri);
    }
    return Array.from(set);
}

/** Very common trigrams, deprioritized for relay `#t` queries (still indexed on publish). */
const COMMON_TRIGRAMS = new Set([
    'the', 'and', 'ing', 'ion', 'ent', 'tio', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her', 'was',
    'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'man', 'new', 'now', 'old', 'see', 'two',
    'way', 'who', 'boy', 'did', 'its', 'let', 'put', 'say', 'she', 'too', 'use', 'cur', 'pro', 'con', 'com',
]);

export const DIRECTORY_TRIGRAM_TAG_CAP = 40;

/**
 * Nostr `t` tags for a directory row (publish-time index).
 * @param {{ title?: string, description?: string, authorName?: string }} row
 * @returns {string[]}
 */
export function directoryTrigramTagsForRow(row) {
    const tris = trigramsFromCatalogRow(row).filter((t) => t.length >= 3);
    return tris.slice(0, DIRECTORY_TRIGRAM_TAG_CAP);
}

/**
 * Pick trigrams for relay `#t` search (rarest / most selective first).
 * @param {string[]} tris
 * @returns {string[]}
 */
export function rankTrigramsForSearch(tris) {
    const list = Array.isArray(tris) ? tris.filter((t) => t && t.length >= 3) : [];
    return list.slice().sort((a, b) => {
        const ca = COMMON_TRIGRAMS.has(a) ? 1 : 0;
        const cb = COMMON_TRIGRAMS.has(b) ? 1 : 0;
        if (ca !== cb) return ca - cb;
        return b.length - a.length || a.localeCompare(b);
    });
}

/**
 * @param {string} ownerPub
 * @param {string} universeId
 */
export function directoryRowKey(ownerPub, universeId) {
    return `${String(ownerPub || '').trim()}/${String(universeId || '').trim()}`;
}
