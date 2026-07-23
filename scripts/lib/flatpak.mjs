/**
 * Flatpak / AppStream constants and XML builders.
 * Keep finishArgs in sync with package.json `build.flatpak.finishArgs`.
 */

/** Sandbox entrypoint — Electron2.BaseApp provides /app/bin/electron-wrapper. */
export const FLATPAK_COMMAND = 'electron-wrapper';

/** In-app paths (under /app = builddir/files/). */
export const FLATPAK_ICON_REL = 'share/icons/hicolor';
export const FLATPAK_ICON_SIZES = [48, 128, 512];

/** Host-visible paths after install (symlinks under flatpak/exports/share/). */
export const FLATPAK_EXPORT_ICON_REL = 'share/icons/hicolor';

/** finishArgs for flatpak build-finish. */
export const FLATPAK_FINISH_ARGS = [
    '--share=network',
    '--share=ipc',
    '--talk-name=org.freedesktop.portal.Desktop',
    '--talk-name=org.freedesktop.portal.OpenURI',
    '--talk-name=org.freedesktop.portal.Camera',
    '--socket=fallback-x11',
    '--socket=x11',
    '--socket=wayland',
    '--socket=pulseaudio',
    '--device=dri',
    '--device=shm',
    /* PipeWire camera/mic for Chromium getUserMedia inside the sandbox. */
    '--filesystem=xdg-run/pipewire-0',
    '--filesystem=home',
];

export const FLATPAK_RUNTIME = 'org.freedesktop.Platform';
export const FLATPAK_RUNTIME_VERSION = '24.08';
export const FLATPAK_SDK = 'org.freedesktop.Sdk';
export const FLATPAK_BASE = 'org.electronjs.Electron2.BaseApp';
export const FLATPAK_BASE_VERSION = '24.08';

export const FLATPAK_RUNTIME_REFS = [
    `org.freedesktop.Platform//${FLATPAK_RUNTIME_VERSION}`,
    `org.freedesktop.Sdk//${FLATPAK_RUNTIME_VERSION}`,
    `org.electronjs.Electron2.BaseApp//${FLATPAK_RUNTIME_VERSION}`,
];

export const APP_ID = 'org.treesys.arborito';

/** AppStream <summary> — short tagline under the app name (~100 chars max). */
export const SUMMARY_EN =
    'Free, open-source app to learn any subject as an interactive lesson tree';

/** Freedesktop Comment — also set in package.json build.linux.desktop.entry. */
export const DESKTOP_COMMENT =
    'Free open-source education app: visual lesson maps, cuestionarios, Memory Garden, optional Arcade, local-first progress: no subscription or ads.';

/** Flatpak/Electron launcher command inside the sandbox. */
export const DESKTOP_EXEC = 'electron-wrapper %U';

/** Public HTTPS URLs for AppStream <image> (English files in demo-media on Pages). */
export const SCREENSHOTS_URL_BASE = 'https://arborito.org/demo-media';

/** electron-builder linux.description (plain text fallback). */
export const LINUX_DESCRIPTION =
    'Arborito is a free, open-source education app from Treesys. Explore interactive lesson maps, plant your own courses, use spaced repetition (Memory Garden), optional minigames, and local-first progress: GPL, no subscription, no ads.';

/** @type {Array<{ file: string, caption: string, default?: boolean }>} */
export const SCREENSHOTS = [
    { file: '02-mapa-claro-en.png', caption: 'Interactive lesson map (light theme)', default: true },
    { file: '03-mapa-oscuro-en.png', caption: 'Lesson map in dark theme' },
    { file: '05-leccion-en.png', caption: 'Lesson reader with outline and cuestionarios' },
    { file: '12-construccion-en.png', caption: 'Construction mode to plant and edit courses' },
    { file: '07-arcade-en.png', caption: 'Lesson Arcade minigames' },
    { file: '08-alonso-en.png', caption: 'Alonso Duel minigame' },
    { file: '11-jardin-en.png', caption: 'Memory Garden spaced repetition' },
    { file: '01-sage-en.png', caption: 'Optional Sage AI assistant (desktop)' },
];

export function buildDescriptionXml() {
    return `  <description>
    <p>
      Arborito is a free, open-source education app from Treesys. It turns any subject into a visual tree of lessons you explore at your own pace: pick a branch, read, quiz yourself, and keep progress on your device without a subscription or mandatory account.
    </p>
    <p>Features in this alpha release:</p>
    <ul>
      <li>Interactive lesson maps with light and dark themes</li>
      <li>Visual editor and Construction mode to plant your own courses</li>
      <li>Memory Garden spaced repetition from your lesson progress</li>
      <li>Optional Lesson Arcade minigames tied to what you are studying</li>
      <li>English and Spanish UI; community translations welcome</li>
      <li>Local-first progress on your device; optional online sync</li>
      <li>Optional Sage AI tutoring and high-quality voice on desktop</li>
    </ul>
    <p>
      Free and open source under GPL v3. Study from community trees, translate lessons, or remix what others published.
    </p>
  </description>`;
}

export function buildScreenshotsXml() {
    const lines = ['  <screenshots>'];
    for (const shot of SCREENSHOTS) {
        const typeAttr = shot.default ? ' type="default"' : '';
        lines.push(`    <screenshot${typeAttr}>`);
        lines.push(`      <image>${SCREENSHOTS_URL_BASE}/${shot.file}</image>`);
        lines.push(`      <caption>${shot.caption}</caption>`);
        lines.push('    </screenshot>');
    }
    lines.push('  </screenshots>');
    return lines.join('\n');
}

export function buildReleaseXml(version, dateIso) {
    return `    <release version="${version}" date="${dateIso}">
      <description>
        <p>Public alpha — interactive lesson maps, Memory Garden, optional Arcade and Sage AI on desktop.</p>
      </description>
    </release>`;
}

/** Full AppStream metainfo (Flathub / GNOME Software layout). */
export function buildMetainfoXml(version, dateIso) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Copyright 2026 Treesys -->
<component type="desktop-application">
  <id>org.treesys.arborito</id>
  <metadata_license>CC0-1.0</metadata_license>
  <project_license>GPL-3.0-or-later</project_license>
  <developer id="org.treesys">
    <name>Treesys</name>
  </developer>

  <name>Arborito</name>
  <icon type="stock">org.treesys.arborito</icon>

  <summary>${SUMMARY_EN}</summary>

  <categories>
    <category>Education</category>
  </categories>

${buildDescriptionXml()}

  <launchable type="desktop-id">org.treesys.arborito.desktop</launchable>

${buildScreenshotsXml()}

  <url type="homepage">https://arborito.org</url>
  <url type="bugtracker">https://github.com/treesys-org/arborito/issues</url>
  <url type="vcs-browser">https://github.com/treesys-org/arborito</url>
  <url type="contribute">https://github.com/treesys-org/arborito/blob/main/CONTRIBUTING.md</url>
  <url type="help">https://github.com/treesys-org/arborito/blob/main/README.md</url>
  <url type="faq">https://treesys.org#faq</url>
  <url type="contact">https://treesys.org</url>
  <url type="donation">https://treesys.org#support</url>
  <update_contact>support@treesys.org</update_contact>

  <content_rating type="oars-1.1">
    <content_attribute id="social-chat">moderate</content_attribute>
  </content_rating>

  <keywords>
    <keyword>education</keyword>
    <keyword>learning</keyword>
    <keyword>lessons</keyword>
    <keyword>curriculum</keyword>
    <keyword>open source</keyword>
    <keyword>local-first</keyword>
    <keyword>spaced repetition</keyword>
    <keyword>quiz</keyword>
  </keywords>

  <releases>
${buildReleaseXml(version, dateIso)}
  </releases>
</component>
`;
}

/** Freedesktop launcher shipped inside the Flatpak. */
export function buildDesktopFile() {
    return `[Desktop Entry]
Type=Application
Version=1.0
Name=Arborito
GenericName=Visual Knowledge Explorer
Comment=${DESKTOP_COMMENT}
Exec=${DESKTOP_EXEC}
Icon=org.treesys.arborito
Categories=Education;
Keywords=arborito;education;learning;lessons;tree;quiz;memory-garden;
StartupWMClass=org.treesys.arborito
Terminal=false
`;
}

/** Relative hicolor icon paths bundled via flatpak.files. */
export const HICOLOR_ICON_FILES = [48, 64, 128, 256, 512].map((size) => ({
    src: `build/icons/hicolor/${size}x${size}/apps/org.treesys.arborito.png`,
    dest: `share/icons/hicolor/${size}x${size}/apps/org.treesys.arborito.png`,
}));
