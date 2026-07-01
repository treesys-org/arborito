/** Canonical modal width tiers — one token per visual family. */
export const MODAL_PANEL_SIZE = Object.freeze({
    XS: 'xs auto-h',
    COMPACT: 'compact auto-h',
    STANDARD: 'standard auto-h',
    CONTENT: 'content auto-h',
    XL: 'xl',
    HUB: 'dock-hub',
    FORUM: 'forum',
    README: 'readme',
    CERTIFICATE: 'certificate',
    CERTS: 'certs',
});

/**
 * Desktop `panelSize` for dock-layout modals; `undefined` on mobile fullbleed.
 * @param {keyof typeof MODAL_PANEL_SIZE | string} tier
 * @param {boolean} [mobile]
 */
export function dockModalPanelSize(tier, mobile = false) {
    if (mobile) return undefined;
    const key = String(tier || '').toUpperCase();
    const mapped = MODAL_PANEL_SIZE[key] ?? MODAL_PANEL_SIZE[tier] ?? tier;
    return mapped || undefined;
}
