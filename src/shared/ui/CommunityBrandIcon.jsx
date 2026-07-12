import { BRAND_ICON_G_TRANSFORM, BRAND_ICON_PATHS, BRAND_ICON_VIEWBOX } from '../lib/brand-icon-paths.js';

/**
 * @param {{ brand: keyof typeof BRAND_ICON_PATHS, size?: number, className?: string }} props
 */
export function CommunityBrandIcon({ brand, size = 18, className = '' }) {
    const d = BRAND_ICON_PATHS[brand];
    if (!d) return null;
    const viewBox = BRAND_ICON_VIEWBOX[brand] || '0 0 24 24';
    const gTransform = BRAND_ICON_G_TRANSFORM[brand];
    const pathEl = <path fill="currentColor" d={d} />;
    return (
        <svg
            className={`arborito-brand-icon${className ? ` ${className}` : ''}`}
            width={size}
            height={size}
            viewBox={viewBox}
            aria-hidden="true"
            focusable="false"
        >
            {gTransform ? <g transform={gTransform}>{pathEl}</g> : pathEl}
        </svg>
    );
}
