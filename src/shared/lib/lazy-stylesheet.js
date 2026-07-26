/** Idempotent deferred feature CSS, Vite code-splits each lazy sheet. */
import { ensureModalChunk } from '../../app/modal-chunk-loaders.js';

/** @type {Map<string, Promise<void>>} */
const loaded = new Map();

/** @type {Record<string, () => Promise<unknown>>} */
const LAZY_CSS_MODULES = {
    'arborito-css-sage-guide': () => import('../../features/learning/styles/sage-guide.css'),
    'arborito-css-editor': () => import('../../features/editor/styles/index.css'),
    'arborito-css-construction-graph': () =>
        import('../../features/tree-graph/styles/construction-graph.css'),
    'arborito-css-product-tour': () => import('../../features/tour/styles/product-tour.css'),
    'arborito-css-sources': () => import('../../features/sources/styles/sources.css'),
};

/**
 * @param {string} id
 * @returns {Promise<void>}
 */
export function ensureLazyStylesheet(id, _href) {
    if (typeof document === 'undefined') return Promise.resolve();
    const existing = loaded.get(id);
    if (existing) return existing;
    const load = LAZY_CSS_MODULES[id];
    if (!load) {
        const done = Promise.resolve();
        loaded.set(id, done);
        return done;
    }
    const pending = Promise.resolve(load())
        .then(() => undefined)
        .catch((e) => {
            loaded.delete(id);
            console.warn('[Arborito] lazy stylesheet failed', id, e);
        });
    loaded.set(id, pending);
    return pending;
}

/** @param {Array<[string, string]>} entries `[id, href]` pairs */
export function ensureLazyStylesheets(entries) {
    for (const [id, href] of entries) void ensureLazyStylesheet(id, href);
}

/**
 * Shell styles loaded early or on idle, Sage guide headbar, construction dock.
 */
export const SHELL_BOOT_STYLESHEET_ENTRIES = [
    ['arborito-css-sage-guide'],
    ['arborito-css-editor'],
];

/** Construction panel + mobile construction graph chrome (idempotent fallback). */
export function ensureDeferredConstructionStyles() {
    return Promise.all([
        ensureLazyStylesheet('arborito-css-editor'),
        ensureLazyStylesheet('arborito-css-construction-graph'),
    ]).then(() => undefined);
}

/** Sage guide dock/header chrome (idempotent fallback for late callers). */
export function ensureSageGuideStyles() {
    return ensureLazyStylesheet('arborito-css-sage-guide');
}

/** Product tour CSS — await before showing the tour (avoids unstyled shade stack). */
export function ensureDeferredProductTourStyles() {
    return ensureLazyStylesheet('arborito-css-product-tour');
}

/** Sources modal stylesheets (loaded with the sources chunk). */
export function ensureDeferredSourcesStyles() {
    return ensureLazyStylesheet('arborito-css-sources');
}

/** Prefetch sources modal JS + CSS (caller schedules idle timing). */
export function prefetchSourcesModalChunk() {
    if (typeof window === 'undefined') return;
    ensureDeferredSourcesStyles();
    void import('../../features/tree-graph/api/tree-growing-overlay.js');
    void ensureModalChunk('sources');
}

/** Ensure Logros embed / viewMode chunk is defined (More menu drills synchronously). */
export async function ensureCertificatesModalChunk() {
    await ensureModalChunk('certificates');
}

export function prefetchCertificatesModalChunk() {
    void ensureModalChunk('certificates');
}

/** About is eager (bundled), no chunk fetch needed. Kept for call-site compatibility. */
export function prefetchAboutModalChunk() {}
