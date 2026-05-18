/**
 * Electron preload script (context-isolated). Add `contextBridge` exports here if the
 * renderer needs safe IPC; keep this file minimal.
 */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('arboritoElectron', {
    /**
     * Fetch URL text in the main process (bypasses renderer CORS for file:// apps).
     * @param {string} url
     * @param {{ timeoutMs?: number }} [options]
     */
    fetchUrl: (url, options) => ipcRenderer.invoke('arborito-fetch-url', url, options || {})
});
