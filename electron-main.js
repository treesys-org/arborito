/**
 * Electron main process — BrowserWindow, fetch IPC, native llama.cpp chat, Sage voice.
 * Browser: Expert API or no local chat; Electron uses llama-server in main.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, session, Menu, ipcMain, nativeTheme } = require('electron');
const { registerSageVoiceIpc } = require('./electron-sage-voice.js');
const { registerLlamacppIpc, stopServer } = require('./electron-llama-chat.cjs');
const { registerUserDataIpc } = require('./electron-user-data.cjs');

app.commandLine.appendSwitch('no-sandbox');

function isTrustedRenderer(event) {
  try {
    const url = typeof event?.senderFrame?.url === 'string' ? event.senderFrame.url : '';
    return url.startsWith('file://');
  } catch {
    return false;
  }
}

/** OS light/dark theme bridge. `nativeTheme` lives in the main process only, so
 * the preload asks for it over IPC (sync get + push on change). */
function registerSystemThemeIpc() {
  const current = () => (nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
  ipcMain.on('arborito-system-theme-get', (event) => {
    try {
      event.returnValue = current();
    } catch (_) {
      event.returnValue = 'light';
    }
  });
  nativeTheme.on('updated', () => {
    let theme;
    try {
      theme = current();
    } catch (_) {
      return;
    }
    for (const win of BrowserWindow.getAllWindows()) {
      try {
        win.webContents.send('arborito-system-theme-changed', theme);
      } catch (_) {
        /* window gone */
      }
    }
  });
}

function registerWindowCloseIpc() {
  ipcMain.handle('arborito-window-close-decision', (event, decision) => {
    if (!isTrustedRenderer(event)) return;
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return;
    if (decision === 'proceed') {
      win.__arboritoAllowClose = true;
      win.close();
    }
  });
}

function attachWindowCloseGuard(mainWindow) {
  mainWindow.on('close', (e) => {
    if (mainWindow.__arboritoAllowClose || process.env.ARBORITO_TEST_LLAMACPP === '1') return;
    e.preventDefault();
    try {
      mainWindow.webContents.send('arborito-window-close-request');
    } catch (_) {
      /* ignore */
    }
  });
}

function registerFetchIpc() {
  ipcMain.handle('arborito-fetch-url', async (_event, urlString, options = {}) => {
    const event = _event;
    if (!isTrustedRenderer(event)) {
      return { ok: false, error: 'Untrusted caller' };
    }
    const timeoutMs = typeof options.timeoutMs === 'number' ? options.timeoutMs : 20000;
    const maxBytes = typeof options.maxBytes === 'number' ? options.maxBytes : 5 * 1024 * 1024;
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
        headers: { Accept: 'application/json, text/plain, */*', 'User-Agent': 'Arborito-Electron/1.0' },
      });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const len = Number(res.headers.get('content-length') || '0');
      if (Number.isFinite(len) && len > 0 && len > maxBytes) {
        return { ok: false, error: 'Response too large' };
      }
      const text = await res.text();
      if (text.length > maxBytes) return { ok: false, error: 'Response too large' };
      return { ok: true, text };
    } catch (e) {
      if (e && e.name === 'AbortError') return { ok: false, error: 'Request timed out' };
      return { ok: false, error: String(e && e.message ? e.message : e) };
    } finally {
      clearTimeout(timer);
    }
  });
}

function createWindow() {
  const iconPath = path.join(__dirname, 'icon.png');
  const startMaximized = process.env.ARBORITO_TEST_LLAMACPP !== '1';
  const winOpts = {
    width: 1280,
    height: 800,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0a1e16' : '#ecfdf5',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      sandbox: false,
    },
  };
  if (fs.existsSync(iconPath)) winOpts.icon = iconPath;
  const mainWindow = new BrowserWindow(winOpts);
  mainWindow.__arboritoAllowClose = false;
  attachWindowCloseGuard(mainWindow);

  const notifyRendererResize = () => {
    if (mainWindow.isDestroyed()) return;
    try { mainWindow.webContents.invalidate(); } catch (_) {}
    mainWindow.webContents.send('arborito-window-resized');
  };
  mainWindow.on('resize', notifyRendererResize);
  mainWindow.on('resized', notifyRendererResize);
  mainWindow.on('maximize', notifyRendererResize);
  mainWindow.on('unmaximize', notifyRendererResize);
  mainWindow.on('enter-full-screen', notifyRendererResize);
  mainWindow.on('leave-full-screen', notifyRendererResize);
  mainWindow.once('ready-to-show', () => {
    if (startMaximized) {
      try { mainWindow.maximize(); } catch (_) {}
    }
    if (process.env.ARBORITO_TEST_LLAMACPP !== '1') {
      mainWindow.show();
    }
    notifyRendererResize();
    setTimeout(notifyRendererResize, 0);
    setTimeout(notifyRendererResize, 50);
    setTimeout(notifyRendererResize, 120);
  });

  mainWindow.webContents.on('did-finish-load', () => {
    notifyRendererResize();
    setTimeout(notifyRendererResize, 0);
    setTimeout(notifyRendererResize, 50);
    setTimeout(notifyRendererResize, 200);
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    console.error(
      `[Arborito] Failed to load ${validatedURL} (code ${errorCode}: ${errorDescription}).\n` +
        `  Hints: npm run build:css · check index.html exists · DevTools Ctrl+Shift+I`
    );
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error(`[Arborito] Renderer process gone: reason=${details.reason} exitCode=${details.exitCode}`);
  });

  if (process.env.ARBORITO_TEST_LLAMACPP === '1') {
    runLlamacppBridgeSelfTest(mainWindow).catch((e) => {
      console.error('FAIL:', e && e.message ? e.message : e);
      app.exit(1);
    });
    return mainWindow;
  }

  if (process.env.ARBORITO_VITE_DEV === '1') {
    mainWindow.loadURL('http://localhost:5173');
    return mainWindow;
  }

  mainWindow.loadFile(resolveAppIndex());
  return mainWindow;
}

function resolveAppIndex() {
  const builtIndex = path.join(__dirname, 'www', 'index.html');
  if (fs.existsSync(builtIndex)) return builtIndex;
  return path.join(__dirname, 'index.html');
}

async function runLlamacppBridgeSelfTest(mainWindow) {
  await mainWindow.loadFile(resolveAppIndex());
  await mainWindow.webContents.executeJavaScript(`
    new Promise((resolve) => {
      if (document.readyState === 'complete') resolve();
      else window.addEventListener('load', () => resolve(), { once: true });
    })
  `, true);
  const result = await mainWindow.webContents.executeJavaScript(`
    (async () => {
      const { isElectronDesktop } = await import('./src/features/learning/electron-bridge.js');
      const { aiService } = await import('./src/features/learning/ai.js');
      return {
        bridgeKeys: Object.keys(window.arboritoElectron || {}),
        hasLlamacppBridge: !!(window.arboritoElectron && window.arboritoElectron.llamacpp),
        isElectronDesktop: isElectronDesktop(),
        resolvedProvider: aiService.resolveProvider(),
      };
    })()
  `, true);

  console.log('=== Electron llamacpp bridge test ===');
  console.log('preload keys:', (result && result.bridgeKeys) || []);
  console.log('has llamacpp bridge:', !!(result && result.hasLlamacppBridge));
  console.log('isElectronDesktop():', !!(result && result.isElectronDesktop));
  console.log('resolveProvider():', result && result.resolvedProvider);

  if (!result || !result.hasLlamacppBridge) {
    throw new Error('preload.js must expose window.arboritoElectron.llamacpp');
  }
  if (!result.isElectronDesktop) {
    throw new Error('isElectronDesktop() must be true under Electron');
  }
  if (result.resolvedProvider !== 'llamacpp') {
    throw new Error(`resolveProvider() must be "llamacpp", got "${result && result.resolvedProvider}"`);
  }

  const status = await mainWindow.webContents.executeJavaScript(
    'window.arboritoElectron.llamacpp.status()',
    true
  );
  console.log('llamacpp.status():', JSON.stringify(status));
  if (!status || !status.available) {
    throw new Error(`llamacpp.status() unavailable: ${status && status.error ? status.error : 'unknown'}`);
  }

  console.log('\nRESULT: PASS — Electron uses native llama-server');
  app.exit(0);
}

async function clearStaleServiceWorkers() {
  try {
    await session.defaultSession.clearStorageData({ storages: ['serviceworkers'] });
  } catch (e) {
    console.warn('[Arborito] Could not clear stale service workers:', e && e.message ? e.message : e);
  }
}

app.whenReady().then(async () => {
  await clearStaleServiceWorkers();
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    if (permission === 'media') callback(true);
    else callback(false);
  });
  registerSystemThemeIpc();
  registerWindowCloseIpc();
  registerFetchIpc();
  registerLlamacppIpc(ipcMain, isTrustedRenderer);
  registerSageVoiceIpc(ipcMain, isTrustedRenderer);
  registerUserDataIpc(ipcMain, app, isTrustedRenderer);
  console.info('[Arborito] Native llama.cpp IPC ready (llama-server on port 8765)');
  Menu.setApplicationMenu(null);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  stopServer();
});
