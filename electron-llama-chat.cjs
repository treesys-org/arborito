'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const {
  resolveUserDataDir,
  ensureLlamaServerBinary,
  ensureChatModel,
  spawnEnvForBinary,
  defaultThreadCount,
  defaultPromptBatchSize,
  beginDownloadSession,
  abortActiveDownload,
  clearDownloadSession,
  clearChatModels,
  DEFAULT_CHAT_MODEL,
} = require('./electron-llama-bin.cjs');

const SERVER_PORT = 8765;
const SERVER_HOST = '127.0.0.1';
const SERVER_OPTS = 'lfm-direct-v1';

/** @type {import('child_process').ChildProcess|null} */
let serverProc = null;
let serverModelPath = null;
let serverModelKey = null;
let serverReady = false;
/** True only while llama-server is running with the Vulkan build + GPU layers. */
let serverVulkanActive = false;
/** @type {AbortController|null} */
let activeChatAbort = null;

function getAppRef() {
  try { return require('electron').app; } catch (_) { return null; }
}

function userDataDir() {
  return resolveUserDataDir(getAppRef());
}

function serverBaseUrl() {
  return `http://${SERVER_HOST}:${SERVER_PORT}`;
}

function stopServer() {
  serverReady = false;
  serverModelPath = null;
  serverModelKey = null;
  serverVulkanActive = false;
  if (serverProc) {
    try { serverProc.kill('SIGTERM'); } catch (_) {}
    serverProc = null;
  }
}

async function waitForServer(timeoutMs = 180000, signal) {
  const deadline = Date.now() + timeoutMs;
  let delay = 500;
  while (Date.now() < deadline) {
    if (signal?.aborted) {
      const err = new Error('Aborted');
      err.name = 'AbortError';
      throw err;
    }
    try {
      const res = await fetch(`${serverBaseUrl()}/health`, { signal: AbortSignal.timeout(3000) });
      if (res.status === 200) {
        serverReady = true;
        return true;
      }
    } catch (_) {}
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(2500, Math.round(delay * 1.35));
  }
  throw new Error('llama-server did not become ready in time');
}

/**
 * Spawn llama-server. If Vulkan was requested and startup fails, retry once on CPU
 * so the UI can report the real backend in use.
 */
async function startServer(modelPath, modelKey, onProgress, nCtx = 6144, signal, opts = {}) {
  const ctx = Math.max(2048, Math.min(32768, Number(nCtx) || 6144));
  const { isLlamaVulkanSupportedPlatform } = require('./electron-llama-bin.cjs');
  const wantVulkan = !!(opts.vulkan && isLlamaVulkanSupportedPlatform());

  const tryStart = async (useVulkan) => {
    const key = `${modelKey || path.basename(modelPath)}:${ctx}:${SERVER_OPTS}:vk=${useVulkan ? 1 : 0}`;
    if (serverProc && serverReady && serverModelKey === key && serverVulkanActive === useVulkan) {
      return useVulkan;
    }

    stopServer();
    if (signal?.aborted) {
      const err = new Error('Aborted');
      err.name = 'AbortError';
      throw err;
    }
    const bin = await ensureLlamaServerBinary(userDataDir(), onProgress, signal, { vulkan: useVulkan });
    if (signal?.aborted) {
      const err = new Error('Aborted');
      err.name = 'AbortError';
      throw err;
    }
    const args = [
      '-m', modelPath,
      '--host', SERVER_HOST,
      '--port', String(SERVER_PORT),
      '-c', String(ctx),
      '-t', String(defaultThreadCount()),
      '-b', String(defaultPromptBatchSize()),
      '-np', '1',
      '--jinja',
      '--reasoning', 'off',
      '--reasoning-budget', '0',
      '--chat-template-kwargs', '{"enable_thinking":false,"reasoning_budget":0}',
      '-ngl', useVulkan ? '99' : '0',
    ];

    let spawnErr = '';
    serverProc = spawn(bin, args, {
      env: spawnEnvForBinary(bin),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    serverModelPath = modelPath;
    serverModelKey = key;
    serverVulkanActive = false;

    serverProc.stderr.on('data', (d) => {
      const s = String(d);
      spawnErr += s;
      if (/error/i.test(s) && !/slot|prompt|load/i.test(s)) console.warn('[llama-server]', s.trim());
    });
    serverProc.on('exit', () => {
      serverReady = false;
      serverVulkanActive = false;
      serverProc = null;
    });

    try {
      if (signal?.aborted) {
        stopServer();
        const err = new Error('Aborted');
        err.name = 'AbortError';
        throw err;
      }
      await waitForServer(180000, signal);
      serverVulkanActive = useVulkan;
      return useVulkan;
    } catch (e) {
      stopServer();
      if (e && e.name === 'AbortError') throw e;
      const detail = spawnErr.trim().slice(0, 240);
      const err = new Error(
        detail
          ? `llama-server failed (${useVulkan ? 'Vulkan' : 'CPU'}): ${detail}`
          : String(e && e.message ? e.message : e)
      );
      err.cause = e;
      throw err;
    }
  };

  try {
    return await tryStart(wantVulkan);
  } catch (e) {
    if (!wantVulkan || (e && e.name === 'AbortError')) throw e;
    console.warn('[llama-server] Vulkan start failed; falling back to CPU.', e && e.message ? e.message : e);
    if (onProgress) onProgress(null, 'Vulkan unavailable : using CPU…');
    return await tryStart(false);
  }
}

/** Quita bloques de razonamiento del texto del modelo. */
function stripModelText(txt) {
  let t = String(txt != null ? txt : '');
  t = t.replace(/▌$/g, '');
  t = t.replace(/<think>[\s\S]*?<\/redacted_thinking>/gi, '');
  t = t.replace(/<think>[\s\S]*$/i, '');
  t = t.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '');
  t = t.replace(/<\|channel\|>\s*thought[\s\S]*?(<\|channel\|>\s*final\b)?/gi, '');
  t = t.replace(/<\|channel\|>\s*final\b/gi, '');
  t = t.replace(/<unused\d*>/gi, '');
  t = t.replace(/<\|[^|>]*\|>/g, '');
  return t.trim();
}

function buildApiMessages(messages, systemPrompt) {
  const apiMessages = [];
  if (systemPrompt) apiMessages.push({ role: 'system', content: String(systemPrompt) });
  for (const m of messages || []) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) continue;
    let content = stripModelText(String(m.content || ''));
    if (!content && m.role === 'assistant') continue;
    apiMessages.push({ role: m.role, content });
  }
  return apiMessages;
}

async function chatCompletions({ messages, systemPrompt, maxTokens, temperature, topP, stream, onToken, sender }) {
  const body = {
    model: 'local',
    messages: buildApiMessages(messages, systemPrompt),
    max_tokens: Math.max(32, Math.min(4096, Number(maxTokens) || 512)),
    temperature: Number.isFinite(temperature) ? temperature : 0.6,
    top_p: Number.isFinite(topP) ? topP : 0.92,
    stream: !!stream,
    cache_prompt: true,
    chat_template_kwargs: { enable_thinking: false, reasoning_budget: 0 },
  };

  activeChatAbort = new AbortController();
  const res = await fetch(`${serverBaseUrl()}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: activeChatAbort.signal,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`llama-server HTTP ${res.status}${errText ? `: ${errText.slice(0, 200)}` : ''}`);
  }

  if (!stream) {
    const json = await res.json();
    return stripModelText(json?.choices?.[0]?.message?.content || '');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = '';
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const piece = JSON.parse(payload)?.choices?.[0]?.delta?.content || '';
        if (!piece) continue;
        full += piece;
        const visible = stripModelText(full);
        if (typeof onToken === 'function') onToken(visible);
        if (sender && !sender.isDestroyed()) {
          try { sender.send('arborito-llamacpp-token', { text: visible }); } catch (_) {}
        }
      } catch (_) {}
    }
  }
  activeChatAbort = null;
  return stripModelText(full);
}

function registerLlamacppIpc(ipcMain, isTrustedRenderer) {
  ipcMain.handle('arborito-llamacpp-status', async (event) => {
    if (!isTrustedRenderer(event)) return { available: false, error: 'Untrusted caller' };
    try {
      const platform = require('./electron-llama-bin.cjs').detectPlatformKey();
      if (!platform) return { available: false, error: 'Unsupported platform' };
      const { isLlamaVulkanSupportedPlatform } = require('./electron-llama-bin.cjs');
      return {
        available: true,
        engine: 'llama-server',
        ready: serverReady,
        modelPath: serverModelPath,
        modelFile: serverModelPath ? path.basename(serverModelPath) : null,
        port: SERVER_PORT,
        vulkanSupported: isLlamaVulkanSupportedPlatform(),
        /** Actual backend of the running server (false if not ready / CPU). */
        vulkanActive: !!(serverReady && serverVulkanActive),
      };
    } catch (e) {
      return { available: false, error: String(e && e.message ? e.message : e) };
    }
  });

  ipcMain.handle('arborito-llamacpp-load', async (event, opts = {}) => {
    if (!isTrustedRenderer(event)) return { ok: false, error: 'Untrusted caller' };
    const sender = event.sender;
    const onProgress = (progress, message) => {
      try { sender.send('arborito-llamacpp-progress', { progress, message }); } catch (_) {}
    };
    const signal = beginDownloadSession();
    const modelKey = String(opts.model || '').trim() || DEFAULT_CHAT_MODEL;
    try {
      stopServer();
      const modelPath = await ensureChatModel(modelKey, userDataDir(), (p, msg) => {
        onProgress(typeof p === 'number' ? p * 0.88 : null, msg || null);
      }, signal);
      onProgress(0.9, 'Loading model…');
      const nCtx = Math.max(2048, Math.min(32768, Number(opts.nCtx) || 6144));
      const vulkanActive = await startServer(
        modelPath,
        modelKey,
        (p, msg) => onProgress(typeof p === 'number' ? p : null, msg || null),
        nCtx,
        signal,
        { vulkan: !!opts.vulkan }
      );
      clearDownloadSession();
      return {
        ok: true,
        modelPath,
        modelFile: path.basename(modelPath),
        modelKey,
        vulkanActive: !!vulkanActive,
      };
    } catch (e) {
      clearDownloadSession();
      stopServer();
      if (e && e.name === 'AbortError') return { ok: false, error: 'Aborted' };
      return { ok: false, error: String(e && e.message ? e.message : e) };
    }
  });

  ipcMain.handle('arborito-llamacpp-chat', async (event, opts = {}) => {
    if (!isTrustedRenderer(event)) return { ok: false, error: 'Untrusted caller' };
    try {
      if (!serverReady || !serverModelPath) {
        return { ok: false, error: 'Model not loaded : call load first' };
      }
      const text = await chatCompletions({
        messages: opts.messages || [],
        systemPrompt: opts.systemPrompt || '',
        maxTokens: opts.maxTokens,
        temperature: opts.temperature,
        topP: opts.topP,
        stream: !!opts.stream,
        sender: event.sender,
      });
      return { ok: true, text };
    } catch (e) {
      if (e && e.name === 'AbortError') return { ok: false, error: 'Aborted' };
      return { ok: false, error: String(e && e.message ? e.message : e) };
    }
  });

  ipcMain.handle('arborito-llamacpp-abort', async (event) => {
    if (!isTrustedRenderer(event)) return { ok: false };
    abortActiveDownload();
    if (activeChatAbort) {
      try { activeChatAbort.abort(); } catch (_) {}
      activeChatAbort = null;
    }
    /* Also stop llama-server so Cancel works while the model is loading into memory. */
    stopServer();
    return { ok: true };
  });

  ipcMain.handle('arborito-llamacpp-clear-models', async (event) => {
    if (!isTrustedRenderer(event)) return { ok: false, error: 'Untrusted caller' };
    try {
      abortActiveDownload();
      stopServer();
      return clearChatModels(userDataDir());
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e) };
    }
  });
}

module.exports = {
  registerLlamacppIpc,
  stopServer,
  startServer,
  ensureChatModel,
  ensureLlamaServerBinary,
  chatCompletions,
  isServerReady: () => serverReady && !!serverModelPath,
  userDataDir,
  SERVER_PORT,
};
