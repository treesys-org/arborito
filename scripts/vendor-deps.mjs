#!/usr/bin/env node
/**
 * Copy vendored runtime deps into vendor/ (emoji fonts, Twemoji, PDF libs).
 * Run: npm run vendor:deps
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnRunOrExit } from './lib/spawn-run.mjs';

const LIB = join(dirname(fileURLToPath(import.meta.url)), 'lib', 'vendor');

for (const name of ['emoji.mjs', 'emoji-images.mjs', 'html2pdf.mjs', 'jspdf.mjs']) {
    spawnRunOrExit('node', [join(LIB, name)]);
}
