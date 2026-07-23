#!/usr/bin/env node
/**
 * Cross-platform Tailwind build (Windows CI sometimes fails with bare `tailwindcss` on PATH).
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const cli = join(ROOT, 'node_modules', 'tailwindcss', 'lib', 'cli.js');

if (!existsSync(cli)) {
    console.error('[build-css] tailwindcss not installed : run npm install in', ROOT);
    process.exit(1);
}

const minify = process.argv.includes('--minify');
const args = [
    cli,
    '-i',
    './src/shared/styles/main.entry.css',
    '-o',
    './src/shared/styles/main.css',
    ...(minify ? ['--minify'] : []),
];

const r = spawnSync(process.execPath, args, { stdio: 'inherit', cwd: ROOT });
if (r.status !== 0) {
    console.error('[build-css] Tailwind failed (exit', r.status ?? 1, ')');
    process.exit(r.status || 1);
}
