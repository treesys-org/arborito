/** Canonical web app origin for share links when not on a public HTTPS host. */
export const PUBLIC_APP_ORIGIN = 'https://arborito.org';

/**
 * Base URL (origin + trailing slash) for links meant to be shared publicly.
 * Desktop `file://` and local dev use arborito.org; deployed HTTPS keeps the current origin.
 */
export function getPublicShareAppBase() {
    if (typeof window === 'undefined') return `${PUBLIC_APP_ORIGIN}/`;
    const { protocol, hostname, origin, pathname } = window.location;
    if (
        protocol === 'file:' ||
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '[::1]'
    ) {
        return `${PUBLIC_APP_ORIGIN}/`;
    }
    let path = pathname || '/';
    if (path.endsWith('/index.html')) {
        path = path.slice(0, -'/index.html'.length) || '/';
    }
    if (path === '/') return `${origin}/`;
    return path.endsWith('/') ? `${origin}${path}` : `${origin}${path}/`;
}

/** @param {string} suffix Query or path suffix, e.g. `?code=…` */
export function buildPublicShareAppUrl(suffix) {
    const base = getPublicShareAppBase();
    return `${base}${String(suffix || '').replace(/^\//, '')}`;
}
