/**
 * Product screenshots on arborito.org — same files as demo/arborito-demo/media.
 * Flatpak AppStream uses English (`*-en.png`); the app UI picks en/es.
 */

import {
    PRODUCT_SCREENSHOT_MEDIA_STEM,
    demoMediaSitePath,
} from '../../../scripts/lib/demo-product-screenshots.mjs';

/** Aliases used by gallery / download strip (legacy Flatpak names). */
export const PRODUCT_SCREENSHOT_FILES = Object.keys(PRODUCT_SCREENSHOT_MEDIA_STEM);

/**
 * @param {string} file alias e.g. graph-light.png, or already a media filename
 * @param {string} [lang] EN / ES / en / es
 * @returns {string} site-relative path under ./demo-media/
 */
export function productScreenshotSrc(file, lang = 'en') {
    const name = String(file || '')
        .split(/[/\\]/)
        .pop()
        .trim();
    if (!name) return '';
    const code = String(lang || 'en').toLowerCase().startsWith('es') ? 'es' : 'en';
    if (/-(en|es)\.png$/i.test(name)) {
        const swapped = name.replace(/-(en|es)\.png$/i, `-${code}.png`);
        return `./demo-media/${swapped}`;
    }
    const fromMap = demoMediaSitePath(name, code);
    if (fromMap) return fromMap;
    return `./demo-media/${name}`;
}

/** Flatpak / default public URL (always English media filename). */
export function productScreenshotFlatpakSrc(file) {
    return productScreenshotSrc(file, 'en');
}
