/** GitHub Releases, single source for download links in the web UI. */
export const GITHUB_REPO = 'https://github.com/treesys-org/arborito';
export const GITHUB_RELEASES = 'https://github.com/treesys-org/arborito/releases';
export const GITHUB_RELEASES_LATEST = 'https://github.com/treesys-org/arborito/releases/latest';
export const YOUTUBE_TREESYS_CHANNEL = 'https://www.youtube.com/@Treesys-org';

/**
 * Platform rows for the web download vignette.
 * Artifact names follow electron-builder output (see scripts/release-build.mjs).
 * @param {string} [version], from package.json / ARBORITO_BUILD_ID when available
 */
export function getReleaseDownloadPlatforms(version = '0.1.0-alpha') {
    const v = String(version || '0.1.0-alpha').replace(/^v/i, '');
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
            url: `${base}/Arborito-${v}-x86_64.flatpak`,
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
