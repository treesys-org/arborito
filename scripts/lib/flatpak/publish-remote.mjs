/**
 * Import a .flatpak bundle into an OSTree repo, prune to tip, write .flatpakref / .flatpakrepo.
 *
 *   node scripts/lib/flatpak/publish-remote.mjs --bundle dist/App.flatpak --out flatpak-dist
 *
 * Requires: flatpak, ostree, gpg. Env: FLATPAK_GPG_KEY_ID (required).
 * Optional: FLATPAK_GPG_PASSPHRASE for signed update-repo.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { APP_ID } from '../flatpak.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');

const FLATPAK_PUBLIC_BASE = 'https://arborito.org/flatpak';
const REPO_URL = `${FLATPAK_PUBLIC_BASE}/repo/`;
const BRANCH = 'stable';
const RUNTIME_REPO = 'https://dl.flathub.org/repo/flathub.flatpakrepo';

function die(msg) {
    console.error(`[publish-flatpak-remote] ${msg}`);
    process.exit(1);
}

function run(cmd, args, opts = {}) {
    const r = spawnSync(cmd, args, {
        encoding: 'utf8',
        stdio: opts.stdio || 'inherit',
        env: opts.env || process.env,
        cwd: opts.cwd || ROOT,
    });
    if (r.status !== 0) {
        die(`${cmd} ${args.join(' ')} failed (exit ${r.status})`);
    }
    return r;
}

function parseArgs(argv) {
    let bundle = '';
    let outDir = path.join(ROOT, 'flatpak-dist');
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--bundle') bundle = argv[++i] || '';
        else if (a === '--out') outDir = path.resolve(argv[++i] || outDir);
        else if (a === '--help' || a === '-h') {
            console.log(`Usage: node publish-remote.mjs --bundle <file.flatpak> [--out flatpak-dist]`);
            process.exit(0);
        }
    }
    return { bundle, outDir };
}

function exportGpgKeyBase64(keyId) {
    const binary = spawnSync('gpg', ['--batch', '--export', keyId], {
        encoding: 'buffer',
        maxBuffer: 8 * 1024 * 1024,
    });
    if (binary.status !== 0) {
        die(`gpg --export ${keyId} failed`);
    }
    return Buffer.from(binary.stdout).toString('base64').replace(/\s+/g, '');
}

function writeRefFiles(flatpakDir, gpgKeyB64) {
    const refPath = path.join(flatpakDir, `${APP_ID}.flatpakref`);
    const repoPath = path.join(flatpakDir, 'arborito.flatpakrepo');

    const refBody = [
        '[Flatpak Ref]',
        'Title=Arborito',
        `Name=${APP_ID}`,
        `Branch=${BRANCH}`,
        `Url=${REPO_URL}`,
        'Homepage=https://arborito.org',
        'IsRuntime=false',
        `RuntimeRepo=${RUNTIME_REPO}`,
        `GPGKey=${gpgKeyB64}`,
        '',
    ].join('\n');

    const repoBody = [
        '[Flatpak Repo]',
        'Title=Arborito',
        `Url=${REPO_URL}`,
        'Homepage=https://arborito.org',
        'Comment=Arborito Linux releases',
        `GPGKey=${gpgKeyB64}`,
        '',
    ].join('\n');

    fs.writeFileSync(refPath, refBody, 'utf8');
    fs.writeFileSync(repoPath, repoBody, 'utf8');
    console.log(`[publish-flatpak-remote] wrote ${refPath}`);
    console.log(`[publish-flatpak-remote] wrote ${repoPath}`);
}

function main() {
    const { bundle, outDir } = parseArgs(process.argv.slice(2));
    if (!bundle) die('Missing --bundle path');
    const bundlePath = path.resolve(bundle);
    if (!fs.existsSync(bundlePath)) die(`Bundle not found: ${bundlePath}`);

    const keyId = String(process.env.FLATPAK_GPG_KEY_ID || '').trim();
    if (!keyId) {
        die(
            'FLATPAK_GPG_KEY_ID is required. Set the GitHub Actions secret and import the private key before running.'
        );
    }

    const flatpakDir = path.join(outDir, 'flatpak');
    const repoDir = path.join(flatpakDir, 'repo');
    fs.mkdirSync(repoDir, { recursive: true });

    if (!fs.existsSync(path.join(repoDir, 'config'))) {
        run('ostree', ['init', `--repo=${repoDir}`, '--mode=archive-z2']);
    }

    console.log(`[publish-flatpak-remote] importing ${bundlePath}`);
    run('flatpak', ['build-import-bundle', repoDir, bundlePath]);

    const updateArgs = [
        'build-update-repo',
        `--gpg-sign=${keyId}`,
        '--generate-static-deltas',
        '--prune',
        '--prune-depth=1',
        repoDir,
    ];

    const passphrase = String(process.env.FLATPAK_GPG_PASSPHRASE || '');
    const env = { ...process.env };
    if (passphrase) {
        env.GPG_TTY = '';
        /* flatpak invokes gpg; pinentry loopback via gpg.conf in CI step is preferred */
    }

    console.log('[publish-flatpak-remote] build-update-repo (prune-depth=1)');
    run('flatpak', updateArgs, { env });

    const gpgKeyB64 = exportGpgKeyBase64(keyId);
    writeRefFiles(flatpakDir, gpgKeyB64);

    console.log(`[publish-flatpak-remote] OK → ${flatpakDir}`);
    console.log(`[publish-flatpak-remote] ref URL: ${FLATPAK_PUBLIC_BASE}/${APP_ID}.flatpakref`);
}

main();
