#!/usr/bin/env node
/**
 * Rasterizes the canonical app logo into packaging assets:
 *   - build/arborito-app-logo.png (source PNG for desktop / store icons)
 *   - build/icon.png (512×512, generated)
 *   - build/installerSidebar.bmp / installerHeader.bmp (NSIS)
 */
import { mkdirSync, existsSync, statSync, writeFileSync, copyFileSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOGO_PNG = join(ROOT, 'build', 'arborito-app-logo.png');
const OUT_ICON = join(ROOT, 'build', 'icon.png');
const OUT_FAVICON = join(ROOT, 'favicon.png');
const OUT_SIDEBAR = join(ROOT, 'build', 'installerSidebar.bmp');
const OUT_HEADER = join(ROOT, 'build', 'installerHeader.bmp');
const HICOLOR_ROOT = join(ROOT, 'build', 'icons', 'hicolor');
const LINUX_ICON_ID = 'org.treesys.arborito';
/** GNOME app grid + Freedesktop icon theme (Flatpak). */
const HICOLOR_SIZES = [512, 256, 128, 64, 48];

const OUTPUTS = [OUT_ICON, OUT_SIDEBAR, OUT_HEADER, OUT_FAVICON];

function logoSource() {
    if (existsSync(LOGO_PNG)) return { path: LOGO_PNG, kind: 'png' };
    console.error('[ensure-build-icon] missing build/arborito-app-logo.png');
    process.exit(1);
}

/** 24-bit BMP (bottom-up), for NSIS installer branding — sharp has no BMP encoder. */
function rgbaToBmp(rgba, width, height) {
    const rowSize = Math.ceil((width * 3) / 4) * 4;
    const pixelDataSize = rowSize * height;
    const fileSize = 54 + pixelDataSize;
    const buf = Buffer.alloc(fileSize);

    buf.write('BM', 0);
    buf.writeUInt32LE(fileSize, 2);
    buf.writeUInt32LE(54, 10);
    buf.writeUInt32LE(40, 14);
    buf.writeInt32LE(width, 18);
    buf.writeInt32LE(height, 22);
    buf.writeUInt16LE(1, 26);
    buf.writeUInt16LE(24, 28);
    buf.writeUInt32LE(pixelDataSize, 34);

    let offset = 54;
    for (let y = height - 1; y >= 0; y--) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            buf[offset++] = rgba[i + 2];
            buf[offset++] = rgba[i + 1];
            buf[offset++] = rgba[i];
        }
        offset += rowSize - width * 3;
    }
    return buf;
}

async function sharpPipelineToBmp(pipeline) {
    const { data, info } = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return rgbaToBmp(data, info.width, info.height);
}

function needsRegenerate() {
    const src = logoSource();
    const srcMtime = statSync(src.path).mtimeMs;
    return OUTPUTS.some((out) => !existsSync(out) || statSync(out).mtimeMs < srcMtime);
}

function logoPipeline(size) {
    const src = logoSource();
    const base = sharp(src.path);
    return base.resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
    });
}

async function logoPng(size) {
    return logoPipeline(size).png().toBuffer();
}

async function writeIcon() {
    // Fill the 512 canvas: earlier 420+46px padding left ~40% empty and
    // made tab favicons look tiny. Source is slightly wider than tall, so
    // `contain` leaves only a thin vertical gap — edges touch L/R.
    await logoPipeline(512).png().toFile(OUT_ICON);
}

async function writeSidebar() {
    const logo = await logoPng(132);
    const gradientSvg = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="164" height="314">
            <defs>
                <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#064e3b"/>
                    <stop offset="100%" stop-color="#10b981"/>
                </linearGradient>
            </defs>
            <rect width="164" height="314" fill="url(#g)"/>
        </svg>`,
    );
    const bmp = await sharpPipelineToBmp(
        sharp(gradientSvg).composite([{ input: logo, gravity: 'center' }]),
    );
    writeFileSync(OUT_SIDEBAR, bmp);
}

async function writeHicolorIcons() {
    for (const size of HICOLOR_SIZES) {
        const dir = join(HICOLOR_ROOT, `${size}x${size}`, 'apps');
        mkdirSync(dir, { recursive: true });
        await logoPipeline(size).png().toFile(join(dir, `${LINUX_ICON_ID}.png`));
    }
}

function hicolorIconsComplete() {
    return HICOLOR_SIZES.every((size) =>
        existsSync(join(HICOLOR_ROOT, `${size}x${size}`, 'apps', `${LINUX_ICON_ID}.png`)),
    );
}

async function writeHeader() {
    const logo = await logoPng(40);
    const headerSvg = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="57">
            <rect width="150" height="57" fill="#ecfdf5"/>
            <text x="52" y="36" font-family="Segoe UI, Arial, sans-serif" font-size="18" font-weight="600" fill="#064e3b">Arborito</text>
        </svg>`,
    );
    const bmp = await sharpPipelineToBmp(
        sharp(headerSvg).composite([{ input: logo, left: 8, top: 8 }]),
    );
    writeFileSync(OUT_HEADER, bmp);
}

/** GNOME/KDE: dev taskbar icon for `npm start` — must NOT use org.treesys.arborito.desktop (Flatpak export id). */
function installLinuxDevShell(iconPath) {
    if (process.platform !== 'linux' || process.env.ARBORITO_SKIP_DEV_ICON === '1') return;
    if (!existsSync(iconPath)) return;

    const sizes = [512, 256, 128];
    const hicolorRoot = join(os.homedir(), '.local/share/icons/hicolor');
    for (const size of sizes) {
        const dir = join(hicolorRoot, `${size}x${size}`, 'apps');
        mkdirSync(dir, { recursive: true });
        copyFileSync(iconPath, join(dir, `${LINUX_ICON_ID}.png`));
    }

    const desktopDir = join(os.homedir(), '.local/share/applications');
    mkdirSync(desktopDir, { recursive: true });

    // Remove obsolete Flatpak-id .desktop if it sets NoDisplay=true (hides Activities).
    const legacyFlatpakIdDesktop = join(desktopDir, `${LINUX_ICON_ID}.desktop`);
    if (existsSync(legacyFlatpakIdDesktop)) {
        try {
            const legacy = readFileSync(legacyFlatpakIdDesktop, 'utf8');
            if (/^NoDisplay=true/m.test(legacy)) {
                rmSync(legacyFlatpakIdDesktop, { force: true });
            }
        } catch {
            /* ignore */
        }
    }

    const desktopPath = join(desktopDir, 'arborito-dev.desktop');
    const desktopBody = `[Desktop Entry]
Type=Application
Name=Arborito (dev)
GenericName=Visual Knowledge Explorer
Comment=Local npm/electron dev session — not the Flatpak app
Icon=${iconPath}
StartupWMClass=${LINUX_ICON_ID}
Categories=Education;
Terminal=false
NoDisplay=true
`;
    writeFileSync(desktopPath, desktopBody, 'utf8');

    spawnSync('gtk-update-icon-cache', ['-f', '-t', hicolorRoot], { stdio: 'ignore' });

    console.log(`[ensure-build-icon] Linux dev shell → ${desktopPath}`);
}

mkdirSync(join(ROOT, 'build'), { recursive: true });

if (!needsRegenerate() && hicolorIconsComplete()) {
    installLinuxDevShell(OUT_ICON);
    console.log('[ensure-build-icon] assets OK : update build/arborito-app-logo.png to regenerate');
    process.exit(0);
}

if (!needsRegenerate()) {
    await writeHicolorIcons();
    installLinuxDevShell(OUT_ICON);
    console.log('[ensure-build-icon] wrote hicolor icons for Flatpak');
    process.exit(0);
}

await writeIcon();
copyFileSync(OUT_ICON, OUT_FAVICON);
await writeSidebar();
await writeHeader();
await writeHicolorIcons();
installLinuxDevShell(OUT_ICON);
console.log('[ensure-build-icon] wrote icon.png from', logoSource().path);
