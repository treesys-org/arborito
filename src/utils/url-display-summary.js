/**
 * Resumen legible de una URL para modales (host + ruta acortada); la cadena completa va en detalle colapsable.
 * @param {string | null | undefined} url
 * @returns {{ summary: string, full: string }}
 */
export function urlSummaryForUser(url) {
    const full = String(url || '').trim();
    if (!full) return { summary: '—', full: '' };
    try {
        const u = new URL(full);
        const path = (u.pathname || '/') + (u.search || '');
        const pathShort = path.length > 52 ? `${path.slice(0, 52)}…` : path;
        return { summary: `${u.hostname}${pathShort}`, full };
    } catch {
        if (full.length > 56) return { summary: `${full.slice(0, 56)}…`, full };
        return { summary: full, full };
    }
}
