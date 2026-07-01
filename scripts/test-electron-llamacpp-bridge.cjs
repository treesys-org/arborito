#!/usr/bin/env node
'use strict';

/**
 * Headless Electron check: preload exposes llamacpp and renderer uses native path.
 * Run: npm run test:electron-llamacpp
 */
const { spawnSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const electronBin = require('electron');
const env = { ...process.env, ARBORITO_TEST_LLAMACPP: '1' };

const result = spawnSync(electronBin, ['.'], {
  cwd: root,
  env,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
  timeout: 120000,
});

const out = `${result.stdout || ''}${result.stderr || ''}`;
process.stdout.write(out);
if (result.status !== 0) {
  process.exit(result.status == null ? 1 : result.status);
}

if (!/RESULT: PASS/.test(out)) {
  console.error('FAIL: expected RESULT: PASS in Electron test output');
  process.exit(1);
}
