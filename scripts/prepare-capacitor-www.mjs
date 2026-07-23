#!/usr/bin/env node
/** Stage Vite web build into `www/` for Capacitor Android builds. */
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnRunOrExit } from './lib/spawn-run.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WWW = join(ROOT, 'www');
const INDEX = join(WWW, 'index.html');

function run(cmd, args) {
    spawnRunOrExit(cmd, args, { cwd: ROOT });
}

if (!existsSync(INDEX)) {
    console.log('[prepare-capacitor-www] running vite build…');
    run('npm', ['run', 'build']);
}

if (!existsSync(INDEX)) {
    console.error('[prepare-capacitor-www] missing www/index.html : run npm run build first');
    process.exit(1);
}

console.log('[prepare-capacitor-www] using Vite output → www/');
