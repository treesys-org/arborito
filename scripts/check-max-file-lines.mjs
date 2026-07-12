#!/usr/bin/env node
/**
 * Fail if any hand-written source file exceeds MAX_LINES.
 * Excludes generated bundles (main.css) and vendored assets.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const MAX_LINES = 1000;

const SKIP_DIRS = new Set(['node_modules', 'vendor', 'games', 'dist', 'release', 'package', '.git']);
const SKIP_FILES = new Set(['src/shared/styles/main.css']);

const EXT = new Set(['.js', '.cjs', '.mjs', '.css']);

/** @param {string} dir */
async function walk(dir) {
    /** @type {string[]} */
    const out = [];
    const entries = await readdir(dir, { withFileTypes: true });
    for (const ent of entries) {
        const full = join(dir, ent.name);
        if (ent.isDirectory()) {
            if (!SKIP_DIRS.has(ent.name)) out.push(...(await walk(full)));
        } else if (ent.isFile()) {
            const rel = relative(ROOT, full).replace(/\\/g, '/');
            if (SKIP_FILES.has(rel)) continue;
            const ext = ent.name.slice(ent.name.lastIndexOf('.'));
            if (EXT.has(ext)) out.push(full);
        }
    }
    return out;
}

const files = [
    ...(await walk(join(ROOT, 'src'))),
    join(ROOT, 'electron-main.js'),
    join(ROOT, 'electron-sage-voice.js'),
    join(ROOT, 'electron-llama-bin.cjs'),
    join(ROOT, 'electron-llama-chat.cjs'),
    join(ROOT, 'electron-user-data.cjs'),
    join(ROOT, 'electron-whisper-stt.cjs'),
    join(ROOT, 'preload.js')
].filter((f) => f);

/** @type {{ path: string, lines: number }[]} */
const violations = [];

for (const file of files) {
    const text = await readFile(file, 'utf8');
    const lines = text.split('\n').length;
    if (lines > MAX_LINES) {
        violations.push({ path: relative(ROOT, file).replace(/\\/g, '/'), lines });
    }
}

if (violations.length) {
    console.error(`[check-max-file-lines] ${violations.length} file(s) exceed ${MAX_LINES} lines:\n`);
    for (const v of violations.sort((a, b) => b.lines - a.lines)) {
        console.error(`  ${v.lines}\t${v.path}`);
    }
    process.exit(1);
}

console.log(`[check-max-file-lines] OK — all ${files.length} files ≤ ${MAX_LINES} lines`);
