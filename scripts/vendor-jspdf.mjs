#!/usr/bin/env node
/** Copy jsPDF UMD bundle into vendor/jspdf/ for offline PDF export. */
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'jspdf', 'dist', 'jspdf.umd.min.js');
const destDir = join(root, 'vendor', 'jspdf');
const dest = join(destDir, 'jspdf.umd.min.js');

if (!existsSync(src)) {
    console.error('[vendor-jspdf] Missing jspdf — run: npm install && npm run vendor:jspdf');
    process.exit(1);
}

await mkdir(destDir, { recursive: true });
await copyFile(src, dest);
const kb = Math.round((await readFile(dest)).length / 1024);
console.log(`[vendor-jspdf] OK — vendor/jspdf/jspdf.umd.min.js (${kb} KB)`);
