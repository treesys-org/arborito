#!/usr/bin/env node
/** Verify Wine is available for NSIS builds on Linux. */
import { spawnSync } from 'node:child_process';

function has(cmd) {
    return spawnSync('which', [cmd], { encoding: 'utf8' }).status === 0;
}

if (has('wine')) {
    const ver = spawnSync('wine', ['--version'], { encoding: 'utf8' });
    console.log('[preflight-wine] OK : ', (ver.stdout || ver.stderr || 'wine').trim().split('\n')[0]);
    process.exit(0);
}

console.error(`[preflight-wine] Wine not found (required for .exe on Linux).

Fedora:
  sudo dnf install wine

Debian/Ubuntu:
  sudo apt install wine

Then re-run: npm run release:build
`);
process.exit(1);
