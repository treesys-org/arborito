#!/usr/bin/env node
/**
 * Vendors Twemoji 72x72 PNGs for offline emoji fallback (build-time only, no runtime CDN).
 * Sources (in order): npm twemoji/assets, sparse clone of jdecked/twemoji.
 * Run: npm run vendor:emoji
 */
import { cp, mkdir, access, rm, writeFile, readFile, readdir } from 'node:fs/promises';
import { constants, accessSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const npmSrc = join(root, 'node_modules', 'twemoji', 'assets', '72x72');
const emojiVendorDir = join(root, 'vendor', 'emoji');
const destDir = join(emojiVendorDir, 'twemoji', '72x72');
const cloneDir = join(root, '.cache', 'twemoji-assets');
const TWEMOJI_REPO = 'https://github.com/jdecked/twemoji.git';
const dataUriOut = join(root, 'src', 'shared', 'lib', 'twemoji-datauri.js');

/* CC-BY 4.0 (graphics) requires that attribution travels with the assets.
 * Keep this written next to the vendored PNGs so re-vendoring never drops it. */
const TWEMOJI_LICENSE = `Twemoji — emoji graphics bundled in this directory (vendor/emoji/twemoji/)
==========================================================================

Arborito renders emoji using the Twemoji image set. The PNG assets under
\`twemoji/72x72/\` are vendored offline (no runtime CDN) from the Twemoji
project, currently maintained by jdecked:

  https://github.com/jdecked/twemoji
  (originally created and released by Twitter, Inc.)

Copyright and licenses
----------------------
Copyright 2019 Twitter, Inc and other contributors.
Copyright 2020-present jdecked and other contributors.

  - Graphics (the emoji images bundled here):
    Creative Commons Attribution 4.0 International (CC-BY 4.0)
    https://creativecommons.org/licenses/by/4.0/

  - Source code (the Twemoji library, not redistributed at runtime here):
    MIT License
    https://opensource.org/licenses/MIT

Attribution (required by CC-BY 4.0)
-----------------------------------
This product includes graphics from Twemoji
(https://github.com/jdecked/twemoji), © Twitter, Inc. and other
contributors, licensed under CC-BY 4.0
(https://creativecommons.org/licenses/by/4.0/).

Changes
-------
The original Twemoji 72x72 PNG assets are used as-is. They are copied into
this directory at build time by \`scripts/vendor-emoji-images.mjs\`; no
modifications are made to the image files themselves.

Full CC-BY 4.0 legal code: https://creativecommons.org/licenses/by/4.0/legalcode
`;

async function writeTwemojiLicense() {
    await mkdir(emojiVendorDir, { recursive: true });
    await writeFile(join(emojiVendorDir, 'LICENSE.txt'), TWEMOJI_LICENSE, 'utf8');
}

async function exists(p) {
    try {
        await access(p, constants.F_OK);
        return true;
    } catch {
        return false;
    }
}

/* ── Inline emoji data-URI module ────────────────────────────────────────────
 * Scans the source for the emoji actually used in the UI and inlines the matching
 * Twemoji PNG as a base64 data URI into src/shared/lib/twemoji-datauri.js. The app
 * then renders every UI emoji with ZERO network requests (no per-emoji HTTP
 * round-trips, no "popping in" on first paint). Mirrors the runtime regex in
 * emoji-display.js and emojiToTwemojiCandidates() in emoji-twemoji.js. */
const EMOJI_RE =
    /(?:\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?)*|[\u{1F1E6}-\u{1F1FF}]{2})/gu;
const SCAN_ROOTS = ['src', 'locales', 'index.html'];
const SCAN_EXT = new Set(['.js', '.mjs', '.html', '.json']);

function emojiToTwemojiCandidates(emoji) {
    const hex = [];
    for (const ch of String(emoji || '')) hex.push(ch.codePointAt(0).toString(16));
    if (!hex.length) return ['1f4c4.png'];
    const base = hex.join('-');
    const stripped = base.replace(/-fe0f/g, '');
    const out = [];
    if (stripped) out.push(`${stripped}.png`);
    if (base !== stripped) out.push(`${base}.png`);
    if (!base.includes('fe0f')) out.push(`${base}-fe0f.png`);
    return [...new Set(out)];
}

async function walkFiles(dir, acc) {
    let entries;
    try {
        entries = await readdir(dir, { withFileTypes: true });
    } catch {
        return acc;
    }
    for (const e of entries) {
        const full = join(dir, e.name);
        if (e.isDirectory()) {
            if (e.name === 'node_modules' || e.name === '.cache' || e.name === '.git') continue;
            await walkFiles(full, acc);
        } else if (SCAN_EXT.has(extname(e.name))) {
            acc.push(full);
        }
    }
    return acc;
}

async function collectUsedEmoji() {
    const files = [];
    for (const r of SCAN_ROOTS) {
        const p = join(root, r);
        if (!(await exists(p))) continue;
        if (extname(p)) files.push(p);
        else await walkFiles(p, files);
    }
    const found = new Set();
    for (const f of files) {
        let txt;
        try {
            txt = await readFile(f, 'utf8');
        } catch {
            continue;
        }
        const matches = txt.match(EMOJI_RE);
        if (matches) for (const m of matches) found.add(m);
    }
    return found;
}

async function writeDataUriModule() {
    if (!(await exists(join(destDir, '1f333.png')))) {
        console.warn('WARN: PNG set missing; skipping data-URI module (kept existing).');
        return;
    }
    const emoji = await collectUsedEmoji();
    const data = new Map(); // existing filename -> dataURI
    const alias = new Map(); // requested candidate -> existing filename
    let inlined = 0;
    for (const em of [...emoji].sort()) {
        const cands = emojiToTwemojiCandidates(em);
        let existing = null;
        for (const f of cands) {
            if (await exists(join(destDir, f))) {
                existing = f;
                break;
            }
        }
        if (!existing) continue;
        inlined++;
        if (!data.has(existing)) {
            const buf = await readFile(join(destDir, existing));
            data.set(existing, `data:image/png;base64,${buf.toString('base64')}`);
        }
        if (cands[0] !== existing) alias.set(cands[0], existing);
    }

    /* Guard: never clobber a good committed file with an empty/broken scan. */
    if (inlined < 50) {
        console.warn(`WARN: only ${inlined} emoji found; keeping existing data-URI module.`);
        return;
    }

    const q = '"';
    const lines = [
        '/** Auto-generated by scripts/vendor-emoji-images.mjs — DO NOT EDIT.',
        ' *',
        ' * Inlined Twemoji PNGs (base64) for every emoji used across the UI, so they',
        ' * render with ZERO network requests (no per-emoji HTTP round-trips, no',
        ' * "popping in" on first paint). Arbitrary user-supplied emoji not listed',
        ' * here fall back to fetching the vendored PNG file at runtime.',
        ' *',
        ` * Emoji inlined: ${inlined} · unique images: ${data.size} · aliases: ${alias.size}`,
        ' */',
        'export const TWEMOJI_DATAURI = {',
    ];
    for (const k of [...data.keys()].sort()) lines.push(`    ${q}${k}${q}: ${q}${data.get(k)}${q},`);
    lines.push('};');
    lines.push('');
    lines.push('/** requested candidate filename -> key in TWEMOJI_DATAURI */');
    lines.push('export const TWEMOJI_DATAURI_ALIAS = {');
    for (const k of [...alias.keys()].sort()) lines.push(`    ${q}${k}${q}: ${q}${alias.get(k)}${q},`);
    lines.push('};');
    lines.push('');
    await writeFile(dataUriOut, lines.join('\n'), 'utf8');
    console.log(`OK inlined ${inlined} emoji (${data.size} images) → ${dataUriOut}`);
}

async function copyFrom(src) {
    await mkdir(destDir, { recursive: true });
    await cp(src, destDir, { recursive: true, force: true });
}

function git(cmd, args, cwd = root) {
    const r = spawnSync(cmd, args, { encoding: 'utf8', cwd, stdio: 'pipe' });
    if (r.status !== 0) {
        throw new Error((r.stderr || r.stdout || `${cmd} ${args.join(' ')} failed`).trim());
    }
}

async function cloneTwemojiAssets() {
    const assets = join(cloneDir, 'assets', '72x72');
    if (await exists(join(assets, '1f333.png'))) return assets;

    await rm(cloneDir, { recursive: true, force: true });
    await mkdir(cloneDir, { recursive: true });
    git('git', ['clone', '--depth', '1', '--filter=blob:none', '--sparse', TWEMOJI_REPO, cloneDir]);
    git('git', ['sparse-checkout', 'set', 'assets/72x72'], cloneDir);

    if (!(await exists(join(assets, '1f333.png')))) {
        throw new Error('twemoji sparse clone missing assets/72x72');
    }
    return assets;
}

async function main() {
    console.log('=== vendor:emoji-images (Twemoji full 72x72) ===\n');
    await writeTwemojiLicense();
    console.log('OK Twemoji attribution written →', join(emojiVendorDir, 'LICENSE.txt'));
    if (await exists(npmSrc)) {
        await copyFrom(npmSrc);
        console.log('OK copied from node_modules/twemoji/assets/72x72 →', destDir);
        await writeDataUriModule();
        console.log('RESULT: PASS');
        return;
    }
    console.log('npm twemoji assets missing; cloning jdecked/twemoji (build-time, vendored offline)…');
    try {
        const src = await cloneTwemojiAssets();
        await copyFrom(src);
        console.log('OK copied twemoji assets →', destDir);
        await writeDataUriModule();
        console.log('RESULT: PASS');
    } catch (e) {
        console.warn('WARN:', e.message || e);
        try {
            accessSync(join(destDir, '1f333.png'));
            console.log('OK existing set kept at', destDir);
            await writeDataUriModule();
            console.log('RESULT: PASS (existing)');
            return;
        } catch {
            console.log('RESULT: SKIP (need git + network: npm run vendor:emoji)');
            process.exit(0);
        }
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
