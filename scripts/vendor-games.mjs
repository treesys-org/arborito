#!/usr/bin/env node
/**
 * OPTIONAL deploy helper — mirror arborito-games into arborito/games/ for same-origin hosting.
 * Normal dev/prod: the app fetches the catalog from the arborito-games repo over HTTP (jsDelivr).
 * This script does NOT merge repos; it only copies static files into a deploy artifact when you want them on arborito.org/games/.
 */
import { spawnSync } from 'node:child_process';
import {
    cpSync,
    existsSync,
    mkdirSync,
    readFileSync,
    rmSync,
    writeFileSync
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ARBORITO_ROOT = join(__dirname, '..');
const OUT = join(ARBORITO_ROOT, 'games');

function parseSrcArg() {
    const idx = process.argv.indexOf('--src');
    if (idx !== -1 && process.argv[idx + 1]) return resolve(process.argv[idx + 1]);
    if (process.env.ARBORITO_GAMES_SRC) return resolve(process.env.ARBORITO_GAMES_SRC);
    return resolve(ARBORITO_ROOT, '..', 'arborito-games');
}

function run(cmd, args, cwd) {
    const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: false });
    if (r.status !== 0) {
        throw new Error(`[vendor-games] ${cmd} ${args.join(' ')} failed (${r.status})`);
    }
}

function ensureTailwindBuilt(src) {
    const css = join(src, 'public', 'tailwind.css');
    if (existsSync(css)) return;
    const pkg = join(src, 'package.json');
    if (!existsSync(pkg)) {
        throw new Error(`[vendor-games] missing ${css} and no package.json in ${src}`);
    }
    console.log('[vendor-games] building Tailwind in arborito-games…');
    if (existsSync(join(src, 'node_modules'))) {
        run('npm', ['run', 'build:css'], src);
    } else {
        run('npm', ['ci', '--no-audit', '--no-fund'], src);
        run('npm', ['run', 'build:css'], src);
    }
    if (!existsSync(css)) {
        throw new Error(`[vendor-games] expected ${css} after build:css`);
    }
}

function main() {
    const src = parseSrcArg();
    if (!existsSync(join(src, 'manifest.json'))) {
        console.error(`[vendor-games] skip — no manifest at ${src}`);
        process.exit(0);
    }

    ensureTailwindBuilt(src);

    rmSync(OUT, { recursive: true, force: true });
    mkdirSync(OUT, { recursive: true });

    cpSync(join(src, 'manifest.json'), join(OUT, 'manifest.json'));
    cpSync(join(src, 'cartridges'), join(OUT, 'cartridges'), { recursive: true });
    mkdirSync(join(OUT, 'public'), { recursive: true });
    cpSync(join(src, 'public', 'tailwind.css'), join(OUT, 'public', 'tailwind.css'));

    const manifest = JSON.parse(readFileSync(join(OUT, 'manifest.json'), 'utf8'));
    const count = Array.isArray(manifest) ? manifest.length : 0;
    console.log(`[vendor-games] wrote ${OUT} (${count} game(s))`);
}

main();
