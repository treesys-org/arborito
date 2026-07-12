import { ARBORITO_LOGO_MARK_PATH } from '../../../shared/ui/arborito-logo-path.js';
import { ARBORITO_ROOT_LOGO_URL } from '../../../shared/ui/arborito-logo-root.js';

export function escSidebarHtml(s) {
    if (s == null) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Outline “language” icon (Heroicons-style), inherits `currentColor`. */
export function iconLanguageSvg({ className = 'arborito-icon-lang', size = 20 } = {}) {
    const cls = escSidebarHtml(className);
    return `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.6" class="${cls}" width="${size}" height="${size}" aria-hidden="true" focusable="false"><path stroke-linecap="round" stroke-linejoin="round" d="m10.5 21 5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 0 1 6-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 0 1-3.827-5.802"/></svg>`;
}

/** Arborito brand mark (monochrome), inline SVG string (no external image fetch). */
export function iconArboritoPixelSvg({ className = 'arborito-icon-mark', size = 22 } = {}) {
    const cls = escSidebarHtml(className);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 105.83334 96.572914" width="${size}" height="${size}" class="${cls}" aria-hidden="true" focusable="false">
      <g transform="translate(-73.554161,-64.690628)"><path fill="currentColor" d="${ARBORITO_LOGO_MARK_PATH}"/></g>
    </svg>`;
}

/** Root knot mark, `build/arborito-root-logo.svg`. */
export function iconArboritoRootSvg({ className = 'arborito-icon-mark arborito-icon-mark--color', size = 22 } = {}) {
    const cls = escSidebarHtml(className);
    const sz = Number.isFinite(size) ? size : 22;
    return `<img src="${ARBORITO_ROOT_LOGO_URL}" width="${sz}" height="${sz}" class="${cls}" alt="" aria-hidden="true" draggable="false" style="display:block;width:100%;height:100%;object-fit:contain;object-position:center bottom"/>`;
}

