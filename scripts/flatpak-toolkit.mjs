#!/usr/bin/env node
/**
 * Flatpak maintainer commands (preflight, rebundle, verify, diagnose).
 *
 *   npm run flatpak -- setup
 *   npm run flatpak -- rebundle [bundle.flatpak]
 *   npm run flatpak -- verify [bundle.flatpak]
 *   npm run flatpak -- diagnose
 *   npm run flatpak -- test-launcher [bundle.flatpak]
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnRunOrExit } from './lib/spawn-run.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const LIB = join(ROOT, 'lib', 'flatpak');

const USAGE = `Usage: node scripts/flatpak-toolkit.mjs <command> [args…]

Commands:
  setup          preflight + install runtime refs
  preflight      check host flatpak toolchain
  rebundle       export desktop/icons for GNOME Software
  verify         validate bundle contents
  diagnose       inspect installed launcher paths
  test-launcher  verify + diagnose on a bundle
`;

const COMMANDS = {
    setup: { script: 'preflight.mjs', args: ['--install'] },
    preflight: { script: 'preflight.mjs', args: [] },
    rebundle: { script: 'rebundle.mjs', args: [] },
    verify: { script: 'verify-bundle.mjs', args: [] },
    diagnose: { script: 'diagnose-launcher.mjs', args: [] },
    'test-launcher': { script: 'test-launcher.mjs', args: [] },
};

const cmd = process.argv[2];
const extra = process.argv.slice(3);

if (!cmd || !COMMANDS[cmd]) {
    console.error(USAGE);
    process.exit(cmd ? 1 : 0);
}

const { script, args } = COMMANDS[cmd];
spawnRunOrExit('node', [join(LIB, script), ...args, ...extra]);
