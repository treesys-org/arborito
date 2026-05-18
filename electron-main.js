/**
 * Electron **main process** (not to confuse with `src/main.js`, which runs in the renderer).
 */
const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, session, Menu, ipcMain } = require('electron');

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

function isLoopbackHost(hostname) {
  const h = String(hostname || '').toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '::1';
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
      // Required for SharedArrayBuffer (multi-thread WASM)
      sandbox: false,
    },
  };
  if (fs.existsSync(iconPath)) {
    winOpts.icon = iconPath;
  }
  const mainWindow = new BrowserWindow(winOpts);

  // --- COOP/COEP HEADERS FOR MULTI-THREADING ---
  // Required for SharedArrayBuffer to work with wllama (multi-thread WASM)
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = {
      ...details.responseHeaders,
      'Cross-Origin-Opener-Policy': ['same-origin'],
      'Cross-Origin-Embedder-Policy': ['require-corp']
    };

    let u;
    try { u = new URL(details.url); } catch { u = null; }
    const isOllama =
      u &&
      (u.protocol === 'http:' || u.protocol === 'https:') &&
      isLoopbackHost(u.hostname) &&
      String(u.port || '') === '11434';

    // Add CORS headers for Ollama local server
    if (isOllama) {
      responseHeaders['Access-Control-Allow-Origin'] = ['*'];
      responseHeaders['Access-Control-Allow-Headers'] = ['*'];
      responseHeaders['Access-Control-Allow-Methods'] = ['GET, POST, OPTIONS'];
    }

    callback({ responseHeaders });
  });

  // Load the index.html of the app.
  mainWindow.loadFile('index.html');

  // Open the DevTools. (Optional, remove for production)
  // mainWindow.webContents.openDevTools();
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(() => {
  registerFetchIpc();
  Menu.setApplicationMenu(null);
  createWindow();

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
