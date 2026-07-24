#!/usr/bin/env node
/**
 * CI helper: ensure platform-native optional packages exist after `npm ci`.
 *
 * npm sometimes skips optional deps (cache / omit=optional / cross-platform lock
 * quirks), which breaks Vite (`@rollup/rollup-linux-x64-gnu`) and icon regen
 * (`sharp`). Run after install on GitHub Actions before any `vite build`.
 *
 *   node ./scripts/ci-ensure-native-deps.mjs
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { platform, arch } from 'node:os';

const require = createRequire(import.meta.url);

function npmInstallNoSave(pkg) {
    console.log(`[ci-ensure-native-deps] installing ${pkg} …`);
    const r = spawnSync(
        'npm',
        ['install', '--no-save', '--no-audit', '--no-fund', '--include=optional', pkg],
        { stdio: 'inherit', env: process.env }
    );
    if (r.status !== 0) {
        throw new Error(`[ci-ensure-native-deps] failed to install ${pkg} (exit ${r.status})`);
    }
}

function ensureRollupNative() {
    try {
        /* Rollup resolves the right @rollup/rollup-* package for this OS/CPU. */
        require('rollup/dist/native.js');
        console.log('[ci-ensure-native-deps] rollup native OK');
        return;
    } catch (err) {
        console.warn('[ci-ensure-native-deps] rollup native missing:', err?.message || err);
    }

    const plat = platform();
    const cpu = arch();
    /** @type {string[]} */
    const candidates = [];
    if (plat === 'linux' && cpu === 'x64') {
        candidates.push('@rollup/rollup-linux-x64-gnu', '@rollup/rollup-linux-x64-musl');
    } else if (plat === 'linux' && (cpu === 'arm64' || cpu === 'aarch64')) {
        candidates.push('@rollup/rollup-linux-arm64-gnu', '@rollup/rollup-linux-arm64-musl');
    } else if (plat === 'darwin' && cpu === 'arm64') {
        candidates.push('@rollup/rollup-darwin-arm64');
    } else if (plat === 'darwin' && cpu === 'x64') {
        candidates.push('@rollup/rollup-darwin-x64');
    } else if (plat === 'win32' && cpu === 'x64') {
        candidates.push('@rollup/rollup-win32-x64-msvc');
    }

    if (!candidates.length) {
        throw new Error(
            `[ci-ensure-native-deps] unsupported platform for rollup native: ${plat}/${cpu}`
        );
    }

    let lastErr = null;
    for (const pkg of candidates) {
        try {
            npmInstallNoSave(pkg);
            require('rollup/dist/native.js');
            console.log(`[ci-ensure-native-deps] rollup native OK via ${pkg}`);
            return;
        } catch (e) {
            lastErr = e;
            console.warn(`[ci-ensure-native-deps] ${pkg} did not satisfy rollup:`, e?.message || e);
        }
    }
    throw lastErr || new Error('[ci-ensure-native-deps] could not restore rollup native binding');
}

function ensureSharpOptional() {
    try {
        require('sharp');
        console.log('[ci-ensure-native-deps] sharp OK');
    } catch (err) {
        /* Icon regen is skipped when assets are current; warn only. */
        console.warn(
            '[ci-ensure-native-deps] sharp unavailable (OK if build icons are committed):',
            err?.message || err
        );
    }
}

ensureRollupNative();
ensureSharpOptional();
