#!/usr/bin/env node
/**
 * Copy html2pdf.js browser bundle into vendor/html2pdf/ for offline web PDF export.
 * Run: npm install && npm run vendor:html2pdf
 */
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const src = join(root, 'node_modules', 'html2pdf.js', 'dist', 'html2pdf.bundle.min.js');
const destDir = join(root, 'vendor', 'html2pdf');
const dest = join(destDir, 'html2pdf.bundle.min.js');
const licenseSrc = join(root, 'node_modules', 'html2pdf.js', 'LICENSE');
const licenseDest = join(destDir, 'LICENSE.txt');

if (!existsSync(src)) {
    console.error(
        '[vendor-html2pdf] Missing html2pdf.js — run: npm install && npm run vendor:html2pdf'
    );
    process.exit(1);
}

await mkdir(destDir, { recursive: true });
await copyFile(src, dest);
if (existsSync(licenseSrc)) {
    await copyFile(licenseSrc, licenseDest);
} else {
    await writeFile(
        licenseDest,
        'html2pdf.js — see https://github.com/eKoopmans/html2pdf.js\n',
        'utf8'
    );
}

const kb = Math.round((await readFile(dest)).length / 1024);
console.log(`[vendor-html2pdf] OK — vendor/html2pdf/html2pdf.bundle.min.js (${kb} KB)`);
