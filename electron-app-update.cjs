/**
 * Packaged app update IPC:
 * - Windows: electron-updater + GitHub Releases (download + quiet install).
 * - Linux: compare GitHub latest tag; open .flatpakref in the system installer.
 * Version check runs only when the renderer asks (after privacy consent).
 */
'use strict';

const { BrowserWindow, net } = require('electron');
const { FLATPAK_REF_URL, GITHUB_RELEASES_LATEST_API } = require('./flatpak-remote-urls.cjs');

const CHECK_DELAY_MS = 2_000;

/**
 * @param {string} a
 * @param {string} b
 * @returns {number} negative if a<b, 0 if equal, positive if a>b
 */
function compareSemverLike(a, b) {
  const norm = (s) =>
    String(s || '')
      .trim()
      .replace(/^v/i, '')
      .split(/[-+]/)
      .map((part, idx) => {
        if (idx === 0) {
          return part.split('.').map((n) => {
            const x = parseInt(n, 10);
            return Number.isFinite(x) ? x : 0;
          });
        }
        return part;
      });
  const [aCore, aPre] = norm(a);
  const [bCore, bPre] = norm(b);
  const len = Math.max(aCore.length, bCore.length);
  for (let i = 0; i < len; i++) {
    const av = aCore[i] || 0;
    const bv = bCore[i] || 0;
    if (av !== bv) return av - bv;
  }
  if (aPre == null && bPre == null) return 0;
  if (aPre == null) return 1;
  if (bPre == null) return -1;
  return String(aPre).localeCompare(String(bPre));
}

/**
 * @param {string} url
 * @returns {Promise<any>}
 */
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    try {
      const req = net.request({ method: 'GET', url });
      req.setHeader('Accept', 'application/vnd.github+json');
      req.setHeader('User-Agent', 'Arborito');
      const chunks = [];
      req.on('response', (res) => {
        res.on('data', (c) => chunks.push(Buffer.from(c)));
        res.on('end', () => {
          const status = res.statusCode || 0;
          const body = Buffer.concat(chunks).toString('utf8');
          if (status < 200 || status >= 300) {
            reject(new Error(`HTTP ${status}`));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
        res.on('error', reject);
      });
      req.on('error', reject);
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * @param {import('electron').IpcMain} ipcMain
 * @param {(event: import('electron').IpcMainInvokeEvent) => boolean} isTrustedRenderer
 * @param {import('electron').App} app
 * @param {{ openUrl?: (href: string) => Promise<{ ok: boolean, error?: string }> | { ok: boolean, error?: string } }} [deps]
 */
function registerAppUpdateIpc(ipcMain, isTrustedRenderer, app, deps = {}) {
  const win32 = process.platform === 'win32' && app.isPackaged;
  const linux = process.platform === 'linux' && app.isPackaged;
  const enabled = win32 || linux;

  if (!enabled) {
    ipcMain.handle('arborito-app-update-check', async () => ({ ok: false, error: 'unavailable' }));
    ipcMain.handle('arborito-app-update-confirm', async () => ({ ok: false, error: 'unavailable' }));
    ipcMain.handle('arborito-app-update-dismiss', async () => ({ ok: true }));
    return;
  }

  let pendingInfo = null;
  let downloading = false;
  let checkScheduled = false;
  /** @type {'windows' | 'linux-ref' | null} */
  let pendingKind = null;

  function sendToRenderers(channel, payload) {
    for (const win of BrowserWindow.getAllWindows()) {
      try {
        if (!win.isDestroyed()) win.webContents.send(channel, payload);
      } catch {
        /* window gone */
      }
    }
  }

  async function openFlatpakRef() {
    const openUrl = deps.openUrl;
    if (typeof openUrl !== 'function') {
      return { ok: false, error: 'URL opener unavailable' };
    }
    try {
      const result = await Promise.resolve(openUrl(FLATPAK_REF_URL));
      return result && result.ok ? { ok: true, opened: true } : { ok: false, error: result?.error || 'open failed' };
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      return { ok: false, error: msg };
    }
  }

  async function checkLinuxUpdate() {
    try {
      const data = await fetchJson(GITHUB_RELEASES_LATEST_API);
      const tag = String(data?.tag_name || data?.name || '').trim();
      const remote = tag.replace(/^v/i, '');
      const local = String(app.getVersion() || '').trim();
      if (!remote || !local) return;
      if (compareSemverLike(remote, local) <= 0) {
        pendingInfo = null;
        pendingKind = null;
        return;
      }
      pendingInfo = { version: remote };
      pendingKind = 'linux-ref';
      sendToRenderers('arborito-app-update-available', { version: remote, kind: 'linux-ref' });
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      console.warn('[Arborito] linux update check:', msg);
      sendToRenderers('arborito-app-update-error', { error: msg });
    } finally {
      checkScheduled = false;
    }
  }

  if (win32) {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;

    autoUpdater.on('update-available', (info) => {
      pendingInfo = info || null;
      pendingKind = 'windows';
      const version = String(info?.version || '').trim();
      if (!version) return;
      sendToRenderers('arborito-app-update-available', { version, kind: 'windows' });
    });

    autoUpdater.on('update-not-available', () => {
      pendingInfo = null;
      pendingKind = null;
    });

    autoUpdater.on('error', (err) => {
      downloading = false;
      const msg = err && err.message ? err.message : String(err || 'update error');
      console.warn('[Arborito] autoUpdater:', msg);
      sendToRenderers('arborito-app-update-error', { error: msg });
    });

    autoUpdater.on('update-downloaded', () => {
      downloading = false;
      try {
        autoUpdater.quitAndInstall(true, true);
      } catch (e) {
        const msg = e && e.message ? e.message : String(e);
        console.warn('[Arborito] quitAndInstall failed:', msg);
        sendToRenderers('arborito-app-update-error', { error: msg });
      }
    });

    ipcMain.handle('arborito-app-update-check', async (event) => {
      if (!isTrustedRenderer(event)) return { ok: false, error: 'Untrusted caller' };
      if (checkScheduled || downloading) return { ok: true, scheduled: true };
      checkScheduled = true;
      setTimeout(() => {
        autoUpdater.checkForUpdates().catch((e) => {
          checkScheduled = false;
          const msg = e && e.message ? e.message : String(e);
          console.warn('[Arborito] checkForUpdates failed:', msg);
        });
      }, CHECK_DELAY_MS);
      return { ok: true, scheduled: true };
    });

    ipcMain.handle('arborito-app-update-confirm', async (event) => {
      if (!isTrustedRenderer(event)) return { ok: false, error: 'Untrusted caller' };
      if (downloading) return { ok: true, downloading: true };
      if (!pendingInfo || pendingKind !== 'windows') return { ok: false, error: 'No update pending' };
      downloading = true;
      try {
        await autoUpdater.downloadUpdate();
        return { ok: true, downloading: true };
      } catch (e) {
        downloading = false;
        const msg = e && e.message ? e.message : String(e);
        console.warn('[Arborito] downloadUpdate failed:', msg);
        return { ok: false, error: msg };
      }
    });
  } else {
    ipcMain.handle('arborito-app-update-check', async (event) => {
      if (!isTrustedRenderer(event)) return { ok: false, error: 'Untrusted caller' };
      if (checkScheduled) return { ok: true, scheduled: true };
      checkScheduled = true;
      setTimeout(() => {
        void checkLinuxUpdate();
      }, CHECK_DELAY_MS);
      return { ok: true, scheduled: true };
    });

    ipcMain.handle('arborito-app-update-confirm', async (event) => {
      if (!isTrustedRenderer(event)) return { ok: false, error: 'Untrusted caller' };
      if (!pendingInfo || pendingKind !== 'linux-ref') return { ok: false, error: 'No update pending' };
      return openFlatpakRef();
    });
  }

  ipcMain.handle('arborito-app-update-dismiss', async (event) => {
    if (!isTrustedRenderer(event)) return { ok: false, error: 'Untrusted caller' };
    pendingInfo = null;
    pendingKind = null;
    return { ok: true };
  });
}

module.exports = { registerAppUpdateIpc, compareSemverLike };
