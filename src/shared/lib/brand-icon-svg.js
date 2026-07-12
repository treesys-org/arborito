import { BRAND_ICON_G_TRANSFORM, BRAND_ICON_PATHS, BRAND_ICON_VIEWBOX } from './brand-icon-paths.js';

/**
 * @param {keyof typeof BRAND_ICON_PATHS} brand
 * @param {{ size?: number, className?: string }} [opts]
 */
export function brandIconSvgHtml(brand, { size = 24, className = '' } = {}) {
    const d = BRAND_ICON_PATHS[brand];
    if (!d) return '';
    const viewBox = BRAND_ICON_VIEWBOX[brand] || '0 0 24 24';
    const gTransform = BRAND_ICON_G_TRANSFORM[brand];
    const cls = ['arborito-brand-icon', className].filter(Boolean).join(' ');
    const pathHtml = `<path fill="currentColor" d="${d}"/>`;
    const inner = gTransform ? `<g transform="${gTransform}">${pathHtml}</g>` : pathHtml;
    return `<svg class="${cls}" width="${size}" height="${size}" viewBox="${viewBox}" aria-hidden="true" focusable="false">${inner}</svg>`;
}
