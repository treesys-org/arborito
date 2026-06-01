/**
 * Electron **main process** (not to confuse with `src/main.js`, the renderer entry).
 *
 * Responsibilities:
 *   1. Create the BrowserWindow and load `index.html`.
 *   2. Expose `arborito-fetch-url` IPC (bypasses renderer CORS for `file://` apps).
 *   3. Expose `arborito-llamacpp-*` IPC (native llama.cpp inference via `node-llama-cpp`).
 *      The browser ships wllama (WebAssembly llama.cpp); the desktop ships native llama.cpp
 *      so users get GPU acceleration (Metal / CUDA / Vulkan) when available.
 *
 * Notes on what we deliberately do NOT do here:
 *   • COOP / COEP injection. Under `file://` we cannot reach `crossOriginIsolated`
 *     anyway (siblings have no CORP headers), so SharedArrayBuffer is unavailable;
 *     in exchange we keep the page loadable. The desktop build relies on native
 *     llama.cpp via IPC, which does not need SAB. The HTTP / GitHub Pages build
 *     gets its COOP / COEP from the `coi-serviceworker` shim in the renderer.
 *   • Service worker registration is cleared on startup to ensure no stale shim
 *     (from a previous run that briefly served over http://localhost, etc.)
 *     intercepts the file:// navigation and silently fails with ERR_FAILED.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, session, Menu, ipcMain } = require('electron');

// Disable Chromium's OS-level sandbox.
//
// Why: Arborito ships as an AppImage / .deb and is regularly run from container
// environments (Fedora `toolbx` / rootless podman, distrobox, Flatpak `host`
// sandboxes). Those environments do NOT expose the user / PID / mount namespaces
// that the `chrome-sandbox` helper needs, so the renderer process exits before
// it can even read `index.html` and `BrowserWindow.loadFile()` fails with the
// (very unhelpful) `ERR_FAILED`. Symptom: a window opens but stays blank.
//
// The trade-off is acceptable for this app because the renderer is already
// locked down by `webPreferences`:
//   • `contextIsolation: true`  — no shared globals with main process
//   • `nodeIntegration: false`  — renderer has no Node API
//   • IPC handlers verify `event.senderFrame.url.startsWith('file://')`
//   • The app only loads its own bundled files (file://)
// In other words, removing the OS sandbox doesn't widen the attack surface that
// matters for a curriculum reader that doesn't execute remote code.
app.commandLine.appendSwitch('no-sandbox');

function isTrustedRenderer(event) {
  try {
    // We only ever load our app from a local file (loadFile).
    // If some other origin manages to run and call IPC, refuse.
    const url = typeof event?.senderFrame?.url === 'string' ? event.senderFrame.url : '';
    return url.startsWith('file://');
  } catch {
    return false;
  }
}

/**
 * Curriculum / manifest fetches from a `file://` renderer hit browser CORS (opaque origin).
 * Node fetch in the main process is not subject to that restriction.
 */
function registerFetchIpc() {
  ipcMain.handle('arborito-fetch-url', async (_event, urlString, options = {}) => {
    const event = _event;
    if (!isTrustedRenderer(event)) {
      return { ok: false, error: 'Untrusted caller' };
    }
    const timeoutMs = typeof options.timeoutMs === 'number' ? options.timeoutMs : 20000;
    const maxBytes = typeof options.maxBytes === 'number' ? options.maxBytes : 5 * 1024 * 1024; // 5MB default
    let parsed;
    try {
      parsed = new URL(urlString);
    } catch {
      return { ok: false, error: 'Invalid URL' };
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, error: 'Only http(s) URLs are allowed' };
    }
    if (parsed.username || parsed.password) {
      return { ok: false, error: 'Credentials in URL are not allowed' };
    }
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(urlString, {
        signal: ac.signal,
        redirect: 'follow',
        cache: 'no-store',
        headers: { Accept: 'application/json, text/plain, */*', 'User-Agent': 'Arborito-Electron/1.0' }
      });
      if (!res.ok) {
        return { ok: false, error: `HTTP ${res.status}` };
      }
      const len = Number(res.headers.get('content-length') || '0');
      if (Number.isFinite(len) && len > 0 && len > maxBytes) {
        return { ok: false, error: 'Response too large' };
      }
      const text = await res.text();
      if (text.length > maxBytes) {
        return { ok: false, error: 'Response too large' };
      }
      return { ok: true, text };
    } catch (e) {
      const name = e && e.name;
      if (name === 'AbortError') {
        return { ok: false, error: 'Request timed out' };
      }
      return { ok: false, error: String(e && e.message ? e.message : e) };
    } finally {
      clearTimeout(timer);
    }
  });
}

// ---------------------------------------------------------------------------
// Native llama.cpp integration (desktop only)
//
// `node-llama-cpp` is an optional dependency: if it failed to install for the
// host platform we silently fall back to wllama in the renderer. The renderer
// must always call `arborito-llamacpp-status` first and switch providers based
// on `available`.
//
// Model files live at `<userData>/llamacpp-models/*.gguf`. Settings live at
// `<userData>/arborito-llamacpp.json` (written via `arborito-llamacpp-settings-write`).
// ---------------------------------------------------------------------------

const LLAMACPP_STATE = {
  loadedModule: null,        // ES module exports (lazy)
  loadError: null,           // string if the module failed to import
  llama: null,               // node-llama-cpp `Llama` instance
  model: null,               // loaded LlamaModel
  context: null,             // LlamaContext
  currentModelPath: null,
  currentModelFile: null,
};

function llamacppModelsDir() {
  return path.join(app.getPath('userData'), 'llamacpp-models');
}

function llamacppSettingsPath() {
  return path.join(app.getPath('userData'), 'arborito-llamacpp.json');
}

function ensureLlamacppDirs() {
  const dir = llamacppModelsDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function loadLlamacppModule() {
  if (LLAMACPP_STATE.loadedModule) return LLAMACPP_STATE.loadedModule;
  if (LLAMACPP_STATE.loadError) return null;
  try {
    // ESM-only package; CommonJS dynamic import works in Electron main.
    const mod = await import('node-llama-cpp');
    LLAMACPP_STATE.loadedModule = mod;
    return mod;
  } catch (e) {
    LLAMACPP_STATE.loadError = e && e.message ? String(e.message) : String(e);
    console.warn('[Arborito] node-llama-cpp not available:', LLAMACPP_STATE.loadError);
    return null;
  }
}

async function downloadModelTo(url, destPath, onProgress) {
  const ac = new AbortController();
  let res;
  try {
    res = await fetch(url, { signal: ac.signal, redirect: 'follow' });
  } catch (e) {
    throw new Error(`Download failed: ${e && e.message ? e.message : e}`);
  }
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  const total = Number(res.headers.get('content-length') || '0');
  const tmpPath = destPath + '.part';
  const out = fs.createWriteStream(tmpPath);
  let received = 0;
  const reader = res.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    out.write(Buffer.from(value));
    received += value.length;
    if (onProgress && total > 0) onProgress(received / total);
  }
  out.end();
  await new Promise((r) => out.on('close', r));
  fs.renameSync(tmpPath, destPath);
}

async function ensureModelOnDisk(modelId, modelFile, onProgress) {
  const dir = ensureLlamacppDirs();
  const destPath = path.join(dir, modelFile);
  if (fs.existsSync(destPath) && fs.statSync(destPath).size > 0) return destPath;
  const url = `https://huggingface.co/${modelId}/resolve/main/${modelFile}`;
  await downloadModelTo(url, destPath, onProgress);
  return destPath;
}

async function disposeLlamacpp() {
  try {
    if (LLAMACPP_STATE.context) await LLAMACPP_STATE.context.dispose();
  } catch (_) {}
  try {
    if (LLAMACPP_STATE.model) await LLAMACPP_STATE.model.dispose();
  } catch (_) {}
  LLAMACPP_STATE.context = null;
  LLAMACPP_STATE.model = null;
  LLAMACPP_STATE.currentModelPath = null;
  LLAMACPP_STATE.currentModelFile = null;
}

function registerLlamacppIpc() {
  ipcMain.handle('arborito-llamacpp-status', async (_event) => {
    if (!isTrustedRenderer(_event)) return { ok: false, error: 'Untrusted caller' };
    const mod = await loadLlamacppModule();
    return {
      ok: true,
      available: !!mod,
      loadError: LLAMACPP_STATE.loadError,
      modelLoaded: !!LLAMACPP_STATE.model,
      currentModelFile: LLAMACPP_STATE.currentModelFile
    };
  });

  ipcMain.handle('arborito-llamacpp-settings-write', (_event, settings) => {
    if (!isTrustedRenderer(_event)) return { ok: false, error: 'Untrusted caller' };
    try {
      ensureLlamacppDirs();
      fs.writeFileSync(llamacppSettingsPath(), JSON.stringify(settings || {}, null, 2), 'utf8');
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e) };
    }
  });

  ipcMain.handle('arborito-llamacpp-load', async (event, opts) => {
    if (!isTrustedRenderer(event)) return { ok: false, error: 'Untrusted caller' };
    const mod = await loadLlamacppModule();
    if (!mod) return { ok: false, error: LLAMACPP_STATE.loadError || 'node-llama-cpp unavailable' };

    const modelId = String((opts && opts.modelId) || 'bartowski/Llama-3.2-1B-Instruct-GGUF');
    const modelFile = String((opts && opts.modelFile) || 'Llama-3.2-1B-Instruct-Q4_K_M.gguf');
    const contextSize = Number((opts && opts.contextSize) || 4096);
    const gpuLayers = (opts && opts.gpuLayers != null) ? Number(opts.gpuLayers) : undefined;

    const sender = event.sender;
    const reportProgress = (phase, progress, message) => {
      try {
        sender.send('arborito-llamacpp-progress', { phase, progress, message });
      } catch (_) {}
    };

    try {
      // Reuse the loaded model if it matches.
      const wantedPath = path.join(llamacppModelsDir(), modelFile);
      if (LLAMACPP_STATE.model && LLAMACPP_STATE.currentModelPath === wantedPath) {
        reportProgress('ready', 1, 'Model already loaded');
        return { ok: true, modelFile, alreadyLoaded: true };
      }

      reportProgress('download', 0, `Preparing ${modelFile}`);
      const modelPath = await ensureModelOnDisk(modelId, modelFile, (p) => {
        reportProgress('download', p, null);
      });

      await disposeLlamacpp();

      reportProgress('prepare', 0.1, 'Initializing llama.cpp');
      LLAMACPP_STATE.llama = LLAMACPP_STATE.llama || (await mod.getLlama());

      reportProgress('prepare', 0.4, 'Loading model weights');
      LLAMACPP_STATE.model = await LLAMACPP_STATE.llama.loadModel({
        modelPath,
        ...(gpuLayers != null ? { gpuLayers } : {})
      });

      reportProgress('prepare', 0.85, 'Creating inference context');
      LLAMACPP_STATE.context = await LLAMACPP_STATE.model.createContext({
        contextSize: Number.isFinite(contextSize) ? contextSize : 4096
      });

      LLAMACPP_STATE.currentModelPath = modelPath;
      LLAMACPP_STATE.currentModelFile = modelFile;
      reportProgress('ready', 1, 'Model ready');
      return { ok: true, modelFile };
    } catch (e) {
      const msg = String(e && e.message ? e.message : e);
      await disposeLlamacpp();
      reportProgress('error', 0, msg);
      return { ok: false, error: msg };
    }
  });

  ipcMain.handle('arborito-llamacpp-chat', async (event, opts) => {
    if (!isTrustedRenderer(event)) return { ok: false, error: 'Untrusted caller' };
    const mod = await loadLlamacppModule();
    if (!mod) return { ok: false, error: LLAMACPP_STATE.loadError || 'node-llama-cpp unavailable' };
    if (!LLAMACPP_STATE.model || !LLAMACPP_STATE.context) {
      return { ok: false, error: 'Model not loaded. Call arborito-llamacpp-load first.' };
    }

    const sessionId = String((opts && opts.sessionId) || ('s_' + Date.now()));
    const messages = Array.isArray(opts && opts.messages) ? opts.messages : [];
    const systemPrompt = typeof (opts && opts.systemPrompt) === 'string' ? opts.systemPrompt : '';
    const maxTokens = Number((opts && opts.maxTokens) || 512);
    const temperature = Number((opts && opts.temperature) != null ? opts.temperature : 0.2);

    if (!messages.length) return { ok: false, error: 'No messages' };

    const sender = event.sender;

    try {
      const sequence = LLAMACPP_STATE.context.getSequence();
      const session = new mod.LlamaChatSession({
        contextSequence: sequence,
        systemPrompt: systemPrompt || undefined
      });

      // Replay non-last messages as conversation history (load into the chat session).
      // We pass all but the last user message; the last user message is the prompt.
      const last = messages[messages.length - 1];
      const lastText = last && typeof last.content === 'string' ? last.content : '';
      const history = messages.slice(0, -1).map((m) => {
        if (m && m.role === 'user') return { type: 'user', text: String(m.content || '') };
        if (m && m.role === 'assistant') return { type: 'model', response: [String(m.content || '')] };
        return null;
      }).filter(Boolean);
      if (history.length) {
        try { session.setChatHistory(history); } catch (_) {}
      }

      const answer = await session.prompt(lastText, {
        maxTokens: Number.isFinite(maxTokens) ? maxTokens : 512,
        temperature: Number.isFinite(temperature) ? temperature : 0.2,
        onTextChunk: (chunk) => {
          try {
            sender.send('arborito-llamacpp-token', { sessionId, token: String(chunk || '') });
          } catch (_) {}
        }
      });

      try { sequence.dispose(); } catch (_) {}
      return { ok: true, text: String(answer || '') };
    } catch (e) {
      const msg = String(e && e.message ? e.message : e);
      return { ok: false, error: msg };
    }
  });

}

function createWindow() {
  const iconPath = path.join(__dirname, 'icon.png');
  const winOpts = {
    width: 1280,
    height: 800,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      // `sandbox: false` so the preload script can `require('electron')` to set
      // up the `contextBridge` IPC. With contextIsolation the renderer itself
      // still runs in a separate JS world without Node API access.
      sandbox: false,
    },
  };
  if (fs.existsSync(iconPath)) {
    winOpts.icon = iconPath;
  }
  const mainWindow = new BrowserWindow(winOpts);

  // Surface load failures to stdout so users running `npm start` get an actionable
  // message instead of the generic `Failed to load URL … with error: ERR_FAILED`.
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return; // sub-resource failures are tracked separately by the renderer console
    console.error(
      `[Arborito] Failed to load ${validatedURL} (code ${errorCode}: ${errorDescription}).\n` +
      `  Hints:\n` +
      `   • Did 'npm run build:css' produce src/shared/styles/main.css?\n` +
      `   • If you are inside a container (toolbx / podman / distrobox / Flatpak), the OS sandbox\n` +
      `     is already disabled by --no-sandbox; check that the file actually exists.\n` +
      `   • Open DevTools (Ctrl+Shift+I) for renderer-side errors.`
    );
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error(`[Arborito] Renderer process gone: reason=${details.reason} exitCode=${details.exitCode}`);
  });

  mainWindow.loadFile('index.html');
}

/**
 * Clear any service workers persisted in the user-data dir from previous runs.
 *
 * Why: if Arborito was ever opened over `http://localhost` (during development)
 * the `coi-serviceworker` shim registers and persists. The next time the user
 * runs the desktop app, Chromium re-activates that service worker even under
 * `file://`, intercepts the top-level navigation to `index.html`, and — because
 * its `fetch()` to a file:// URL throws — silently fails the page load with the
 * generic `ERR_FAILED`. Wiping the SW registrations on every startup is cheap
 * and guarantees a clean slate.
 */
async function clearStaleServiceWorkers() {
  try {
    await session.defaultSession.clearStorageData({ storages: ['serviceworkers'] });
  } catch (e) {
    // Non-fatal: log and continue. If the session can't be cleared, the worst
    // case is the SW intercepts and the user sees the same ERR_FAILED again,
    // which is already covered by the did-fail-load diagnostic below.
    console.warn('[Arborito] Could not clear stale service workers:', e && e.message ? e.message : e);
  }
}

app.whenReady().then(async () => {
  await clearStaleServiceWorkers();
  registerFetchIpc();
  registerLlamacppIpc();
  Menu.setApplicationMenu(null);
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async () => {
  await disposeLlamacpp();
});
