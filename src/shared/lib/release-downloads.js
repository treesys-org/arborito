/** GitHub Releases — single source for download links in the web UI. */
export const GITHUB_RELEASES = 'https://github.com/treesys-org/arborito/releases';
export const GITHUB_RELEASES_LATEST = 'https://github.com/treesys-org/arborito/releases/latest';

/**
 * Platform rows for the web download vignette.
 * Artifact names follow electron-builder output (see scripts/release-build.mjs).
 * @param {string} [version] — from package.json / ARBORITO_BUILD_ID when available
 */
export function getReleaseDownloadPlatforms(version = '0.1.0-alpha') {
    const v = String(version || '0.1.0-alpha').replace(/^v/i, '');
    const base = `${GITHUB_RELEASES_LATEST}/download`;
    return [
        {
            id: 'windows',
            emoji: '🪟',
            labelKey: 'downloadPlatformWindows',
            subKey: 'downloadPlatformWindowsSub',
            fallbackLabel: 'Windows',
            fallbackSub: '.exe',
            url: `${base}/Arborito%20Setup%20${v}.exe`,
        },
        {
            id: 'linux',
            emoji: '🐧',
            labelKey: 'downloadPlatformLinux',
            subKey: 'downloadPlatformLinuxSub',
            fallbackLabel: 'Linux',
            fallbackSub: 'Flatpak',
            url: `${base}/Arborito-${v}-x86_64.flatpak`,
        },
        {
            id: 'android',
            emoji: '🤖',
            labelKey: 'downloadPlatformAndroid',
            subKey: 'downloadPlatformAndroidSub',
            fallbackLabel: 'Android',
            fallbackSub: 'APK',
            url: `${base}/arborito-${v}.apk`,
        },
    ];
}
