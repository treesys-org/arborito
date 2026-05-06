/**
 * Minimal HTML escaping for template literals injected via innerHTML.
 * Keep in sync with patterns used across modals (avoid duplicating per-file).
 */
export function escHtml(s) {
    return String(s != null ? s : '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Escape for HTML attribute values (double-quoted). */
export function escAttr(s) {
    return escHtml(s);
}
