#!/usr/bin/env node
/**
 * Guard trunk mobile pan: navigating from touchend remounts the scroller mid-gesture
 * and leaves WebKit pan-y dead until later finger-drags.
 *
 * 1. useBindMobileTapRef must forward opts.clickOnly to bindMobileTap.
 * 2. Trunk row/knot taps that navigate must pass clickOnly: true.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const errors = [];

const hookPath = 'src/shared/ui/useBindMobileTap.js';
const hookSrc = readFileSync(join(ROOT, hookPath), 'utf8');
if (!/\{\s*slopPx,\s*clickOnly\s*\}/.test(hookSrc)) {
    errors.push(
        `${hookPath}: must forward { slopPx, clickOnly } into bindMobileTap (dropping clickOnly poisons trunk pan-y)`
    );
}

const trunkTapFiles = [
    'src/features/tree-graph/components/mobile/MobileChildRow.jsx',
    'src/features/tree-graph/components/mobile/MobileKnotRow.jsx',
];

for (const rel of trunkTapFiles) {
    const src = readFileSync(join(ROOT, rel), 'utf8');
    const calls = [...src.matchAll(/useBindMobileTapRef\s*\(([\s\S]*?)\)\s*;/g)];
    if (!calls.length) {
        errors.push(`${rel}: expected useBindMobileTapRef on trunk controls`);
        continue;
    }
    for (const m of calls) {
        const args = m[1];
        if (!/clickOnly\s*:\s*true/.test(args)) {
            errors.push(`${rel}: trunk useBindMobileTapRef must pass clickOnly: true\n  …${args.slice(0, 120).replace(/\s+/g, ' ')}`);
        }
    }
}

const navPath = 'src/stores/tree-graph-store-actions.js';
const navSrc = readFileSync(join(ROOT, navPath), 'utf8');
const navFn = navSrc.match(/export function navigateMobilePathAction\([\s\S]*?\n\}/);
if (!navFn || !/resetTrunkUserGesture\s*\(/.test(navFn[0])) {
    errors.push(
        `${navPath}: navigateMobilePathAction must call resetTrunkUserGesture before path remount sync`
    );
}

if (errors.length) {
    console.error('touch-scroll-safety failed:');
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
}
console.log('touch-scroll-safety: ok');
