/**
 * Windows packaged auto-update via electron-updater + GitHub Releases.
 * Version check runs only when the renderer asks (after privacy consent).
 * Download/install only after the user confirms the in-app prompt.
 */
'use strict';

const { BrowserWindow } = require('electron');

const CHECK_DELAY_MS = 2_000;

/**
 * @param {import('electron').IpcMain} ipcMain
 * @param {(event: import('electron').IpcMainInvokeEvent) => boolean} isTrustedRenderer
 * @param {import('electron').App} app
 */
function registerAppUpdateIpc(ipcMain, isTrustedRenderer, app) {
  const enabled = process.platform === 'win32' && app.isPackaged;
  if (!enabled) {
    ipcMain.handle('arborito-app-update-check', async () => ({ ok: false, error: 'unavailable' }));
    ipcMain.handle('arborito-app-update-confirm', async () => ({ ok: false, error: 'unavailable' }));
    ipcMain.handle('arborito-app-update-dismiss', async () => ({ ok: true }));
    return;
  }

  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  let pendingInfo = null;
  let downloading = false;
  let checkScheduled = false;

  function sendToRenderers(channel, payload) {
    for (const win of BrowserWindow.getAllWindows()) {
      try {
        if (!win.isDestroyed()) win.webContents.send(channel, payload);
      } catch {
        /* window gone */
      }
    }
  }

  autoUpdater.on('update-available', (info) => {
    pendingInfo = info || null;
    const version = String(info?.version || '').trim();
    if (!version) return;
    sendToRenderers('arborito-app-update-available', { version });
  });

  autoUpdater.on('update-not-available', () => {
    pendingInfo = null;
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
      /* isSilent=true → NSIS /S; isForceRunAfter=true → relaunch Arborito. */
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
    if (!pendingInfo) return { ok: false, error: 'No update pending' };
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

  ipcMain.handle('arborito-app-update-dismiss', async (event) => {
    if (!isTrustedRenderer(event)) return { ok: false, error: 'Untrusted caller' };
    pendingInfo = null;
    return { ok: true };
  });
}

module.exports = { registerAppUpdateIpc };
