#!/usr/bin/env node
/**
 * Build Android APK via Capacitor (requires JDK 21+ and Android SDK).
 *
 * Output: dist/arborito-<version>.apk
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
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
    npmRun('build');
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
    console.error('[build-android-apk] gradlew not found. Install Android SDK + JDK 21, then re-run.');
    process.exit(1);
}

assertJdk21();

console.log('[build-android-apk] 4/5 — gradle assembleRelease');
const gradleArgs = ['assembleRelease'];
if (process.env.JAVA_HOME) {
    gradleArgs.unshift(`-Dorg.gradle.java.home=${process.env.JAVA_HOME}`);
}
run(gradlew, gradleArgs, { cwd: ANDROID, env: { ...process.env } });

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
