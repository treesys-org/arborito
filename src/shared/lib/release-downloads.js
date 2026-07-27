/** GitHub Releases + Linux Flatpak remote URLs for download UI / app update. */
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
 * Platform rows for the web download vignette.
 * Artifact names follow electron-builder output (see scripts/release-build.mjs).
 * @param {string} [version], from package.json / ARBORITO_BUILD_ID when available
 */
export function getReleaseDownloadPlatforms(version = '0.1.1-alpha') {
    const v = String(version || '0.1.1-alpha').replace(/^v/i, '');
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
