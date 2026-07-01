#!/usr/bin/env node
/**
 * Benchmark Sage "hola" latency — native llama-server (desktop path).
 * Run: node scripts/bench-sage-hola.mjs
 */
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import {
  ensureChatModel,
  DEFAULT_CHAT_MODEL_ID,
  DEFAULT_CHAT_MODEL_FILE,
} from '../electron-llama-bin.cjs';
import {
  startServer,
  stopServer,
  chatCompletions,
  userDataDir,
} from '../electron-llama-chat.cjs';

const PROMPT = 'hola';
const SYSTEM = 'Eres el Búho Sabio. Responde en 1-2 frases cortas y amables en español.';
const MAX_TOKENS = 64;

function fmtMs(ms) {
  return `${(ms / 1000).toFixed(2)}s`;
}

async function benchNative() {
  const t0 = performance.now();
  const dataDir = userDataDir();
  console.log('=== Native llama.cpp (llama-server) ===');
  console.log('userData:', dataDir);

  const modelShorthand = `${DEFAULT_CHAT_MODEL_ID}:${DEFAULT_CHAT_MODEL_FILE}`;
  let tLoad = performance.now();
  const modelPath = await ensureChatModel(modelShorthand, dataDir, (p, msg) => {
    if (msg) process.stdout.write(`\r  ${msg}`);
    else if (typeof p === 'number') process.stdout.write(`\r  model ${Math.round(p * 100)}%`);
  });
  console.log(`\n  model ready: ${path.basename(modelPath)} (${fmtMs(performance.now() - tLoad)})`);

  tLoad = performance.now();
  await startServer(modelPath, (p, msg) => {
    if (msg) process.stdout.write(`\r  ${msg}`);
    else if (typeof p === 'number') process.stdout.write(`\r  binary ${Math.round(p * 100)}%`);
  });
  console.log(`\n  server ready (${fmtMs(performance.now() - tLoad)})`);

  const tWarm = performance.now();
  await chatCompletions({
    messages: [{ role: 'user', content: 'ping' }],
    systemPrompt: 'Reply with one word: ok',
    maxTokens: 8,
    temperature: 0.1,
    stream: false,
  });
  console.log(`  warm-up: ${fmtMs(performance.now() - tWarm)}`);

  const tChat = performance.now();
  const reply = await chatCompletions({
    messages: [{ role: 'user', content: PROMPT }],
    systemPrompt: SYSTEM,
    maxTokens: MAX_TOKENS,
    temperature: 0.6,
    stream: false,
  });
  const chatMs = performance.now() - tChat;
  console.log(`  "hola" reply in ${fmtMs(chatMs)}`);
  console.log(`  text: ${reply.slice(0, 160).replace(/\s+/g, ' ')}${reply.length > 160 ? '…' : ''}`);
  console.log(`  TOTAL (cold start included): ${fmtMs(performance.now() - t0)}`);
  stopServer();
  return chatMs;
}

async function main() {
  const nativeMs = await benchNative();
  console.log('\n=== Summary ===');
  console.log(`native llama-server "hola": ${fmtMs(nativeMs)}`);
  if (nativeMs > 15000) {
    console.warn('WARNING: native path still >15s — check CPU throttling or model on slow disk');
    process.exitCode = 1;
  } else {
    console.log('OK — native path within target (<15s for hola after warm-up)');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
