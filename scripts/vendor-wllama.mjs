#!/usr/bin/env node
/**
 * Copies @wllama/wllama ESM entrypoints into vendor/ for same-origin Sage worker loads.
 * Run from arborito/: `npm install @wllama/wllama@2.2.1 --no-save` (or with save) then `npm run vendor:wllama`.
 */
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const srcDir = join(root, 'node_modules', '@wllama', 'wllama', 'esm');
const destDir = join(root, 'vendor', 'wllama', 'esm');

const files = ['index.js', 'wasm-from-cdn.js'];

async function main() {
    for (const f of files) {
        await mkdir(destDir, { recursive: true });
        await copyFile(join(srcDir, f), join(destDir, f));
        console.log('copied', f);
    }
    console.log('Done. Restart the static server and try Sage again.');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
