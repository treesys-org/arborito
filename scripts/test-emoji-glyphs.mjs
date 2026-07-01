#!/usr/bin/env node
/**
 * Verifies Sage emojis are covered by bundled Noto subsets.
 * Run: node scripts/test-emoji-glyphs.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const SAGE_EMOJIS = ['🦉', '⚙️', '📝', '🎓', '❓', '🗑️', '💬', '📡', '⚡', '🌐', '🧠', '📄', '🌳', '🌲', '🌱'];

function parseRanges(manifest) {
    return manifest.map((f) => {
        const parts = f.unicodeRange.split(',').map((p) => p.trim());
        const codes = [];
        for (const part of parts) {
            const m = part.match(/^U\+([0-9a-fA-F]+)(?:-([0-9a-fA-F]+))?$/);
            if (!m) continue;
            const start = parseInt(m[1], 16);
            const end = m[2] ? parseInt(m[2], 16) : start;
            codes.push([start, end]);
        }
        return { file: f.file, ranges: codes };
    });
}

function codepoints(emoji) {
    const cps = [];
    for (const ch of emoji) {
        const cp = ch.codePointAt(0);
        if (cp) cps.push(cp);
    }
    return cps;
}

function covered(cps, parsed) {
    for (const cp of cps) {
        let ok = false;
        for (const face of parsed) {
            if (face.ranges.some(([a, b]) => cp >= a && cp <= b)) {
                ok = true;
                break;
            }
        }
        if (!ok) return false;
    }
    return true;
}

let fail = 0;
const manifestPath = join(root, 'vendor/fonts/noto-emoji-manifest.js');
const manifestJson = join(root, 'vendor/fonts/noto-color-emoji-manifest.json');

if (!existsSync(manifestPath)) {
    console.error('FAIL: missing', manifestPath, '(run npm run vendor:emoji)');
    process.exit(1);
}

const raw = readFileSync(manifestJson, 'utf8');
const manifest = JSON.parse(raw);
const parsed = parseRanges(manifest);

console.log('=== Sage emoji subset coverage ===\n');
for (const emoji of SAGE_EMOJIS) {
    const cps = codepoints(emoji);
    const ok = covered(cps, parsed);
    const hex = cps.map((c) => 'U+' + c.toString(16).toUpperCase()).join(' ');
    console.log(ok ? 'OK' : 'FAIL', emoji, hex);
    if (!ok) fail++;
}

for (const face of manifest) {
    const p = join(root, 'vendor/fonts', face.file);
    if (!existsSync(p)) {
        console.error('FAIL: missing font file', face.file);
        fail++;
    }
}

console.log(fail ? '\nRESULT: FAIL' : '\nRESULT: PASS');
process.exit(fail ? 1 : 0);
