#!/usr/bin/env node
/**
 * Sync Flatpak AppStream metainfo / .desktop.
 * Screenshots are NOT copied — they live in demo/arborito-demo/media and are
 * published as www/demo-media/ by Vite. AppStream HTTPS URLs point there (EN).
 * Run: npm run flatpak:sync
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCREENSHOTS, SCREENSHOTS_URL_BASE, buildMetainfoXml, buildDesktopFile } from './lib/flatpak.mjs';
import {
    DEMO_MEDIA_REL,
    PRODUCT_SCREENSHOT_FLATPAK_FILES,
} from './lib/demo-product-screenshots.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MEDIA_DIR = join(ROOT, DEMO_MEDIA_REL);
const METAINFO = join(ROOT, 'build', 'org.treesys.arborito.metainfo.xml');
const DESKTOP = join(ROOT, 'build', 'org.treesys.arborito.desktop');

if (!existsSync(MEDIA_DIR)) {
    console.error(`[flatpak-sync] missing ${DEMO_MEDIA_REL}`);
    process.exit(1);
}

for (const file of PRODUCT_SCREENSHOT_FLATPAK_FILES) {
    const src = join(MEDIA_DIR, file);
    if (!existsSync(src)) {
        console.error(`[flatpak-sync] missing demo media: ${file}`);
        process.exit(1);
    }
}

mkdirSync(join(ROOT, 'build'), { recursive: true });

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const version = String(pkg.version || '').trim();
if (!version) throw new Error('package.json missing version');

const dateIso = new Date().toISOString().slice(0, 10);
writeFileSync(METAINFO, buildMetainfoXml(version, dateIso), 'utf8');
writeFileSync(DESKTOP, buildDesktopFile(), 'utf8');

console.log(
    `[flatpak-sync] metainfo ${version} · ${SCREENSHOTS.length} shots from ${DEMO_MEDIA_REL} · ${SCREENSHOTS_URL_BASE} · release ${dateIso}`,
);
