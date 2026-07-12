#!/usr/bin/env node
/**
 * Voice asset status: mic reuses loaded Sage; TTS is Piper-only.
 * Run: node scripts/test-sage-voice-assets.mjs
 */
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const tmp = mkdtempSync(join(tmpdir(), 'arborito-voice-test-'));
process.env.ARBORITO_USER_DATA = tmp;

try {
  const modelsDir = join(tmp, 'llamacpp-models');
  mkdirSync(modelsDir, { recursive: true });
  const modelFile = 'gemma-4-E2B-it-qat-UD-Q2_K_XL.gguf';
  writeFileSync(join(modelsDir, modelFile), Buffer.alloc(2 * 1024 * 1024, 1));

  const { getVoiceAssetStatus } = require('../electron-sage-voice.js');
  const st = getVoiceAssetStatus('es');

  let fail = 0;
  const check = (ok, label) => {
    console.log(ok ? 'OK' : 'FAIL', label);
    if (!ok) fail++;
  };

  console.log('=== sage voice asset status (chat model present, server not running) ===\n');
  check(st.chatModelReady === true, 'chatModelReady');
  check(st.needsSttDownload === false, 'needsSttDownload false (no separate STT stack)');
  check(st.needsTtsDownload === true, 'needsTtsDownload (piper missing)');
  check(st.missingStt.includes('sage_not_running'), 'missingStt lists sage_not_running when model on disk');
  check(!st.missingStt.includes('chat_model'), 'missingStt does not ask chat_model again');
  check(!st.missingStt.includes('mtmd'), 'missingStt does not require mtmd-cli');

  console.log('\n' + (fail ? 'RESULT: FAIL' : 'RESULT: PASS'));
  process.exit(fail ? 1 : 0);
} finally {
  rmSync(tmp, { recursive: true, force: true });
  delete process.env.ARBORITO_USER_DATA;
}
