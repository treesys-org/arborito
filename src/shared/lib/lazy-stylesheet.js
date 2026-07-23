/** Idempotent deferred feature CSS, Vite code-splits each lazy sheet. */
import { ensureModalChunk } from '../../app/modal-chunk-loaders.js';

const loaded = new Set();

/** @type {Record<string, () => Promise<unknown>>} */
const LAZY_CSS_MODULES = {
    'arborito-css-sage-guide': () => import('../../features/learning/styles/sage-guide.css'),
    'arborito-css-editor': () => import('../../features/editor/styles/index.css'),
    'arborito-css-construction-graph': () =>
        import('../../features/tree-graph/styles/construction-graph.css'),
    'arborito-css-product-tour': () => import('../../features/tour/styles/product-tour.css'),
    'arborito-css-sources': () => import('../../features/sources/styles/sources.css'),
};

export function ensureLazyStylesheet(id, _href) {
    if (typeof document === 'undefined') return;
    if (loaded.has(id)) return;
    const load = LAZY_CSS_MODULES[id];
    if (load) {
        loaded.add(id);
        void load();
        return;
    }
    loaded.add(id);
}

/** @param {Array<[string, string]>} entries `[id, href]` pairs */
export function ensureLazyStylesheets(entries) {
    for (const [id, href] of entries) ensureLazyStylesheet(id, href);
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
    ensureLazyStylesheet('arborito-css-editor');
    ensureLazyStylesheet('arborito-css-construction-graph');
}

/** Sage guide dock/header chrome (idempotent fallback for late callers). */
export function ensureSageGuideStyles() {
    ensureLazyStylesheet('arborito-css-sage-guide');
}

/** Product tour (lazy, not in main.css). */
export function ensureDeferredProductTourStyles() {
    ensureLazyStylesheet('arborito-css-product-tour');
}

/** Sources modal stylesheets (loaded with the sources chunk). */
export function ensureDeferredSourcesStyles() {
    ensureLazyStylesheet('arborito-css-sources');
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
