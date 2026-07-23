/**
 * Electron main process — BrowserWindow, fetch IPC, native llama.cpp chat, Sage voice.
 * Browser: Expert API or no local chat; Electron uses llama-server in main.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { resolveStableUserDataDir, resolveChromiumTempDir } = require('./electron-app-paths.cjs');

/** Chromium shared-memory files need a writable+executable temp dir (/dev/shm and /tmp often break in VMs). */
function ensureChromiumTempDir() {
  const candidates = [
    resolveChromiumTempDir(),
    path.join(__dirname, '.chromium-tmp'),
  ].filter(Boolean);

  for (const dir of candidates) {
    try {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      fs.accessSync(dir, fs.constants.W_OK | fs.constants.X_OK);
      process.env.TMPDIR = dir;
      process.env.TMP = dir;
      process.env.TEMP = dir;
      return dir;
    } catch {
      /* try next */
    }
  }
  console.warn(
    '[Arborito] No writable chromium temp dir found; set ARBORITO_CHROMIUM_TMP or fix /tmp permissions.'
  );
  return null;
}

const chromiumTempDir = ensureChromiumTempDir();

/** Toolbox, Distrobox, Podman, etc. — nested user namespaces break Chromium sandbox + /dev/shm. */
function isNestedLinuxContainer() {
  if (process.platform !== 'linux') return false;
  if (process.env.FLATPAK_ID) return true;
  if (process.env.CONTAINER_ID || process.env.CONTAINER || process.env.TOOLBOX_PATH) return true;
  try {
    if (fs.existsSync('/.containerenv') || fs.existsSync('/run/.containerenv')) return true;
  } catch {
    /* ignore */
  }
  return false;
}

if (process.platform === 'linux' && isNestedLinuxContainer()) {
  process.env.ELECTRON_NO_SANDBOX = '1';
}

const { spawnSync } = require('child_process');
const { app, BrowserWindow, session, Menu, ipcMain, nativeTheme, shell, dialog } = require('electron');
const { registerSageVoiceIpc } = require('./electron-sage-voice.js');
const { registerLlamacppIpc, stopServer } = require('./electron-llama-chat.cjs');
const { registerUserDataIpc } = require('./electron-user-data.cjs');
const { registerAppUpdateIpc } = require('./electron-app-update.cjs');

/** Human label + Freedesktop ID (taskbar / Alt+Tab on Linux). Must run before app.ready. */
const APP_DISPLAY_NAME = 'Arborito';
const APP_DESKTOP_ID = 'org.treesys.arborito';

app.setPath('userData', resolveStableUserDataDir());
app.setName(APP_DISPLAY_NAME);
if (process.platform === 'linux') {
  app.setDesktopName(`${APP_DESKTOP_ID}.desktop`);
}

app.commandLine.appendSwitch('no-sandbox');
if (process.platform === 'linux') {
  /** Prefer disk-backed temp (see ensureChromiumTempDir) over /dev/shm in VMs/containers. */
  app.commandLine.appendSwitch('disable-dev-shm-usage');
  app.commandLine.appendSwitch('disable-setuid-sandbox');
}

function rendererPageUrl(event) {
  try {
    const frameUrl = typeof event?.senderFrame?.url === 'string' ? event.senderFrame.url : '';
    if (frameUrl) return frameUrl;
    if (event?.sender && typeof event.sender.getURL === 'function') {
      return String(event.sender.getURL() || '');
    }
  } catch {
    /* ignore */
  }
  return '';
}

function isTrustedRenderer(event) {
  const url = rendererPageUrl(event);
  if (url.startsWith('file://')) return true;
  /* Vite dev server (ARBORITO_VITE_DEV=1) loads http://localhost:5173 */
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(url)) return true;
  /* Some Electron builds omit senderFrame.url on invoke; trust our own windows. */
  if (!url && event?.sender) {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win && !win.isDestroyed()) return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}

function parseExternalHttpUrl(urlString) {
  let parsed;
  try {
    parsed = new URL(String(urlString || ''));
  } catch {
    return { ok: false, error: 'Invalid URL' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: 'Only http(s) URLs are allowed' };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, error: 'Credentials in URL are not allowed' };
  }
  return { ok: true, href: parsed.href };
}

function runCommandSync(command, args, timeoutMs = 8000) {
  try {
    const result = spawnSync(command, args, {
      timeout: timeoutMs,
      stdio: 'ignore',
      encoding: 'utf8',
    });
    if (result.error) return false;
    return result.status === 0;
  } catch {
    return false;
  }
}

/** Linux: portal DBus / gio / Flatpak host — never shell.openExternal (execvp xdg-open). */
function openUrlOnLinux(href) {
  if (runCommandSync('gdbus', [
    'call', '--session',
    '--dest', 'org.freedesktop.portal.Desktop',
    '--object-path', '/org/freedesktop/portal/desktop',
    '--method', 'org.freedesktop.portal.OpenURI.OpenURI',
    '',
    `{'uri': <'${href}'>}`,
  ])) {
    return { ok: true };
  }

  if (runCommandSync('gio', ['open', href])) {
    return { ok: true };
  }

  if (process.env.FLATPAK_ID && runCommandSync('flatpak-spawn', ['--host', 'xdg-open', href])) {
    return { ok: true };
  }

  for (const xdg of ['/usr/bin/xdg-open', '/bin/xdg-open']) {
    try {
      if (fs.existsSync(xdg) && runCommandSync(xdg, [href])) {
        return { ok: true };
      }
    } catch {
      /* ignore */
    }
  }

  const browserAttempts = [
    ['firefox', ['--new-tab', href]],
    ['google-chrome', [href]],
    ['google-chrome-stable', [href]],
    ['chromium-browser', [href]],
    ['chromium', [href]],
  ];
  for (const [command, args] of browserAttempts) {
    if (runCommandSync(command, args)) {
      return { ok: true };
    }
  }

  console.warn(
    '[Arborito] Could not open URL in browser. ' +
      'Install gio (glib2) or xdg-utils, or run from a desktop session.'
  );
  return { ok: false, error: 'No URL opener available on Linux' };
}

async function openUrlInSystemBrowser(href) {
  if (process.platform === 'linux') {
    return openUrlOnLinux(href);
  }
  try {
    await shell.openExternal(href);
    return { ok: true };
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    console.warn('[Arborito] shell.openExternal failed:', msg);
    return { ok: false, error: msg };
  }
}

function openUrlInSystemBrowserSync(href) {
  if (process.platform === 'linux') {
    return openUrlOnLinux(href);
  }
  try {
    void shell.openExternal(href);
    return { ok: true };
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    console.warn('[Arborito] shell.openExternal (sync) failed:', msg);
    return { ok: false, error: msg };
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

function registerOpenExternalIpc() {
  const handleOpen = async (event, urlString) => {
    if (!isTrustedRenderer(event)) {
      console.warn('[Arborito] openExternal rejected untrusted renderer:', rendererPageUrl(event));
      return { ok: false, error: 'Untrusted caller' };
    }
    const parsed = parseExternalHttpUrl(urlString);
    if (!parsed.ok) return parsed;
    return openUrlInSystemBrowser(parsed.href);
  };

  ipcMain.on('arborito-open-external-url-sync', (event, urlString) => {
    if (!isTrustedRenderer(event)) {
      event.returnValue = { ok: false, error: 'Untrusted caller' };
      return;
    }
    const parsed = parseExternalHttpUrl(urlString);
    if (!parsed.ok) {
      event.returnValue = parsed;
      return;
    }
    event.returnValue = openUrlInSystemBrowserSync(parsed.href);
  });

  ipcMain.handle('arborito-open-external-url', handleOpen);
}

function attachExternalLinkHandler(webContents) {
  webContents.setWindowOpenHandler(({ url }) => {
    const parsed = parseExternalHttpUrl(url);
    if (parsed.ok) {
      void openUrlInSystemBrowser(parsed.href);
    }
    return { action: 'deny' };
  });
  webContents.on('will-navigate', (event, url) => {
    const parsed = parseExternalHttpUrl(url);
    if (parsed.ok) {
      event.preventDefault();
      void openUrlInSystemBrowser(parsed.href);
    }
  });
}

/** Native copy/paste menu for lesson editor and readable lesson text (Electron has no default menu). */
function attachEditableContextMenu(webContents) {
  webContents.on('context-menu', (_event, params) => {
    const { editFlags } = params;
    const template = [];
    if (editFlags.canCut) template.push({ role: 'cut' });
    if (editFlags.canCopy) template.push({ role: 'copy' });
    if (editFlags.canPaste) template.push({ role: 'paste' });
    if (template.length) template.push({ type: 'separator' });
    if (editFlags.canSelectAll) template.push({ role: 'selectAll' });
    if (!template.length) return;
    const win = BrowserWindow.fromWebContents(webContents);
    Menu.buildFromTemplate(template).popup(win ? { window: win } : undefined);
  });
}

/** Save bytes via native “Save as…” (Electron) or browser download. */
function registerSaveExportFileIpc() {
  ipcMain.handle('arborito-save-export-file', async (event, opts = {}) => {
    if (!isTrustedRenderer(event)) {
      return { ok: false, error: 'Untrusted caller' };
    }

    const data = opts.data;
    if (!data || !(data instanceof Uint8Array || ArrayBuffer.isView(data) || Array.isArray(data))) {
      return { ok: false, error: 'Empty export data' };
    }

    const defaultFileName =
      String(opts.defaultFileName || 'export')
        .replace(/[^\w.\- ]/g, '')
        .trim() || 'export';
    const filters =
      Array.isArray(opts.filters) && opts.filters.length
        ? opts.filters
        : [{ name: 'File', extensions: ['*'] }];

    try {
      const buffer = Buffer.from(data);
      const parent = BrowserWindow.fromWebContents(event.sender);
      const { canceled, filePath } = await dialog.showSaveDialog(
        parent && !parent.isDestroyed() ? parent : undefined,
        { defaultPath: defaultFileName, filters }
      );
      if (canceled || !filePath) return { ok: false, canceled: true };
      fs.writeFileSync(filePath, buffer);
      return { ok: true, path: filePath };
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      console.warn('[Arborito] save-export-file failed:', msg);
      return { ok: false, error: msg };
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

function resolveAppIndex() {
  const builtIndex = path.join(__dirname, 'www', 'index.html');
  if (fs.existsSync(builtIndex)) return builtIndex;
  return path.join(__dirname, 'index.html');
}

/** YouTube Error 153: inject Referer/Origin for file:// shells; strip X-Frame-Options on embed responses. */
function registerVideoEmbedSessionFix() {
  const filter = {
    urls: [
      '*://*.youtube.com/*',
      '*://*.youtube-nocookie.com/*',
      '*://*.googlevideo.com/*',
      '*://*.ytimg.com/*',
      '*://player.vimeo.com/*',
    ],
  };

  const embedOrigin = 'https://arborito.org';
  const embedReferer = 'https://arborito.org/';
  const ytPlayerReferer = 'https://www.youtube.com/';

  session.defaultSession.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
    const headers = { ...details.requestHeaders };
    const url = details.url || '';
    const existing = headers.Referer || headers.referer || '';
    if (!existing || !/^https?:\/\//i.test(existing)) {
      headers.Referer = /googlevideo\.com|ytimg\.com/i.test(url) ? ytPlayerReferer : embedReferer;
    }
    if (/youtube(?:-nocookie)?\.com\/embed/i.test(url)) {
      headers.Origin = embedOrigin;
    }
    delete headers.referer;
    callback({ requestHeaders: headers });
  });

  session.defaultSession.webRequest.onHeadersReceived(filter, (details, callback) => {
    const headers = { ...details.responseHeaders };
    for (const key of Object.keys(headers)) {
      if (/^x-frame-options$/i.test(key)) delete headers[key];
    }
    callback({ responseHeaders: headers });
  });
}

function createWindow() {
  const iconPath = path.join(__dirname, 'build', 'icon.png');
  const startMaximized = process.env.ARBORITO_TEST_LLAMACPP !== '1';
  const winOpts = {
    width: 1280,
    height: 800,
    title: APP_DISPLAY_NAME,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0a1e16' : '#ecfdf5',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      sandbox: false,
      webviewTag: true,
    },
  };
  if (fs.existsSync(iconPath)) winOpts.icon = iconPath;
  const mainWindow = new BrowserWindow(winOpts);
  mainWindow.__arboritoAllowClose = false;
  attachWindowCloseGuard(mainWindow);

  attachExternalLinkHandler(mainWindow.webContents);
  attachEditableContextMenu(mainWindow.webContents);

  let resizeNotifyTimer = null;
  const notifyRendererResize = () => {
    if (mainWindow.isDestroyed()) return;
    if (resizeNotifyTimer) clearTimeout(resizeNotifyTimer);
    resizeNotifyTimer = setTimeout(() => {
      resizeNotifyTimer = null;
      if (mainWindow.isDestroyed()) return;
      mainWindow.webContents.send('arborito-window-resized');
    }, 50);
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
  });

  mainWindow.webContents.on('did-finish-load', () => {
    notifyRendererResize();
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

  console.log('\nRESULT: PASS : Electron uses native llama-server');
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
  console.info(`[Arborito] userData: ${app.getPath('userData')}`);
  if (chromiumTempDir) {
    try {
      app.setPath('temp', chromiumTempDir);
    } catch {
      /* ignore */
    }
    if (process.platform === 'linux') {
      console.info(`[Arborito] Chromium temp dir: ${chromiumTempDir}`);
    }
  }
  if (isNestedLinuxContainer()) {
    console.info(
      '[Arborito] Nested container detected (Toolbx/Distrobox/Flatpak): Chromium runs with --no-sandbox; ' +
        'lesson video uses <webview> for YouTube/Vimeo embeds.'
    );
  }
  await clearStaleServiceWorkers();
  registerVideoEmbedSessionFix();
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    if (
      permission === 'media' ||
      permission === 'camera' ||
      permission === 'microphone' ||
      permission === 'videoCapture' ||
      permission === 'audioCapture'
    ) {
      callback(true);
    } else {
      callback(false);
    }
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    return (
      permission === 'media' ||
      permission === 'camera' ||
      permission === 'microphone' ||
      permission === 'videoCapture' ||
      permission === 'audioCapture'
    );
  });
  registerSystemThemeIpc();
  registerWindowCloseIpc();
  registerOpenExternalIpc();
  registerSaveExportFileIpc();
  registerFetchIpc();
  registerLlamacppIpc(ipcMain, isTrustedRenderer);
  registerSageVoiceIpc(ipcMain, isTrustedRenderer);
  registerUserDataIpc(ipcMain, app, isTrustedRenderer);
  registerAppUpdateIpc(ipcMain, isTrustedRenderer, app);
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
