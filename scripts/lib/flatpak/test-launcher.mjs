#!/usr/bin/env node
/**
 * After a local or CI build: verify export/ in the bundle, reinstall, check host symlinks.
 *
 *   npm run test:flatpak-launcher
 *   npm run test:flatpak-launcher dist/Arborito-0.1.0-alpha-x86_64.flatpak
 */
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { APP_ID } from '../flatpak.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const DESKTOP = `${APP_ID}.desktop`;

function run(cmd, args, opts = {}) {
    return spawnSync(cmd, args, { stdio: 'inherit', ...opts });
}

function fail(msg) {
    console.error(`[test-flatpak-launcher] ${msg}`);
    process.exit(1);
}

function bundlePath() {
    const arg = process.argv[2];
    if (arg) return join(ROOT, arg.replace(/^\.\//, ''));
    const dist = join(ROOT, 'dist');
    const flatpaks = existsSync(dist) ? readdirSync(dist).filter((f) => f.endsWith('.flatpak')) : [];
    if (!flatpaks.length) fail('No .flatpak in dist/ : pass path as argument');
    return join(dist, flatpaks[0]);
}

function main() {
    const bundle = bundlePath();
    if (!existsSync(bundle)) fail(`Missing bundle: ${bundle}`);

    if (run('node', ['./lib/flatpak/verify-bundle.mjs', bundle]).status !== 0) {
        fail('Bundle verification failed (missing export/ or files/)');
    }

    if (run('which', ['flatpak'], { stdio: 'pipe' }).status !== 0) {
        fail('flatpak CLI not installed');
    }

    console.log(`\n[test-flatpak-launcher] reinstall --user ${bundle}\n`);
    run('flatpak', ['uninstall', '--user', '-y', APP_ID], { stdio: 'pipe' });
    if (run('flatpak', ['install', '--user', '-y', bundle]).status !== 0) {
        fail('flatpak install failed');
    }

    run('node', ['./lib/flatpak/diagnose-launcher.mjs']);

    const exportDesktop = join(homedir(), '.local/share/flatpak/exports/share/applications', DESKTOP);
    if (!existsSync(exportDesktop)) {
        fail(`Missing host export symlink: ${exportDesktop}`);
    }
    if (!lstatSync(exportDesktop).isSymbolicLink()) {
        fail(`Expected symlink at ${exportDesktop}`);
    }

    console.log(`\n[test-flatpak-launcher] OK : ${exportDesktop}`);
}

main();
