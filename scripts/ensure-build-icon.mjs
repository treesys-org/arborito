#!/usr/bin/env node
/**
 * Rasterizes build/arborito-root-logo.svg into packaging assets:
 *   - build/icon.png (512×512, app + installer icon)
 *   - build/installerSidebar.bmp (164×314, NSIS wizard sidebar)
 *   - build/installerHeader.bmp (150×57, NSIS wizard header)
 */
import { mkdirSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SVG = join(ROOT, 'build', 'arborito-root-logo.svg');
const OUT_ICON = join(ROOT, 'build', 'icon.png');
const OUT_SIDEBAR = join(ROOT, 'build', 'installerSidebar.bmp');
const OUT_HEADER = join(ROOT, 'build', 'installerHeader.bmp');

const OUTPUTS = [OUT_ICON, OUT_SIDEBAR, OUT_HEADER];

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
    if (!existsSync(SVG)) {
        console.error('[ensure-build-icon] missing', SVG);
        process.exit(1);
    }
    const srcMtime = statSync(SVG).mtimeMs;
    return OUTPUTS.some((out) => !existsSync(out) || statSync(out).mtimeMs < srcMtime);
}

async function logoPng(size) {
    return sharp(SVG)
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
}

async function writeIcon() {
    const logo = await logoPng(380);
    await sharp({
        create: { width: 512, height: 512, channels: 4, background: { r: 16, g: 185, b: 129, alpha: 255 } },
    })
        .composite([{ input: logo, gravity: 'center' }])
        .png()
        .toFile(OUT_ICON);
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

mkdirSync(join(ROOT, 'build'), { recursive: true });

if (!needsRegenerate()) {
    console.log('[ensure-build-icon] assets OK — touch SVG to regenerate');
    process.exit(0);
}

await writeIcon();
await writeSidebar();
await writeHeader();
console.log('[ensure-build-icon] wrote icon.png, installerSidebar.bmp, installerHeader.bmp');
