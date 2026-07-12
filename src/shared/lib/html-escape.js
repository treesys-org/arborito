/**
 * Minimal HTML escaping for template literals injected via innerHTML.
 * One implementation, one import, do not redefine inline in feature modules.
 */
export function escHtml(s) {
    return String(s != null ? s : '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Escape for HTML attribute values. Handles both double- and single-quoted
 * attributes since some modal templates use either form.
 */
export function escAttr(s) {
    return escHtml(s).replace(/'/g, '&#39;');
}
