#!/usr/bin/env node
/**
 * Verify (and optionally install) Flatpak runtimes for electron-builder.
 *
 *   node scripts/preflight-flatpak.mjs
 *   node scripts/preflight-flatpak.mjs --install
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FLATPAK_RUNTIME_REFS, FLATPAK_RUNTIME_VERSION } from '../flatpak.mjs';
import { SCREENSHOTS_URL_BASE } from '../flatpak.mjs';
import { DEMO_MEDIA_REL, PRODUCT_SCREENSHOT_FLATPAK_FILES } from '../demo-product-screenshots.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const METAINFO = join(ROOT, 'build', 'org.treesys.arborito.metainfo.xml');
const DEMO_MEDIA_DIR = join(ROOT, DEMO_MEDIA_REL);
const PKG_JSON = join(ROOT, 'package.json');

const INSTALL = process.argv.includes('--install');

function has(cmd) {
    return spawnSync('which', [cmd], { encoding: 'utf8' }).status === 0;
}

function flatpakOk(args) {
    return spawnSync('flatpak', args, { encoding: 'utf8', stdio: 'pipe' }).status === 0;
}

function listRemotes(userOnly) {
    const args = userOnly ? ['remote-list', '--user'] : ['remote-list'];
    const r = spawnSync('flatpak', args, { encoding: 'utf8', stdio: 'pipe' });
    return r.status === 0 ? r.stdout : '';
}

function hasFlathubRemote() {
    const combined = `${listRemotes(true)}\n${listRemotes(false)}`;
    return /\bflathub\b/.test(combined);
}

function isContainer() {
    return (
        existsSync('/run/.containerenv') ||
        existsSync('/.dockerenv') ||
        String(process.env.container || '').toLowerCase() === 'podman'
    );
}

function ensureFlathubRemote() {
    if (hasFlathubRemote()) return true;

    console.log('[preflight-flatpak] Adding Flathub remote (user scope)…');
    const userAdd = spawnSync(
        'flatpak',
        [
            'remote-add',
            '--user',
            '--if-not-exists',
            'flathub',
            'https://dl.flathub.org/repo/flathub.flatpakrepo',
        ],
        { stdio: 'inherit' }
    );
    if (userAdd.status === 0 && hasFlathubRemote()) return true;

    console.log('[preflight-flatpak] Retrying Flathub remote (system scope)…');
    const sysAdd = spawnSync(
        'flatpak',
        [
            'remote-add',
            '--if-not-exists',
            'flathub',
            'https://dl.flathub.org/repo/flathub.flatpakrepo',
        ],
        { stdio: 'inherit' }
    );
    return sysAdd.status === 0 && hasFlathubRemote();
}

function runtimeInstalled(ref) {
    const [name, branch = FLATPAK_RUNTIME_VERSION] = ref.split('//');
    const ids = [ref, `${name}/x86_64/${branch}`, `${name}/aarch64/${branch}`];
    for (const id of ids) {
        if (flatpakOk(['info', id])) return true;
        if (flatpakOk(['info', '--user', id])) return true;
        if (flatpakOk(['info', '--system', id])) return true;
    }
    const list = spawnSync('flatpak', ['list', '--columns=application,branch', '--runtime'], {
        encoding: 'utf8',
        stdio: 'pipe',
    });
    return list.status === 0 && list.stdout.includes(name) && list.stdout.includes(branch);
}

function installRuntimes(refs) {
    console.log('[preflight-flatpak] Installing runtimes (user scope, non-interactive)…');
    let r = spawnSync('flatpak', ['install', '--user', '-y', 'flathub', ...refs], {
        stdio: 'inherit',
    });
    if (r.status === 0) return true;

    if (!hasFlathubRemote()) {
        console.error('[preflight-flatpak] Flathub remote missing after install attempt.');
        return false;
    }

    console.log('[preflight-flatpak] Retrying install (system scope)…');
    r = spawnSync('flatpak', ['install', '-y', 'flathub', ...refs], { stdio: 'inherit' });
    return r.status === 0;
}

function printContainerHelp() {
    console.error(`
[preflight-flatpak] You appear to be inside a container (toolbox, distrobox, podman, etc.).

Flatpak runtimes often fail here ("No remote refs found for flathub") because the
container's Flatpak is isolated from the host.

Recommended:
  1. Exit the container
  2. On the host:  cd arborito && npm run setup:flatpak && npm run release:build

Inside a container you can still build:
  npm run release:build -- --win --android

Or use GitHub Actions (workflow "Arborito Release") for Linux Flatpak.
`);
}

const missingPkgs = [];
if (!has('flatpak')) missingPkgs.push('flatpak');
if (!has('flatpak-builder')) missingPkgs.push('flatpak-builder');
if (!has('eu-readelf')) missingPkgs.push('elfutils (eu-readelf)');

if (missingPkgs.length) {
    console.error('[preflight-flatpak] Missing packages:', missingPkgs.join(', '));
    console.error(`
Fedora host:
  sudo dnf install flatpak flatpak-builder elfutils

Inside a dev container:
  sudo dnf install flatpak flatpak-builder elfutils
  # For Flatpak builds, prefer running setup:flatpak on the host.
`);
    process.exit(1);
}

if (!hasFlathubRemote()) {
    if (INSTALL) {
        if (!ensureFlathubRemote()) {
            console.error('[preflight-flatpak] Could not add Flathub remote.');
            if (isContainer()) printContainerHelp();
            process.exit(1);
        }
    } else {
        console.error('[preflight-flatpak] Flathub remote not configured. Run:');
        console.error('  npm run setup:flatpak');
        if (isContainer()) printContainerHelp();
        process.exit(1);
    }
}

let missingRt = FLATPAK_RUNTIME_REFS.filter((ref) => !runtimeInstalled(ref));

if (missingRt.length && INSTALL) {
    if (!installRuntimes(missingRt)) {
        console.error('[preflight-flatpak] flatpak install failed');
        if (isContainer()) printContainerHelp();
        process.exit(1);
    }
    missingRt = FLATPAK_RUNTIME_REFS.filter((ref) => !runtimeInstalled(ref));
}

if (missingRt.length) {
    console.error(`[preflight-flatpak] Missing Flatpak runtimes (${FLATPAK_RUNTIME_VERSION}):`);
    missingRt.forEach((r) => console.error('  -', r));
    console.error(`
Install automatically:
  npm run setup:flatpak

Or manually:
  flatpak remote-add --user --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo
  flatpak install --user -y flathub ${missingRt.join(' ')}
`);
    if (isContainer()) printContainerHelp();
    process.exit(1);
}

function validateFlatpakFilesConfig() {
    let pkg;
    try {
        pkg = JSON.parse(readFileSync(PKG_JSON, 'utf8'));
    } catch {
        return;
    }
    const files = pkg?.build?.flatpak?.files;
    if (!Array.isArray(files)) return;
    for (const entry of files) {
        const src = entry?.[0];
        const dest = entry?.[1];
        if (typeof dest === 'string' && dest.startsWith('/')) {
            console.error('[preflight-flatpak] build.flatpak.files dest must not start with "/":', dest);
            console.error(' @malept/flatpak-bundler path.join skips the build dir : metainfo never enters the .flatpak.');
            process.exit(1);
        }
    }

    const desktopPath = join(ROOT, 'build', 'org.treesys.arborito.desktop');
    if (existsSync(desktopPath)) {
        const desktop = readFileSync(desktopPath, 'utf8');
        if (!/^Exec=electron-wrapper/m.test(desktop)) {
            console.error('[preflight-flatpak] build/org.treesys.arborito.desktop missing Exec=electron-wrapper');
            process.exit(1);
        }
        if (!/^Icon=org\.treesys\.arborito/m.test(desktop)) {
            console.error('[preflight-flatpak] build/org.treesys.arborito.desktop missing Icon=org.treesys.arborito');
            process.exit(1);
        }
    } else {
        console.error('[preflight-flatpak] Missing build/org.treesys.arborito.desktop : run npm run flatpak:sync');
        process.exit(1);
    }

    for (const size of [48, 128, 512]) {
        const icon = join(ROOT, 'build', 'icons', 'hicolor', `${size}x${size}`, 'apps', 'org.treesys.arborito.png');
        if (!existsSync(icon)) {
            console.error(`[preflight-flatpak] Missing launcher icon: ${icon}`);
            console.error('  Run: npm run ensure:icon');
            process.exit(1);
        }
    }
}

function validateMetainfo() {
    if (!existsSync(METAINFO)) {
        console.error(`[preflight-flatpak] Missing AppStream metainfo: ${METAINFO}`);
        process.exit(1);
    }

    const requiredShots = PRODUCT_SCREENSHOT_FLATPAK_FILES;
    const missingShots = requiredShots.filter((name) => !existsSync(join(DEMO_MEDIA_DIR, name)));
    if (missingShots.length) {
        console.error('[preflight-flatpak] Missing demo media screenshots:', missingShots.join(', '));
        console.error(`  Expected under ${DEMO_MEDIA_REL}`);
        process.exit(1);
    }

    const metaText = readFileSync(METAINFO, 'utf8');
    if (!metaText.includes(`${SCREENSHOTS_URL_BASE}/`)) {
        console.error('[preflight-flatpak] metainfo missing HTTPS screenshot URLs.');
        console.error('  Run: npm run flatpak:sync');
        process.exit(1);
    }
    if (!/<project_license>GPL-3\.0-or-later<\/project_license>/.test(metaText)) {
        console.error('[preflight-flatpak] metainfo missing project_license (GPL-3.0-or-later).');
        process.exit(1);
    }
    if (!/<developer id="org\.treesys">[\s\S]*?<name>Treesys<\/name>/.test(metaText)) {
        console.error('[preflight-flatpak] metainfo missing <developer> block.');
        process.exit(1);
    }
    if (!/<summary>[\s\S]*?<\/summary>/.test(metaText)) {
        console.error('[preflight-flatpak] metainfo missing summary (GNOME subdescription).');
        process.exit(1);
    }

    if (!has('appstreamcli')) {
        console.warn('[preflight-flatpak] appstreamcli not found : skipping metainfo validation');
        console.warn('  Fedora: sudo dnf install appstream');
        return;
    }

    const inCi = Boolean(process.env.CI || process.env.GITHUB_ACTIONS);
    const args = ['validate', '--explain', METAINFO];
    if (inCi) {
        /* Do not HTTP-probe homepage/FAQ/support URLs in CI: GitHub runners
         * often get HTTP 429 from treesys.org and appstreamcli then exits 1
         * with only url-not-reachable warnings (not a broken metainfo file). */
        args.splice(1, 0, '--no-net');
    } else {
        /* Pedantic treats url-not-reachable as fatal when the network is used. */
        args.splice(1, 0, '--pedantic');
    }

    const r = spawnSync('appstreamcli', args, {
        encoding: 'utf8',
        stdio: 'pipe',
    });
    if (r.status !== 0) {
        console.error('[preflight-flatpak] AppStream metainfo validation failed:');
        if (r.stdout) process.stderr.write(r.stdout);
        if (r.stderr) process.stderr.write(r.stderr);
        process.exit(1);
    }
    console.log('[preflight-flatpak] AppStream metainfo OK');
}

validateFlatpakFilesConfig();
validateMetainfo();

console.log(`[preflight-flatpak] OK : runtimes ${FLATPAK_RUNTIME_VERSION} ready`);
