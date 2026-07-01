#!/usr/bin/env node
/**
 * Verifies Electron preload asset paths resolve to real files (Noto emoji font).
 * Run: node scripts/test-electron-emoji-paths.mjs
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function resolveAssetLikePreload(rel) {
    return pathToFileURL(join(root, rel)).href;
}

function diskFromFileUrl(href) {
    const u = new URL(href);
    return decodeURIComponent(u.pathname);
}

let fail = 0;
const checks = [
    'vendor/fonts/noto-color-emoji-0-400-normal.woff2',
    'vendor/fonts/noto-color-emoji-manifest.json',
];

console.log('=== Electron-style emoji asset path test ===\n');
for (const rel of checks) {
    const href = resolveAssetLikePreload(rel);
    const disk = diskFromFileUrl(href);
    const ok = existsSync(disk);
    console.log(ok ? 'OK' : 'FAIL', rel);
    console.log('   ', href);
    if (!ok) fail++;
}

console.log(fail ? '\nRESULT: FAIL' : '\nRESULT: PASS');
process.exit(fail ? 1 : 0);
