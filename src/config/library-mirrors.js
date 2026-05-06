/**
 * Pass-through helpers for HTTPS manifest discovery and fetch alternates.
 * (No bundled third-party mirror lists.)
 */

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
