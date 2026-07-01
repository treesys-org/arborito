#!/usr/bin/env node
/**
 * Static checks for Electron native path (no Electron runtime required).
 * Run: node scripts/test-electron-llamacpp-static.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let fail = 0;

function check(name, ok, detail = '') {
  console.log(ok ? 'OK' : 'FAIL', name, detail ? `— ${detail}` : '');
  if (!ok) fail++;
}

const preload = readFileSync(join(root, 'preload.js'), 'utf8');
check('preload exposes llamacpp IPC', /llamacpp:\s*\{/.test(preload) && /arborito-llamacpp-status/.test(preload));

const ai = readFileSync(join(root, 'src/features/learning/api/ai.js'), 'utf8');
check('ai.js uses mustUseNativeLlamacpp', /mustUseNativeLlamacpp/.test(ai));
check('ai.js has no ai-worker import', !/ai-worker/.test(ai));

const bridge = readFileSync(join(root, 'src/features/learning/api/electron-bridge.js'), 'utf8');
check('electron-bridge detects Electron UA', /navigator\.userAgent/.test(bridge) && /mustUseNativeLlamacpp/.test(bridge));

const main = readFileSync(join(root, 'electron-main.js'), 'utf8');
check('electron-main registers llamacpp IPC', /registerLlamacppIpc/.test(main));

check('wllama vendor removed', !existsSync(join(root, 'vendor/wllama')));
check('ai-worker removed', !existsSync(join(root, 'src/features/learning/ai-worker.js')));

const pkg = readFileSync(join(root, 'package.json'), 'utf8');
check('package.json has no @wllama/wllama', !/"@wllama\/wllama"/.test(pkg));

console.log(fail ? '\nRESULT: FAIL' : '\nRESULT: PASS (static)');
console.log('Full runtime check: npm run test:electron-llamacpp');
process.exit(fail ? 1 : 0);
