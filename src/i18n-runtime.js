/**
 * Loads UI locale packs (`locales/*.json`) — single entry point for the app.
 * Avoids relying on one URL strategy (`baseURI` vs `import.meta` differ by host / Electron).
 */

import { normalizeAppLangCode } from './i18n.js';

/** @type {Map<string, object>} */
const _packCache = new Map();

function looksLikeJsonObject(text) {
    const s = String(text || '').trimStart();
    return s.startsWith('{') || s.startsWith('[');
}

/**
 * Lista ordenada de URLs candidatas para `locales/<code>.json`.
 * @param {string} lowerCode e.g. "en", "es"
 */
export function localePackCandidateUrls(lowerCode) {
    const lc = String(lowerCode || 'en').trim().toLowerCase();
    /** @type {string[]} */
    const hrefs = [];

    // 1) Relative to this module (…/src/i18n-runtime.js → …/locales/) — stable for file:// and typical http layouts.
    try {
        hrefs.push(new URL(`../locales/${lc}.json`, import.meta.url).href);
    } catch {
        /* noop */
    }

    // 2) Next to the document (`index.html` with sibling `locales/`).
    try {
        if (typeof document !== 'undefined' && document.baseURI) {
            hrefs.push(new URL(`locales/${lc}.json`, document.baseURI).href);
        }
    } catch {
        /* noop */
    }

    // 3) Current page directory (strip hash/query).
    try {
        if (typeof window !== 'undefined' && (window.location && window.location.href)) {
            const u = new URL(window.location.href);
            u.hash = '';
            u.search = '';
            const path = u.pathname.endsWith('/') ? u.pathname : u.pathname.replace(/\/[^/]+$/, '/');
            hrefs.push(`${u.origin}${path}locales/${lc}.json`);
        }
    } catch {
        /* noop */
    }

    return [...new Set(hrefs)];
}

/**
 * Download and parse a pack; cached by normalized language code (EN/ES).
 * @param {string} langCode
 * @param {{ bypassCache?: boolean }} [opts]
 */
export async function fetchLocalePack(langCode, opts = {}) {
    const norm = normalizeAppLangCode(langCode);
    const lower = norm.toLowerCase();
    if (!opts.bypassCache && _packCache.has(norm)) {
        return _packCache.get(norm);
    }

    const urls = localePackCandidateUrls(lower);
    let lastErr = null;

    for (const href of urls) {
        try {
            const res = await fetch(href, { cache: 'no-cache', credentials: 'same-origin' });
            if (!res.ok) throw new Error(`${res.status} ${res.statusText}`.trim());

            const text = await res.text();
            if (!looksLikeJsonObject(text)) {
                throw new Error(`not JSON (${href})`);
            }
            const data = JSON.parse(text);
            if (!data || typeof data !== 'object') throw new Error(`invalid pack (${href})`);

            _packCache.set(norm, data);
            return data;
        } catch (e) {
            lastErr = e;
        }
    }

    const err = new Error(
        `[Arborito] Could not load locales/${lower}.json (${norm}). Tried: ${urls.join(' | ')} — ${(lastErr && lastErr.message) || lastErr}`
    );
    err.cause = lastErr;
    throw err;
}

/** For tests or after hot-reloading JSON in dev. */
export function clearLocalePackCache() {
    _packCache.clear();
}
