/** GitHub Releases + Linux Flatpak remote URLs for download UI / app update. */
import { ARBORITO_APP_VERSION } from '../../core/version.js';

export const GITHUB_REPO = 'https://github.com/treesys-org/arborito';
export const GITHUB_RELEASES = 'https://github.com/treesys-org/arborito/releases';
export const GITHUB_RELEASES_LATEST = 'https://github.com/treesys-org/arborito/releases/latest';
export const GITHUB_RELEASES_LATEST_API =
    'https://api.github.com/repos/treesys-org/arborito/releases/latest';
/** Includes prereleases (alpha tags); `/latest` does not. */
export const GITHUB_RELEASES_LIST_API =
    'https://api.github.com/repos/treesys-org/arborito/releases?per_page=15';
export const YOUTUBE_TREESYS_CHANNEL = 'https://www.youtube.com/@Treesys-org';

/** Hosted OSTree remote + install ref (GitHub Pages under arborito.org). */
export const FLATPAK_REMOTE_BASE = 'https://arborito.org/flatpak';
export const FLATPAK_REPO_URL = `${FLATPAK_REMOTE_BASE}/repo/`;
export const FLATPAK_REF_URL = `${FLATPAK_REMOTE_BASE}/org.treesys.arborito.flatpakref`;
export const FLATPAK_FLATPAKREPO_URL = `${FLATPAK_REMOTE_BASE}/arborito.flatpakrepo`;

/**
 * @param {string} a
 * @param {string} b
 * @returns {number} negative if a<b, 0 if equal, positive if a>b
 */
export function compareSemverLike(a, b) {
    const norm = (s) =>
        String(s || '')
            .trim()
            .replace(/^v/i, '')
            .split(/[-+]/)
            .map((part, idx) => {
                if (idx === 0) {
                    return part.split('.').map((n) => {
                        const x = parseInt(n, 10);
                        return Number.isFinite(x) ? x : 0;
                    });
                }
                return part;
            });
    const [aCore, aPre] = norm(a);
    const [bCore, bPre] = norm(b);
    const len = Math.max((aCore || []).length, (bCore || []).length);
    for (let i = 0; i < len; i++) {
        const av = (aCore || [])[i] || 0;
        const bv = (bCore || [])[i] || 0;
        if (av !== bv) return av - bv;
    }
    if (aPre == null && bPre == null) return 0;
    if (aPre == null) return 1;
    if (bPre == null) return -1;
    return String(aPre).localeCompare(String(bPre));
}

/**
 * Newest published GitHub tag, including alpha prereleases.
 * `/releases/latest` skips prereleases and would serve an older installer.
 * @returns {Promise<string>}
 */
export async function fetchNewestGithubReleaseTag() {
    const headers = {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Arborito',
    };
    const listRes = await fetch(GITHUB_RELEASES_LIST_API, { headers });
    if (!listRes.ok) throw new Error(`HTTP ${listRes.status}`);
    const list = await listRes.json();
    const rows = Array.isArray(list) ? list : [];
    const usable = rows.filter((r) => r && !r.draft && (r.tag_name || r.name));
    if (!usable.length) throw new Error('No GitHub releases found');
    usable.sort((a, b) =>
        compareSemverLike(String(b.tag_name || b.name || ''), String(a.tag_name || a.name || ''))
    );
    return String(usable[0].tag_name || usable[0].name || '').replace(/^v/i, '');
}

/**
 * Platform rows for the web download vignette.
 * Artifact names follow electron-builder output (see scripts/release-build.mjs).
 * @param {string} [version], from package.json / ARBORITO_APP_VERSION when available
 */
export function getReleaseDownloadPlatforms(version = ARBORITO_APP_VERSION) {
    const v = String(version || ARBORITO_APP_VERSION || '').replace(/^v/i, '');
    const base = `${GITHUB_RELEASES}/download/v${v}`;
    return [
        {
            id: 'windows',
            brand: 'windows',
            labelKey: 'downloadPlatformWindows',
            subKey: 'downloadPlatformWindowsSub',
            fallbackLabel: 'Windows',
            fallbackSub: '.exe',
            url: `${base}/Arborito.Setup.${v}.exe`,
        },
        {
            id: 'linux',
            brand: 'linux',
            labelKey: 'downloadPlatformLinux',
            subKey: 'downloadPlatformLinuxSub',
            fallbackLabel: 'Linux',
            fallbackSub: 'Flatpak',
            url: FLATPAK_REF_URL,
        },
        {
            id: 'android',
            brand: 'android',
            labelKey: 'downloadPlatformAndroid',
            subKey: 'downloadPlatformAndroidSub',
            fallbackLabel: 'Android',
            fallbackSub: 'APK',
            url: `${base}/arborito-${v}.apk`,
        },
    ];
}
