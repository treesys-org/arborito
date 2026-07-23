#!/usr/bin/env node
/**
 * Re-run flatpak build-finish + build-export on an electron-builder bundle so GNOME
 * gets exported .desktop + hicolor icons (single-file bundles often skip this).
 *
 *   node scripts/rebundle-flatpak.mjs dist/Arborito-0.1.0-alpha-x86_64.flatpak
 */
import { spawnSync } from 'node:child_process';
import {
    cpSync,
    existsSync,
    mkdtempSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    renameSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
    FLATPAK_COMMAND,
    FLATPAK_FINISH_ARGS,
    FLATPAK_ICON_SIZES,
    FLATPAK_RUNTIME,
    FLATPAK_RUNTIME_VERSION,
    FLATPAK_SDK,
    FLATPAK_BASE,
    FLATPAK_BASE_VERSION,
} from '../flatpak.mjs';

const APP_ID = 'org.treesys.arborito';
const BRANCH = 'stable';
const RUNTIME_REPO = 'https://dl.flathub.org/repo/flathub.flatpakrepo';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

function fail(msg) {
    console.error(`[rebundle-flatpak] ${msg}`);
    process.exit(1);
}

function run(cmd, args, { allowFail = false } = {}) {
    const r = spawnSync(cmd, args, { encoding: 'utf8', stdio: 'pipe' });
    if (r.status !== 0 && !allowFail) {
        fail(`${cmd} ${args.join(' ')}\n${r.stderr || r.stdout}`);
    }
    return r;
}

function bundlePathFromArgv() {
    const arg = process.argv[2];
    if (arg) return arg;
    const dist = join(ROOT, 'dist');
    const flatpaks = existsSync(dist) ? readdirSync(dist).filter((f) => f.endsWith('.flatpak')) : [];
    if (!flatpaks.length) fail('No .flatpak path given and none found in dist/');
    return join(dist, flatpaks[0]);
}

function findRef(repo) {
    const refs = run('ostree', ['refs', '--repo', repo]).stdout
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
    return refs.find((r) => r.includes(APP_ID)) || refs[0] || null;
}

function copyTree(src, dest) {
    mkdirSync(dest, { recursive: true });
    cpSync(src, dest, { recursive: true, force: true });
}

function overlayLauncherAssets(buildFiles) {
    const desktop = join(ROOT, 'build', 'org.treesys.arborito.desktop');
    if (!existsSync(desktop)) fail('Missing build/org.treesys.arborito.desktop : run npm run flatpak:sync');
    mkdirSync(join(buildFiles, 'share', 'applications'), { recursive: true });
    cpSync(desktop, join(buildFiles, 'share', 'applications', `${APP_ID}.desktop`));

    const hicolorSrc = join(ROOT, 'build', 'icons', 'hicolor');
    if (!existsSync(hicolorSrc)) fail('Missing build/icons/hicolor : run ensure:icon');
    copyTree(hicolorSrc, join(buildFiles, 'share', 'icons', 'hicolor'));
}

function checkoutBundleFiles(importRepo, ref, filesDir) {
    if (existsSync(filesDir)) {
        rmSync(filesDir, { recursive: true, force: true });
    }
    // Archive commits store root-owned files; non-root CI cannot fchown without --user-mode.
    run('ostree', ['checkout', '--user-mode', '--repo', importRepo, '--subpath=files', ref, filesDir]);
}

/** Keep electron-builder runtime/base metadata; build-init alone can drop extension refs. */
function checkoutBundleMetadata(importRepo, ref, builddir) {
    const metaPath = join(builddir, 'metadata');
    if (existsSync(metaPath)) {
        rmSync(metaPath, { recursive: true, force: true });
    }
    // ostree checkout --subpath=metadata creates a directory; build-finish needs a file.
    const r = run('ostree', ['cat', '--repo', importRepo, ref, 'metadata'], { allowFail: true });
    if (r.status !== 0 || !r.stdout) {
        console.warn('[rebundle-flatpak] metadata cat skipped : using build-init metadata');
        return;
    }
    writeFileSync(metaPath, r.stdout, 'utf8');
}

function assertExportTree(builddir) {
    const required = [
        join(builddir, 'export', 'share', 'applications', `${APP_ID}.desktop`),
        ...FLATPAK_ICON_SIZES.map((size) =>
            join(builddir, 'export', 'share', 'icons', 'hicolor', `${size}x${size}`, 'apps', `${APP_ID}.png`),
        ),
    ];
    const missing = required.filter((p) => !existsSync(p));
    if (missing.length) {
        fail(
            'build-finish did not populate export/ (GNOME reads ~/.local/share/flatpak/exports/share/):\n' +
                missing.map((p) => `  ${p}`).join('\n'),
        );
    }
}

function assertDesktop(buildFiles) {
    const desktopPath = join(buildFiles, 'share', 'applications', `${APP_ID}.desktop`);
    const text = readFileSync(desktopPath, 'utf8');
    if (!/^Exec=electron-wrapper/m.test(text)) fail('Desktop missing Exec=electron-wrapper');
    if (!/^Icon=org\.treesys\.arborito/m.test(text)) fail('Desktop missing Icon=org.treesys.arborito');
}

function main() {
    if (spawnSync('which', ['flatpak']).status !== 0) {
        console.warn('[rebundle-flatpak] flatpak not installed : skipping');
        return;
    }

    const bundle = bundlePathFromArgv();
    if (!existsSync(bundle)) fail(`Missing bundle: ${bundle}`);

    const work = mkdtempSync(join(tmpdir(), 'arborito-flatpak-rebundle-'));
    const importRepo = join(work, 'import-repo');
    const exportRepo = join(work, 'export-repo');
    const builddir = join(work, 'builddir');
    const out = `${bundle}.rebundle`;

    try {
        mkdirSync(importRepo, { recursive: true });
        run('ostree', ['init', '--repo', importRepo, '--mode=archive-z2']);
        run('flatpak', ['build-import-bundle', importRepo, bundle]);

        const ref = findRef(importRepo);
        if (!ref) fail('Could not find ostree ref after import');

        // build-init: DIRECTORY APPNAME SDK RUNTIME [BRANCH] — base app via flags, not positional args.
        run('flatpak', [
            'build-init',
            builddir,
            APP_ID,
            FLATPAK_SDK,
            FLATPAK_RUNTIME,
            FLATPAK_RUNTIME_VERSION,
            `--base=${FLATPAK_BASE}`,
            `--base-version=${FLATPAK_BASE_VERSION}`,
        ]);

        const filesDir = join(builddir, 'files');
        checkoutBundleFiles(importRepo, ref, filesDir);
        overlayLauncherAssets(filesDir);
        assertDesktop(filesDir);
        checkoutBundleMetadata(importRepo, ref, builddir);

        const finish = run('flatpak', [
            'build-finish',
            builddir,
            `--command=${FLATPAK_COMMAND}`,
            ...FLATPAK_FINISH_ARGS,
        ]);
        if (finish.stdout?.includes('Exporting')) {
            console.log(
                finish.stdout
                    .split('\n')
                    .filter((l) => l.includes('Exporting'))
                    .join('\n'),
            );
        }
        assertExportTree(builddir);

        mkdirSync(exportRepo, { recursive: true });
        run('ostree', ['init', '--repo', exportRepo, '--mode=archive-z2']);
        run('flatpak', [
            'build-export',
            '--update-appstream',
            exportRepo,
            builddir,
            BRANCH,
        ]);

        run('flatpak', [
            'build-bundle',
            `--runtime-repo=${RUNTIME_REPO}`,
            exportRepo,
            out,
            APP_ID,
            BRANCH,
        ]);
        renameSync(out, bundle);
        console.log(`[rebundle-flatpak] OK : build-finish + export + runtime-repo (${BRANCH})`);
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
}

main();
