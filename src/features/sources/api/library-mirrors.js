/**
 * Pass-through helpers for HTTPS manifest discovery and fetch alternates.
 * (No bundled third-party mirror lists.)
 */

/** Canonical data.json when the active URL points at a release under /releases/. */
export function resolveEditionManifestUrl(sourceUrl) {
    const u = String(sourceUrl || '').trim();
    if (!u) return u;
    const lower = u.toLowerCase();
    const relIdx = lower.indexOf('/releases/');
    if (relIdx !== -1) {
        const root = u.slice(0, relIdx);
        return root.endsWith('/') ? `${root}data.json` : `${root}/data.json`;
    }
    return u;
}

export function getManifestDiscoveryRoots(sourceUrl) {
    if (!sourceUrl) return [];
    const baseHref =
        typeof window !== 'undefined' ? window.location.href : 'https://localhost/';
    try {
        return [new URL(sourceUrl, baseHref).href];
    } catch {
        return [sourceUrl];
    }
}

export function expandLibraryHttpsAlternates(url) {
    if (!url) return [url];
    return [url];
}
