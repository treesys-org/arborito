#!/usr/bin/env node
/**
 * Release build — interactive target picker (or non-interactive flags).
 *
 *   npm run release:build
 *
 * Flags (skip prompt): --flatpak  --android  --win  --all
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function run(cmd, args, opts = {}) {
    const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: ROOT, shell: false, ...opts });
    if (r.status !== 0) {
        console.error(`\n[release-build] failed: ${cmd} ${args.join(' ')}`);
        process.exit(r.status || 1);
    }
}

function npmRun(script) {
    run('npm', ['run', script]);
}

function hasWine() {
    return spawnSync('which', ['wine'], { encoding: 'utf8' }).status === 0;
}

const isWin = process.platform === 'win32';
const isLinux = process.platform === 'linux';
const wineOnLinux = isLinux && hasWine();

function availableOnHost() {
    const list = [];
    if (isLinux) list.push('flatpak');
    if (isWin || wineOnLinux) list.push('win');
    if (isLinux || isWin) list.push('android');
    return list;
}

function resolveTargets(targets) {
    let { wantFlatpak, wantWin, wantAndroid } = targets;

    if (wantWin && isLinux && !wineOnLinux) {
        run('node', ['./scripts/preflight-wine.mjs']);
    }

    if (isLinux && wantWin && !hasWine()) {
        console.log(`[release-build] Wine no instalado — se omitirá el .exe en este equipo.
  Fedora:  sudo dnf install wine
  Luego:   npm run release:build
`);
        wantWin = false;
    }

    return {
        wantFlatpak: !!wantFlatpak,
        wantWin: !!wantWin,
        wantAndroid: !!wantAndroid,
    };
}

async function promptTargets() {
    const avail = availableOnHost();
    if (!avail.length) {
        console.log('[release-build] No hay objetivos para este sistema.');
        process.exit(1);
    }

    const labels = {
        flatpak: 'Linux Flatpak',
        win: 'Windows .exe (NSIS)',
        android: 'Android APK',
    };

    console.log('\n[release-build] ¿Qué quieres construir?\n');
    console.log('  1) Todos los disponibles en este equipo');
    avail.forEach((key, i) => {
        console.log(`  ${i + 2}) Solo ${labels[key]}`);
    });
    console.log(`  ${avail.length + 2}) Elegir varios (flatpak,win,android)\n`);

    const rl = readline.createInterface({ input, output });
    let choice;
    try {
        choice = (await rl.question(`Opción [1]: `)).trim() || '1';
    } finally {
        rl.close();
    }

    const pickAll = () => {
        const t = { wantFlatpak: false, wantWin: false, wantAndroid: false };
        for (const k of avail) {
            if (k === 'flatpak') t.wantFlatpak = true;
            if (k === 'win') t.wantWin = true;
            if (k === 'android') t.wantAndroid = true;
        }
        return t;
    };

    if (choice === '1') return pickAll();

    const idx = Number(choice);
    if (Number.isFinite(idx) && idx >= 2 && idx <= avail.length + 1) {
        const key = avail[idx - 2];
        return {
            wantFlatpak: key === 'flatpak',
            wantWin: key === 'win',
            wantAndroid: key === 'android',
        };
    }

    if (choice === String(avail.length + 2) || /[,/]/.test(choice)) {
        const raw = choice === String(avail.length + 2)
            ? (await (async () => {
                const rl2 = readline.createInterface({ input, output });
                try {
                    return (await rl2.question('Objetivos (flatpak,win,android): ')).trim();
                } finally {
                    rl2.close();
                }
            })())
            : choice;
        const parts = new Set(
            raw.toLowerCase().split(/[\s,/]+/).filter(Boolean)
        );
        return {
            wantFlatpak: parts.has('flatpak') && avail.includes('flatpak'),
            wantWin: parts.has('win') && avail.includes('win'),
            wantAndroid: parts.has('android') && avail.includes('android'),
        };
    }

    console.log('[release-build] Opción no válida, usando todos los disponibles.');
    return pickAll();
}

const argv = process.argv.slice(2);
const args = new Set(argv);
const explicit = args.has('--flatpak') || args.has('--win') || args.has('--android');

let wantFlatpak;
let wantWin;
let wantAndroid;

if (explicit || args.has('--all')) {
    const wantAll = args.has('--all') || !explicit;
    wantFlatpak = args.has('--flatpak') || (wantAll && isLinux);
    wantAndroid = args.has('--android') || (wantAll && (isLinux || isWin));
    wantWin = args.has('--win') || (wantAll && isWin) || (wantAll && wineOnLinux);
} else if (process.stdin.isTTY) {
    ({ wantFlatpak, wantWin, wantAndroid } = await promptTargets());
} else {
    wantFlatpak = isLinux;
    wantAndroid = isLinux || isWin;
    wantWin = isWin || wineOnLinux;
    console.log('[release-build] Sin TTY — construyendo todos los disponibles en este host.');
}

({ wantFlatpak, wantWin, wantAndroid } = resolveTargets({ wantFlatpak, wantWin, wantAndroid }));

const targets = [
    wantFlatpak && 'Flatpak (Linux)',
    wantWin && 'NSIS (Windows)',
    wantAndroid && 'APK (Android)',
].filter(Boolean);

if (!targets.length) {
    console.log('[release-build] Nada que construir. Prueba otra opción o --flatpak, --android, --win');
    process.exit(1);
}

console.log('[release-build] Objetivos:\n  • ' + targets.join('\n  • '));

console.log('[release-build] 1/4 — Vite web build + emoji + icono');
npmRun('build');
run('node', ['./scripts/ensure-build-icon.mjs']);

if (wantFlatpak) {
    console.log('[release-build] 2/4 — Flatpak');
    run('node', ['./scripts/preflight-flatpak.mjs', '--install']);
    run('npx', ['electron-builder', '--linux', 'flatpak'], {
        env: { ...process.env, DEBUG: process.env.DEBUG || '@malept/flatpak-bundler' },
    });
} else {
    console.log('[release-build] 2/4 — Flatpak omitido');
}

if (wantWin) {
    console.log('[release-build] — Windows NSIS');
    if (isLinux) run('node', ['./scripts/preflight-wine.mjs']);
    run('npx', ['electron-builder', '--win', 'nsis']);
}

if (wantAndroid) {
    console.log('[release-build] 3/4 — Android APK');
    run('node', ['./scripts/build-android-apk.mjs', '--skip-prep']);
} else {
    console.log('[release-build] 3/4 — Android omitido');
}

console.log('[release-build] 4/4 — artefactos en dist/');
const distDir = join(ROOT, 'dist');
if (existsSync(distDir)) {
    const files = readdirSync(distDir).filter((f) => /\.(flatpak|exe|apk)$/i.test(f));
    if (files.length) console.log(files.map((f) => `  dist/${f}`).join('\n'));
    else console.log('  (sin binarios — revisa logs arriba)');
}

let version = '0.1.0-alpha';
try {
    version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version || version;
} catch {
    /* ignore */
}

console.log(`
[release-build] Artefactos listos en dist/:
  Arborito-${version}-x86_64.flatpak
  Arborito Setup ${version}.exe
  arborito-${version}.apk

CI: push tag v${version} → workflow «Arborito Release» publica el Release en GitHub.
Local: https://github.com/treesys-org/arborito/releases/new
`);
