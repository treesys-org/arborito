#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let fail = 0;

const fontPath = join(root, 'vendor/fonts/noto-color-emoji-0-400-normal.woff2');
const manifestPath = join(root, 'vendor/fonts/noto-color-emoji-manifest.json');
if (!existsSync(fontPath)) {
  console.error('FAIL: missing', fontPath, '(run npm run vendor:emoji)');
  fail++;
} else {
  console.log('OK font subset 0:', fontPath);
}
if (!existsSync(manifestPath)) {
  console.error('FAIL: missing', manifestPath);
  fail++;
} else {
  console.log('OK manifest:', manifestPath);
}

const cssPath = join(root, 'src/shared/styles/foundation/arborito-foundation.css');
const css = readFileSync(cssPath, 'utf8');
if (!css.includes('noto-color-emoji-faces.css')) {
  console.error('FAIL: arborito-foundation.css missing noto-color-emoji-faces.css import');
  fail++;
} else {
  console.log('OK arborito-foundation.css: bundled Noto subset faces');
}

console.log(fail ? '\nRESULT: FAIL' : '\nRESULT: PASS');
process.exit(fail ? 1 : 0);
