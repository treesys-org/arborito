#!/usr/bin/env node
/**
 * Build Android APK via Capacitor (requires JDK 17+ and Android SDK).
 *
 * Output: dist/arborito-<version>.apk
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ANDROID = join(ROOT, 'android');

function run(cmd, args, opts = {}) {
    const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: ROOT, shell: false, ...opts });
    if (r.status !== 0) {
        console.error(`\n[build-android-apk] failed: ${cmd} ${args.join(' ')}`);
        process.exit(r.status || 1);
    }
}

function npmRun(script) {
    run('npm', ['run', script]);
}

const args = process.argv.slice(2);
const skipPrep = args.includes('--skip-prep');

let version = '1.0.0';
try {
    version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version || version;
} catch {
    /* ignore */
}

console.log('[build-android-apk] 1/5 — web assets');
if (!skipPrep) {
    npmRun('build:css');
    npmRun('vendor:emoji');
}
run('node', ['./scripts/prepare-capacitor-www.mjs']);

if (!existsSync(ANDROID)) {
    console.log('[build-android-apk] 2/5 — cap add android (first run)');
    run('npx', ['cap', 'add', 'android']);
} else {
    console.log('[build-android-apk] 2/5 — android/ present');
}

console.log('[build-android-apk] 3/5 — cap sync');
run('npx', ['cap', 'sync', 'android']);
run('node', ['./scripts/patch-android-java.mjs']);

const gradlew = join(ANDROID, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
if (!existsSync(gradlew)) {
    console.error('[build-android-apk] gradlew not found. Install Android SDK + JDK 17, then re-run.');
    process.exit(1);
}

console.log('[build-android-apk] 4/5 — gradle assembleRelease');
run(gradlew, ['assembleRelease'], { cwd: ANDROID });

console.log('[build-android-apk] 5/5 — copy APK to dist/');
const apkDir = join(ANDROID, 'app', 'build', 'outputs', 'apk', 'release');
const apks = existsSync(apkDir)
    ? readdirSync(apkDir).filter((f) => f.endsWith('.apk'))
    : [];
if (!apks.length) {
    console.error('[build-android-apk] No APK in', apkDir);
    process.exit(1);
}
mkdirSync(join(ROOT, 'dist'), { recursive: true });
const outName = `arborito-${version}.apk`;
copyFileSync(join(apkDir, apks[0]), join(ROOT, 'dist', outName));
console.log(`[build-android-apk] → dist/${outName}`);
