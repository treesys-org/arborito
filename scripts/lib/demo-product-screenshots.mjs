/**
 * Single source for product screenshots: demo/arborito-demo/media/*-{en,es}.png
 * Flatpak AppStream + site publish that folder (no parallel screenshots/ tree).
 */

/** @type {Record<string, string>} legacy public alias → demo media stem */
export const PRODUCT_SCREENSHOT_MEDIA_STEM = {
    'graph-light.png': '02-mapa-claro',
    'graph-dark.png': '03-mapa-oscuro',
    'lesson-light.png': '05-leccion',
    'construction.png': '12-construccion',
    'arcade.png': '07-arcade',
    'alonso-duel.png': '08-alonso',
    'memory-garden.png': '11-jardin',
    'sage-ai.png': '01-sage',
};

/** Flatpak AppStream order (English filenames under demo-media/). */
export const PRODUCT_SCREENSHOT_FLATPAK_FILES = [
    '02-mapa-claro-en.png',
    '03-mapa-oscuro-en.png',
    '05-leccion-en.png',
    '12-construccion-en.png',
    '07-arcade-en.png',
    '08-alonso-en.png',
    '11-jardin-en.png',
    '01-sage-en.png',
];

export const DEMO_MEDIA_REL = 'demo/arborito-demo/media';

/** Public HTTPS folder on arborito.org (copied from DEMO_MEDIA_REL on build). */
export const DEMO_MEDIA_URL_BASE = 'https://arborito.org/demo-media';

/**
 * @param {string} productFile e.g. graph-light.png
 * @param {'en'|'es'} lang
 * @returns {string} filename under demo media
 */
export function demoMediaFilename(productFile, lang) {
    const stem = PRODUCT_SCREENSHOT_MEDIA_STEM[productFile];
    if (!stem) return '';
    const code = lang === 'es' ? 'es' : 'en';
    return `${stem}-${code}.png`;
}

/**
 * @param {string} productFile
 * @param {'en'|'es'} lang
 * @returns {string} site-relative path
 */
export function demoMediaSitePath(productFile, lang) {
    const name = demoMediaFilename(productFile, lang);
    return name ? `./demo-media/${name}` : '';
}
