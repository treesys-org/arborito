/**
 * Loads UI locale packs from `locales/<lang>/pack.json` (one request) or modular namespaces.
 */

import { normalizeAppLangCode } from './i18n.js';

/** @type {Map<string, object>} */
const _packCache = new Map();

/** @type {Map<string, Promise<object>>} */
const _packInflight = new Map();

/** @type {Promise<{ version: number, namespaces: string[] }> | null} */
let _manifestPromise = null;

function looksLikeJsonObject(text) {
    const s = String(text || '').trimStart();
    return s.startsWith('{') || s.startsWith('[');
}

/**
 * Candidate URLs for a locale resource path (e.g. `en/sage.json`, `manifest.json`).
 * @param {string} resourcePath path under `locales/`
 */
function localeResourceCandidateUrls(resourcePath) {
    const rel = String(resourcePath || '').replace(/^\/+/, '');
    /** @type {string[]} */
    const hrefs = [];

    try {
        if (typeof document !== 'undefined' && document.baseURI) {
            hrefs.push(new URL(`locales/${rel}`, document.baseURI).href);
        }
    } catch {
        /* noop */
    }

    try {
        if (typeof window !== 'undefined' && window.location && window.location.href) {
            const u = new URL(window.location.href);
            u.hash = '';
            u.search = '';
            const path = u.pathname.endsWith('/') ? u.pathname : u.pathname.replace(/\/[^/]+$/, '/');
            hrefs.push(`${u.origin}${path}locales/${rel}`);
        }
    } catch {
        /* noop */
    }

    try {
        const base = typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL;
        if (base && typeof window !== 'undefined' && window.location?.origin) {
            hrefs.push(new URL(`locales/${rel}`, new URL(base, window.location.origin + '/')).href);
        }
    } catch {
        /* noop */
    }

    // Do NOT use `new URL(..., import.meta.url)` here — Vite rewrites that into
    // `/locales/*.json?import&url` module loads, which breaks runtime fetch().

    return [...new Set(hrefs)];
}

/**
 * @param {string} resourcePath
 * @returns {Promise<object>}
 */
async function fetchLocaleJson(resourcePath) {
    const urls = localeResourceCandidateUrls(resourcePath);
    let lastErr = null;

    for (const href of urls) {
        try {
            const ac = new AbortController();
            const timer = setTimeout(() => ac.abort(), 8000);
            const res = await fetch(href, {
                cache: 'no-cache',
                credentials: 'same-origin',
                signal: ac.signal,
            });
            clearTimeout(timer);
            if (!res.ok) throw new Error(`${res.status} ${res.statusText}`.trim());

            const text = await res.text();
            if (!looksLikeJsonObject(text)) throw new Error(`not JSON (${href})`);

            const data = JSON.parse(text);
            if (!data || typeof data !== 'object') throw new Error(`invalid JSON (${href})`);
            return data;
        } catch (e) {
            lastErr = e;
        }
    }

    const err = new Error(
        `[Arborito] Could not load locales/${resourcePath}. Tried: ${urls.join(' | ')} — ${(lastErr && lastErr.message) || lastErr}`,
    );
    err.cause = lastErr;
    throw err;
}

/**
 * @returns {Promise<{ version: number, namespaces: string[] }>}
 */
async function loadLocaleManifest() {
    if (!_manifestPromise) {
        _manifestPromise = fetchLocaleJson('manifest.json').then((data) => {
            if (!data || !Array.isArray(data.namespaces) || data.namespaces.length === 0) {
                throw new Error('[Arborito] locales/manifest.json is missing or has no namespaces');
            }
            return {
                version: Number(data.version) || 1,
                namespaces: data.namespaces.map((n) => String(n)),
            };
        });
    }
    return _manifestPromise;
}

/**
 * @param {string} lowerCode e.g. "en"
 * @param {string[]} namespaces
 * @returns {Promise<object>}
 */
async function fetchModularLocalePack(lowerCode, namespaces) {
    const lc = String(lowerCode || 'en').trim().toLowerCase();
    /** @type {Record<string, unknown>} */
    const merged = {};
    const seen = new Set();

    const parts = await Promise.all(
        namespaces.map(async (ns) => {
            const rel = `${lc}/${ns}.json`;
            try {
                const part = await fetchLocaleJson(rel);
                return { rel, part };
            } catch (e) {
                console.warn(`[Arborito] locale namespace skipped: ${rel}`, e);
                return { rel, part: null };
            }
        }),
    );

    for (const { rel, part } of parts) {
        if (!part || typeof part !== 'object') continue;
        for (const [key, value] of Object.entries(part)) {
            if (seen.has(key)) {
                console.warn(`[Arborito] duplicate locale key "${key}" in ${rel} (keeping first)`);
                continue;
            }
            seen.add(key);
            merged[key] = value;
        }
    }

    if (!Object.keys(merged).length) {
        throw new Error(`[Arborito] locale pack empty for ${lc}`);
    }

    return merged;
}

/** One HTTP request — includes tour, sources, and all UI strings. */
async function fetchMonolithicLocalePack(lowerCode) {
    return fetchLocaleJson(`${String(lowerCode || 'en').trim().toLowerCase()}/pack.json`);
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
    if (!opts.bypassCache && _packInflight.has(norm)) {
        return _packInflight.get(norm);
    }

    const load = async () => {
        try {
            const pack = await fetchMonolithicLocalePack(lower);
            _packCache.set(norm, pack);
            return pack;
        } catch (e) {
            console.warn('[Arborito] monolithic locale pack failed, using modular manifest', e);
            const manifest = await loadLocaleManifest();
            const pack = await fetchModularLocalePack(lower, manifest.namespaces);
            _packCache.set(norm, pack);
            return pack;
        }
    };

    const p = load();
    if (!opts.bypassCache) {
        _packInflight.set(norm, p);
    }
    try {
        return await p;
    } finally {
        if (!opts.bypassCache) {
            _packInflight.delete(norm);
        }
    }
}

/** Warm the locale cache in parallel with app JS — no await needed. */
export function prefetchLocalePack(langCode) {
    void fetchLocalePack(langCode).catch(() => {});
}
