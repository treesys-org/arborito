/**
 * Flatpak runtime pins for electron-builder — keep in sync with package.json `build.flatpak`.
 * Bump when Freedesktop marks a branch EOL (see https://docs.flatpak.org/).
 */
export const FLATPAK_RUNTIME_VERSION = '24.08';

export const FLATPAK_RUNTIME_REFS = [
    `org.freedesktop.Platform//${FLATPAK_RUNTIME_VERSION}`,
    `org.freedesktop.Sdk//${FLATPAK_RUNTIME_VERSION}`,
    `org.electronjs.Electron2.BaseApp//${FLATPAK_RUNTIME_VERSION}`,
];
