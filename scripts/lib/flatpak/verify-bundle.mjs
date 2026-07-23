#!/usr/bin/env node
/**
 * Fail if a built .flatpak bundle is missing AppStream files inside the ostree commit.
 * Catches @malept/flatpak-bundler path.join bug when dest paths start with "/".
 *
 *   node scripts/verify-flatpak-bundle.mjs dist/Arborito-0.1.0-alpha-x86_64.flatpak
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { APP_ID, FLATPAK_ICON_SIZES } from '../flatpak.mjs';
import { PRODUCT_SCREENSHOT_FLATPAK_FILES } from '../demo-product-screenshots.mjs';

const REQUIRED = [
    `files/share/metainfo/${APP_ID}.metainfo.xml`,
    `files/share/applications/${APP_ID}.desktop`,
    `files/share/doc/${APP_ID}/LICENSE`,
    ...FLATPAK_ICON_SIZES.map((size) => `files/share/icons/hicolor/${size}x${size}/apps/${APP_ID}.png`),
    ...PRODUCT_SCREENSHOT_FLATPAK_FILES.map(
        (file) => `files/share/app-info/media/${APP_ID}/${file}`,
    ),
];
/** build-finish → host symlinks under flatpak/exports/share/ after install. */
const EXPORT_REQUIRED = [
    `export/share/applications/${APP_ID}.desktop`,
    ...FLATPAK_ICON_SIZES.map((size) => `export/share/icons/hicolor/${size}x${size}/apps/${APP_ID}.png`),
];

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

function fail(msg) {
    console.error(`[verify-flatpak-bundle] ${msg}`);
    process.exit(1);
}

function run(cmd, args, opts = {}) {
    return spawnSync(cmd, args, { encoding: 'utf8', stdio: 'pipe', ...opts });
}

function bundlePathFromArgv() {
    const arg = process.argv[2];
    if (arg) return arg;
    const dist = join(ROOT, 'dist');
    if (!existsSync(dist)) fail('No .flatpak path given and dist/ is missing');
    const flatpaks = readdirSync(dist).filter((f) => f.endsWith('.flatpak'));
    if (!flatpaks.length) fail('No .flatpak path given and none found in dist/');
    return join(dist, flatpaks[0]);
}

function assertFlatpakFilesConfig() {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    const files = pkg?.build?.flatpak?.files;
    if (!Array.isArray(files)) return;
    for (const entry of files) {
        const src = entry?.[0];
        const dest = entry?.[1];
        if (typeof dest === 'string' && dest.startsWith('/')) {
            fail(
                `package.json build.flatpak.files dest must not start with "/": ${dest}\n` +
                    '  @malept/flatpak-bundler path.join drops the build dir (files never enter the bundle).',
            );
        }
    }
}

function hasCmd(cmd) {
    return run('which', [cmd]).status === 0;
}

function initOstreeRepo(repo) {
    mkdirSync(repo, { recursive: true });
    for (const mode of ['bare-user', 'archive-z2', 'bare']) {
        const r = run('ostree', ['init', '--repo', repo, `--mode=${mode}`]);
        if (r.status === 0) return mode;
    }
    fail(`ostree init failed for ${repo}:\n${run('ostree', ['init', '--repo', repo]).stderr}`);
}

function importBundle(repo, bundle) {
    const flatpak = run('flatpak', ['build-import-bundle', repo, bundle]);
    if (flatpak.status === 0) return 'flatpak build-import-bundle';

    const delta = run('ostree', ['static-delta', 'apply-offline', '--repo', repo, bundle]);
    if (delta.status === 0) return 'ostree static-delta apply-offline';

    fail(
        `Could not import bundle into ostree repo:\n` +
            `flatpak build-import-bundle:\n${flatpak.stderr || flatpak.stdout}\n` +
            `ostree static-delta apply-offline:\n${delta.stderr || delta.stdout}`,
    );
}

function findTreeId(repo) {
    const refs = run('ostree', ['refs', '--repo', repo]);
    if (refs.status === 0) {
        const ref = refs.stdout
            .split('\n')
            .map((l) => l.trim())
            .find((l) => l.includes(APP_ID));
        if (ref) return ref;
    }

    const objectsDir = join(repo, 'objects');
    if (!existsSync(objectsDir)) return null;

    /** @type {string | null} */
    let commit = null;
    for (const prefix of readdirSync(objectsDir)) {
        const dir = join(objectsDir, prefix);
        for (const name of readdirSync(dir)) {
            if (name.endsWith('.commit')) {
                commit = `${prefix}${name.slice(0, -'.commit'.length)}`;
                break;
            }
        }
        if (commit) break;
    }
    return commit;
}

function ostreePathExists(repo, treeId, subpath) {
    const ls = run('ostree', ['ls', '--repo', repo, treeId, subpath]);
    return ls.status === 0;
}

function readDesktop(repo, treeId) {
    const desktopPath = `files/share/applications/${APP_ID}.desktop`;
    const cat = run('ostree', ['cat', '--repo', repo, treeId, desktopPath]);
    if (cat.status !== 0) fail(`Could not read .desktop from bundle: ${cat.stderr || cat.stdout}`);
    return cat.stdout;
}

function readMetainfo(repo, treeId) {
    const metaPath = `files/share/metainfo/${APP_ID}.metainfo.xml`;
    const cat = run('ostree', ['cat', '--repo', repo, treeId, metaPath]);
    if (cat.status !== 0) fail(`Could not read metainfo from bundle: ${cat.stderr || cat.stdout}`);
    return cat.stdout;
}

function main() {
    assertFlatpakFilesConfig();

    const bundle = bundlePathFromArgv();
    if (!existsSync(bundle)) fail(`Missing bundle: ${bundle}`);

    if (!hasCmd('ostree')) {
        console.warn('[verify-flatpak-bundle] ostree not installed : skipping bundle payload check');
        console.log(`[verify-flatpak-bundle] OK (config only) : ${bundle}`);
        return;
    }

    const work = mkdtempSync(join(tmpdir(), 'arborito-flatpak-verify-'));
    const repo = join(work, 'repo');

    try {
        const mode = initOstreeRepo(repo);
        const method = importBundle(repo, bundle);
        const treeId = findTreeId(repo);
        if (!treeId) fail(`No ostree ref/commit for ${APP_ID} after ${method} (mode=${mode})`);

        const missing = REQUIRED.filter((subpath) => !ostreePathExists(repo, treeId, subpath));
        if (missing.length) {
            fail(
                `Bundle missing AppStream payload (metainfo never packaged?):\n  ${missing.join('\n  ')}\n` +
                    '  Rebuild after fixing build.flatpak.files dest paths (no leading "/").',
            );
        }

        const missingExport = EXPORT_REQUIRED.filter((subpath) => !ostreePathExists(repo, treeId, subpath));
        if (missingExport.length) {
            fail(
                `Bundle missing Flatpak export/ tree (Activities will not list the app):\n  ${missingExport.join('\n  ')}\n` +
                    '  Ensure release-build runs rebundle-flatpak.mjs (build-finish + build-export).',
            );
        }

        const xml = readMetainfo(repo, treeId);
        if (!xml.includes('<project_license>GPL-3.0-or-later</project_license>')) {
            fail('Bundled metainfo missing project_license');
        }
        if (!xml.includes('<url type="homepage">https://arborito.org</url>')) {
            fail('Bundled metainfo missing homepage url');
        }
        if (!xml.includes('https://arborito.org/demo-media/')) {
            fail('Bundled metainfo missing screenshot URLs');
        }

        const desktop = readDesktop(repo, treeId);
        if (!/^Exec=electron-wrapper/m.test(desktop)) {
            fail('Bundled .desktop missing Exec=electron-wrapper (electron-builder stageDir desktop)');
        }
        if (!/^Icon=org\.treesys\.arborito/m.test(desktop)) {
            fail('Bundled .desktop Icon must be org.treesys.arborito');
        }
        if (!/^Categories=Education;/m.test(desktop)) {
            fail('Bundled .desktop missing Categories=Education;');
        }

        console.log(`[verify-flatpak-bundle] OK : ${bundle} (${method}, ${treeId})`);
    } finally {
        rmSync(work, { recursive: true, force: true });
    }
}

main();
