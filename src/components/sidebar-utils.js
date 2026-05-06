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

/**
 * Arborito “arborito” mark: happy pixel tree (SVG).
 * Stays crisp at small sizes because it's built from rectangles.
 */
export function iconArboritoPixelSvg({ className = 'arborito-icon-mark', size = 22 } = {}) {
    const cls = escSidebarHtml(className);
    const px = (x, y, fill) => `<rect x="${x}" y="${y}" width="2" height="2" rx="0.2" fill="${fill}"/>`;
    // 24x24 viewBox, pixel grid = 2x2 squares.
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" class="${cls}" aria-hidden="true" focusable="false" shape-rendering="crispEdges">
      <rect x="0" y="0" width="24" height="24" fill="none"/>
      <!-- canopy -->
      ${px(8, 4, '#22c55e')}${px(10, 4, '#16a34a')}${px(12, 4, '#22c55e')}
      ${px(6, 6, '#22c55e')}${px(8, 6, '#16a34a')}${px(10, 6, '#22c55e')}${px(12, 6, '#16a34a')}${px(14, 6, '#22c55e')}
      ${px(6, 8, '#16a34a')}${px(8, 8, '#22c55e')}${px(10, 8, '#16a34a')}${px(12, 8, '#22c55e')}${px(14, 8, '#16a34a')}
      ${px(8, 10, '#22c55e')}${px(10, 10, '#16a34a')}${px(12, 10, '#22c55e')}
      <!-- face -->
      ${px(9, 7, '#0f172a')}${px(13, 7, '#0f172a')}
      ${px(10, 9, '#0f172a')}${px(12, 9, '#0f172a')}
      <!-- trunk -->
      ${px(11, 12, '#a16207')}${px(11, 14, '#92400e')}${px(11, 16, '#a16207')}
      ${px(9, 16, '#b45309')}${px(13, 16, '#b45309')}
      <!-- ground sparkle -->
      ${px(4, 18, '#86efac')}${px(18, 18, '#86efac')}
    </svg>`;
}
