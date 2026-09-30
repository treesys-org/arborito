/**
 * Import a .flatpak bundle into an OSTree repo, prune to tip, write .flatpakref / .flatpakrepo.
 *
 *   node scripts/lib/flatpak/publish-remote.mjs --bundle dist/App.flatpak --out flatpak-dist
 *
 * Requires: flatpak, ostree, gpg, gpgv. Env: FLATPAK_GPG_KEY_ID (required).
 * Optional: FLATPAK_GPG_PASSPHRASE for signed update-repo.
 *
 * The commit is signed with `ostree gpg-sign` after import. gpgv must accept
 * that signature and the summary signature before publish.
 */

import fs from 'node:fs';
import os from 'node:os';
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

function exportGpgKey(keyId) {
    const binary = spawnSync('gpg', ['--batch', '--export', keyId], {
        encoding: 'buffer',
        maxBuffer: 8 * 1024 * 1024,
    });
    if (binary.status !== 0 || !binary.stdout || binary.stdout.length === 0) {
        die(`gpg --export ${keyId} failed`);
    }
    return Buffer.from(binary.stdout);
}

/** First v4 detached signature packet inside an ostree `ostree.gpgsigs` blob. */
function extractDetachedSig(buf) {
    for (let i = 0; i + 6 < buf.length; i++) {
        if (buf[i] !== 0x89) continue;
        const bodyLen = buf.readUInt16BE(i + 1);
        const end = i + 3 + bodyLen;
        if (end > buf.length) continue;
        if (buf[i + 3] !== 0x04) continue;
        return buf.subarray(i, end);
    }
    return null;
}

function gpgvVerify(keyringPath, sigBytes, dataBytes) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fpk-sig-'));
    const sigPath = path.join(dir, 'sig');
    const dataPath = path.join(dir, 'data');
    fs.writeFileSync(sigPath, sigBytes);
    fs.writeFileSync(dataPath, dataBytes);
    const r = spawnSync('gpgv', ['--keyring', keyringPath, sigPath, dataPath], {
        encoding: 'utf8',
    });
    fs.rmSync(dir, { recursive: true, force: true });
    if (r.error) {
        die(`gpgv failed to start (${r.error.message}). Install gnupg.`);
    }
    return {
        ok: r.status === 0,
        out: `${r.stdout || ''}\n${r.stderr || ''}`.trim(),
    };
}

function objectPath(repoDir, commit, ext) {
    return path.join(repoDir, 'objects', commit.slice(0, 2), `${commit.slice(2)}.${ext}`);
}

function verifyCommitSignature(repoDir, commit, keyringPath) {
    const commitBytes = fs.readFileSync(objectPath(repoDir, commit, 'commit'));
    const metaPath = objectPath(repoDir, commit, 'commitmeta');
    if (!fs.existsSync(metaPath)) {
        return { ok: false, out: `missing ${metaPath}` };
    }
    const sig = extractDetachedSig(fs.readFileSync(metaPath));
    if (!sig) return { ok: false, out: 'commitmeta has no v4 detached signature' };
    return gpgvVerify(keyringPath, sig, commitBytes);
}

function verifySummarySignature(repoDir, keyringPath) {
    const summary = fs.readFileSync(path.join(repoDir, 'summary'));
    const sig = extractDetachedSig(fs.readFileSync(path.join(repoDir, 'summary.sig')));
    if (!sig) return { ok: false, out: 'summary.sig has no v4 detached signature' };
    return gpgvVerify(keyringPath, sig, summary);
}

function signCommit(repoDir, commit, keyId, env) {
    const metaPath = objectPath(repoDir, commit, 'commitmeta');
    if (fs.existsSync(metaPath)) fs.rmSync(metaPath);
    run('ostree', [`--repo=${repoDir}`, 'gpg-sign', commit, keyId], { env });
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

    const passphrase = String(process.env.FLATPAK_GPG_PASSPHRASE || '');
    const env = { ...process.env };
    if (passphrase) {
        env.GPG_TTY = '';
        /* flatpak invokes gpg; pinentry loopback via gpg.conf in CI step is preferred */
    }

    console.log(`[publish-flatpak-remote] importing ${bundlePath}`);
    /* Sign the stored commit with ostree, then let build-update-repo sign
     * the summary and build static deltas. gpgv checks both afterwards. */
    run('flatpak', ['build-import-bundle', '--no-update-summary', repoDir, bundlePath], { env });

    const ref = `app/${APP_ID}/x86_64/${BRANCH}`;
    const rev = spawnSync('ostree', [`--repo=${repoDir}`, 'rev-parse', ref], {
        encoding: 'utf8',
    });
    if (rev.status !== 0) {
        die(`ostree rev-parse ${ref} failed: ${rev.stderr || rev.stdout}`);
    }
    const commit = String(rev.stdout || '').trim();

    const exported = exportGpgKey(keyId);
    const keyringPath = path.join(os.tmpdir(), `arborito-flatpak-${process.pid}.gpg`);
    fs.writeFileSync(keyringPath, exported);

    const signAndCheck = () => {
        console.log(`[publish-flatpak-remote] ostree gpg-sign ${commit.slice(0, 12)}…`);
        signCommit(repoDir, commit, keyId, env);
        return verifyCommitSignature(repoDir, commit, keyringPath);
    };
    let commitSig = signAndCheck();
    if (!commitSig.ok) {
        console.error('[publish-flatpak-remote] commit signature did not verify; signing once more');
        console.error(commitSig.out);
        commitSig = signAndCheck();
    }
    if (!commitSig.ok) {
        die(
            `Refusing to publish ${commit}: commit signature is not valid.\n${commitSig.out}`
        );
    }

    const updateArgs = [
        'build-update-repo',
        `--gpg-sign=${keyId}`,
        '--generate-static-deltas',
        '--prune',
        '--prune-depth=1',
        repoDir,
    ];

    console.log('[publish-flatpak-remote] build-update-repo (prune-depth=1)');
    run('flatpak', updateArgs, { env });

    commitSig = verifyCommitSignature(repoDir, commit, keyringPath);
    if (!commitSig.ok) {
        die(
            `Commit signature was valid before build-update-repo and is not after.\n${commitSig.out}`
        );
    }
    const summarySig = verifySummarySignature(repoDir, keyringPath);
    if (!summarySig.ok) {
        die(`Refusing to publish: summary signature is not valid.\n${summarySig.out}`);
    }

    const show = spawnSync('ostree', [`--repo=${repoDir}`, 'show', commit], {
        encoding: 'utf8',
        maxBuffer: 4 * 1024 * 1024,
    });
    const showOut = `${show.stdout || ''}\n${show.stderr || ''}`;
    if (show.status !== 0 || !/Good signature/.test(showOut) || /BAD signature/.test(showOut)) {
        die(
            `ostree show does not report a good commit signature for ${commit}.\n${showOut.slice(0, 1500)}`
        );
    }
    console.log(`[publish-flatpak-remote] gpgv Good signature on ${commit.slice(0, 12)}… and summary`);

    fs.rmSync(keyringPath, { force: true });
    const gpgKeyB64 = exported.toString('base64').replace(/\s+/g, '');
    writeRefFiles(flatpakDir, gpgKeyB64);

    console.log(`[publish-flatpak-remote] OK → ${flatpakDir}`);
    console.log(`[publish-flatpak-remote] ref URL: ${FLATPAK_PUBLIC_BASE}/${APP_ID}.flatpakref`);
}

main();
