#!/usr/bin/env node
/**
 * After `cap add` / `cap sync`, replace Capacitor default launcher icons with
 * Arborito branding from build/arborito-app-logo.png (fallback: build/icon.png).
 *
 * Writes only mipmap PNGs + values/ic_launcher_background.xml — leaves splash,
 * Gradle, and adaptive XML wiring untouched.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ANDROID_RES = join(ROOT, 'android', 'app', 'src', 'main', 'res');
const LOGO_PNG = join(ROOT, 'build', 'arborito-app-logo.png');
const ICON_PNG = join(ROOT, 'build', 'icon.png');

/** Brand mint — matches canopy / NSIS header, visible under adaptive masks. */
const BG = { r: 236, g: 253, b: 245, alpha: 1 };
const BG_HEX = '#ECFDF5';

/** Standard Android launcher + adaptive-foreground sizes (px). */
const DENSITIES = [
    { dir: 'mipmap-mdpi', launcher: 48, foreground: 108 },
    { dir: 'mipmap-hdpi', launcher: 72, foreground: 162 },
    { dir: 'mipmap-xhdpi', launcher: 96, foreground: 216 },
    { dir: 'mipmap-xxhdpi', launcher: 144, foreground: 324 },
    { dir: 'mipmap-xxxhdpi', launcher: 192, foreground: 432 },
];

function resolveLogo() {
    if (existsSync(LOGO_PNG)) return LOGO_PNG;
    if (existsSync(ICON_PNG)) return ICON_PNG;
    return null;
}

async function logoOnCanvas(src, canvas, logoSize) {
    const logo = await sharp(src)
        .resize(logoSize, logoSize, {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer();
    const left = Math.round((canvas - logoSize) / 2);
    const top = Math.round((canvas - logoSize) / 2);
    return sharp({
        create: {
            width: canvas,
            height: canvas,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
    })
        .composite([{ input: logo, left, top }])
        .png()
        .toBuffer();
}

async function legacyLauncher(src, size) {
    // Legacy icons have no adaptive safe zone — fill the tile with brand bg.
    const logoSize = Math.round(size * 0.78);
    const logo = await sharp(src)
        .resize(logoSize, logoSize, {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer();
    const left = Math.round((size - logoSize) / 2);
    const top = Math.round((size - logoSize) / 2);
    return sharp({
        create: {
            width: size,
            height: size,
            channels: 4,
            background: BG,
        },
    })
        .composite([{ input: logo, left, top }])
        .png()
        .toBuffer();
}

async function main() {
    if (!existsSync(ANDROID_RES)) {
        console.log('[patch-android-icons] android/res missing : skip');
        return;
    }
    const src = resolveLogo();
    if (!src) {
        console.error('[patch-android-icons] missing build/arborito-app-logo.png (or build/icon.png)');
        process.exit(1);
    }

    for (const { dir, launcher, foreground } of DENSITIES) {
        const outDir = join(ANDROID_RES, dir);
        if (!existsSync(outDir)) {
            mkdirSync(outDir, { recursive: true });
        }
        // Adaptive foreground: ~66% so the tree stays inside the safe zone.
        const fgLogo = Math.round(foreground * 0.66);
        const fgBuf = await logoOnCanvas(src, foreground, fgLogo);
        const legacyBuf = await legacyLauncher(src, launcher);

        writeFileSync(join(outDir, 'ic_launcher_foreground.png'), fgBuf);
        writeFileSync(join(outDir, 'ic_launcher.png'), legacyBuf);
        writeFileSync(join(outDir, 'ic_launcher_round.png'), legacyBuf);
    }

    const colorXml = join(ANDROID_RES, 'values', 'ic_launcher_background.xml');
    writeFileSync(
        colorXml,
        `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${BG_HEX}</color>
</resources>
`
    );

    console.log(`[patch-android-icons] launcher icons ← ${src.replace(`${ROOT}/`, '')}`);
}

await main();
