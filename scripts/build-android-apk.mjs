#!/usr/bin/env node
/**
 * Build Android APK via Capacitor (requires JDK 21+ and Android SDK).
 *
 * Output: dist/arborito-<version>.apk (signed when ANDROID_KEYSTORE_* is set).
 *
 * Signing env (CI secrets or local):
 *   ANDROID_KEYSTORE_BASE64   — base64 of the .jks / .keystore file
 *   ANDROID_KEYSTORE_PASSWORD
 *   ANDROID_KEY_ALIAS
 *   ANDROID_KEY_PASSWORD
 * Optional:
 *   ANDROID_KEYSTORE_PATH     — path to keystore instead of BASE64
 *   ANDROID_REQUIRE_SIGN=1    — fail if signing env is missing (CI sets this)
 */
import { spawnSync } from 'node:child_process';
import {
    existsSync,
    mkdirSync,
    copyFileSync,
    readFileSync,
    writeFileSync,
    readdirSync,
    mkdtempSync,
    rmSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnRunOrExit } from './lib/spawn-run.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ANDROID = join(ROOT, 'android');

function run(cmd, args, opts = {}) {
    spawnRunOrExit(cmd, args, { cwd: ROOT, ...opts });
}

function npmRun(script) {
    run('npm', ['run', script]);
}

/** Capacitor 7 targets Java 21; Gradle must run on JDK 21+, not the runner default (often 17). */
function assertJdk21() {
    const r = spawnSync('java', ['-version'], { encoding: 'utf8' });
    const text = `${r.stdout || ''}${r.stderr || ''}`.trim();
    const major = Number(text.match(/version "(\d+)/)?.[1] || 0);
    if (major < 21) {
        console.error('[build-android-apk] Capacitor 7 requires JDK 21+.');
        console.error(text ? `  java -version: ${text.split('\n')[0]}` : '  java not found on PATH');
        console.error('  Set JAVA_HOME to Temurin 21 (CI: setup-java after setup-android).');
        process.exit(1);
    }
    console.log(`[build-android-apk] JDK ${major} (${process.env.JAVA_HOME || 'JAVA_HOME unset'})`);
}

function versionCodeFromPackage(version) {
    const m = String(version).match(/^(\d+)\.(\d+)\.(\d+)/);
    if (!m) return 1;
    return Number(m[1]) * 1_000_000 + Number(m[2]) * 1_000 + Number(m[3]);
}

function findApksigner() {
    const home = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || '';
    const candidates = [];
    if (home) {
        const buildTools = join(home, 'build-tools');
        if (existsSync(buildTools)) {
            const vers = readdirSync(buildTools)
                .filter((d) => /^\d+\./.test(d))
                .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
            for (const v of vers) {
                candidates.push(join(buildTools, v, 'apksigner'));
            }
        }
    }
    candidates.push('apksigner');
    for (const c of candidates) {
        const r = spawnSync(c, ['--version'], { encoding: 'utf8' });
        if (!r.error && r.status === 0) return c;
    }
    return null;
}

function resolveKeystore() {
    const pathEnv = (process.env.ANDROID_KEYSTORE_PATH || '').trim();
    if (pathEnv && existsSync(pathEnv)) {
        return { path: pathEnv, cleanup: null };
    }
    const b64 = (process.env.ANDROID_KEYSTORE_BASE64 || '').trim();
    if (!b64) return null;
    const dir = mkdtempSync(join(tmpdir(), 'arborito-ks-'));
    const path = join(dir, 'release.jks');
    writeFileSync(path, Buffer.from(b64, 'base64'));
    return { path, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function hasSigningEnv() {
    const pass = process.env.ANDROID_KEYSTORE_PASSWORD;
    const alias = process.env.ANDROID_KEY_ALIAS;
    const keyPass = process.env.ANDROID_KEY_PASSWORD;
    if (!pass || !alias || !keyPass) return false;
    return Boolean(process.env.ANDROID_KEYSTORE_PATH || process.env.ANDROID_KEYSTORE_BASE64);
}

function signApk(unsignedPath, signedPath) {
    const ks = resolveKeystore();
    if (!ks) {
        console.error('[build-android-apk] Missing ANDROID_KEYSTORE_BASE64 or ANDROID_KEYSTORE_PATH');
        process.exit(1);
    }
    const apksigner = findApksigner();
    if (!apksigner) {
        if (ks.cleanup) ks.cleanup();
        console.error('[build-android-apk] apksigner not found (install Android SDK build-tools).');
        process.exit(1);
    }
    try {
        run(
            apksigner,
            [
                'sign',
                '--ks',
                ks.path,
                '--ks-key-alias',
                process.env.ANDROID_KEY_ALIAS,
                '--ks-pass',
                `pass:${process.env.ANDROID_KEYSTORE_PASSWORD}`,
                '--key-pass',
                `pass:${process.env.ANDROID_KEY_PASSWORD}`,
                '--out',
                signedPath,
                unsignedPath,
            ],
            { cwd: ROOT }
        );
        const verify = spawnSync(apksigner, ['verify', '--verbose', signedPath], { encoding: 'utf8' });
        if (verify.status !== 0) {
            console.error('[build-android-apk] apksigner verify failed');
            console.error(verify.stderr || verify.stdout || '');
            process.exit(1);
        }
        console.log('[build-android-apk] APK signed + verified');
    } finally {
        if (ks.cleanup) ks.cleanup();
    }
}

function apkLooksSigned(apkPath) {
    // Unsigned AGP outputs usually keep “unsigned” in the name; also check ZIP for APK Sig Block.
    if (/unsigned/i.test(apkPath)) return false;
    const buf = readFileSync(apkPath);
    return buf.includes(Buffer.from('APK Sig Block 42'));
}

const args = process.argv.slice(2);
const skipPrep = args.includes('--skip-prep');

let version = '1.0.0';
try {
    version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version || version;
} catch {
    /* ignore */
}
const versionCode = versionCodeFromPackage(version);

console.log('[build-android-apk] 1/6 : web assets');
if (!skipPrep) {
    npmRun('build');
}
run('node', ['./scripts/prepare-capacitor-www.mjs']);

if (!existsSync(ANDROID)) {
    console.log('[build-android-apk] 2/6 : cap add android (first run)');
    run('npx', ['cap', 'add', 'android']);
} else {
    console.log('[build-android-apk] 2/6 : android/ present');
}

console.log('[build-android-apk] 3/6 : cap sync');
run('npx', ['cap', 'sync', 'android']);
run('node', ['./scripts/patch-android-java.mjs']);
run('node', ['./scripts/patch-android-version.mjs', String(version), String(versionCode)]);
run('node', ['./scripts/patch-android-icons.mjs']);
run('node', ['./scripts/patch-android-permissions.mjs']);

const gradlew = join(ANDROID, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
if (!existsSync(gradlew)) {
    console.error('[build-android-apk] gradlew not found. Install Android SDK + JDK 21, then re-run.');
    process.exit(1);
}

assertJdk21();

console.log('[build-android-apk] 4/6 : gradle assembleRelease');
const gradleArgs = ['assembleRelease'];
if (process.env.JAVA_HOME) {
    gradleArgs.unshift(`-Dorg.gradle.java.home=${process.env.JAVA_HOME}`);
}
run(gradlew, gradleArgs, { cwd: ANDROID, env: { ...process.env } });

console.log('[build-android-apk] 5/6 : locate unsigned APK');
const apkDir = join(ANDROID, 'app', 'build', 'outputs', 'apk', 'release');
const apks = existsSync(apkDir)
    ? readdirSync(apkDir).filter((f) => f.endsWith('.apk'))
    : [];
if (!apks.length) {
    console.error('[build-android-apk] No APK in', apkDir);
    process.exit(1);
}
const preferUnsigned =
    apks.find((f) => /unsigned/i.test(f)) ||
    apks.find((f) => f === 'app-release-unsigned.apk') ||
    apks[0];
const unsignedPath = join(apkDir, preferUnsigned);

mkdirSync(join(ROOT, 'dist'), { recursive: true });
const outName = `arborito-${version}.apk`;
const outPath = join(ROOT, 'dist', outName);

const requireSign =
    process.env.ANDROID_REQUIRE_SIGN === '1' || process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';

console.log('[build-android-apk] 6/6 : sign + copy');
if (hasSigningEnv()) {
    signApk(unsignedPath, outPath);
} else if (requireSign) {
    console.error('[build-android-apk] Release APK must be signed, but ANDROID_KEYSTORE_* is missing.');
    console.error('  Set the four GitHub Actions secrets (or local env) and re-run.');
    process.exit(1);
} else {
    console.warn('[build-android-apk] WARNING: no signing env — copying unsigned APK (will not install on phones).');
    copyFileSync(unsignedPath, outPath);
    if (apkLooksSigned(outPath)) {
        console.log(`[build-android-apk] → dist/${outName} (already signed by Gradle)`);
    } else {
        console.warn(`[build-android-apk] → dist/${outName} (UNSIGNED)`);
    }
}

if (requireSign && !apkLooksSigned(outPath)) {
    console.error('[build-android-apk] Refusing to publish unsigned APK.');
    process.exit(1);
}

console.log(`[build-android-apk] → dist/${outName}`);
