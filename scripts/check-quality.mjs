#!/usr/bin/env node
/**
 * CI quality gates — one entry point for GitHub Actions and local PR checks.
 *
 *   npm run check:quality
 *   npm run check:quality -- --only max-lines
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnRunOrExit } from './lib/spawn-run.mjs';

const CHECK = join(dirname(fileURLToPath(import.meta.url)), 'lib', 'check');

const STEPS = [
    ['react-architecture.mjs', []],
    ['react-ui-scope.mjs', []],
    ['store-bindings.mjs', []],
    ['modal-compliance.mjs', []],
    ['max-file-lines.mjs', []],
    ['css-conventions.mjs', []],
    ['directory-trigram.mjs', []],
];

const BY_NAME = Object.fromEntries(STEPS.map(([file]) => {
    const name = file.replace(/\.mjs$/, '').replace('max-file-lines', 'max-lines');
    return [name, [file, []]];
}));

const argv = process.argv.slice(2);
const onlyIdx = argv.indexOf('--only');
const only = onlyIdx >= 0 ? argv[onlyIdx + 1] : null;

let steps = STEPS;
if (only) {
    const step = BY_NAME[only];
    if (!step) {
        console.error(`Unknown --only ${only}. Choices: ${Object.keys(BY_NAME).join(', ')}`);
        process.exit(1);
    }
    steps = [step];
}

for (const [file, args] of steps) {
    spawnRunOrExit('node', [join(CHECK, file), ...args]);
}
