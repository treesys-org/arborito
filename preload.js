/**
 * Electron preload script (context-isolated). Add `contextBridge` exports here if the
 * renderer needs safe IPC; keep this file minimal.
 *
 * `arboritoElectron.llamacpp` is the **native llama.cpp** bridge. On hosts where
 * `node-llama-cpp` failed to install (or the user runs the app in pure browser mode),
 * `llamacpp.status()` returns `{ available: false }` and the renderer must fall back
 * to wllama (WebAssembly) running in its own Web Worker.
 */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/** Subscribe to a renderer-side channel. Returns an `off()` function to unsubscribe. */
function on(channel, handler) {
    const wrapped = (_event, payload) => {
        try { handler(payload); } catch (_) { /* ignore */ }
    };
    ipcRenderer.on(channel, wrapped);
    return () => {
        try { ipcRenderer.removeListener(channel, wrapped); } catch (_) {}
    };
}

contextBridge.exposeInMainWorld('arboritoElectron', {
    /**
     * Fetch URL text in the main process (bypasses renderer CORS for file:// apps).
     */
    fetchUrl: (url, options) => ipcRenderer.invoke('arborito-fetch-url', url, options || {}),

    /**
     * Native llama.cpp surface (desktop only). The renderer MUST call `status()` first;
     * if `available` is false, fall back to the in-browser wllama worker.
     *
     * Surface is intentionally minimal: only the channels actually consumed by the
     * Sage UI today are exposed. Add new channels here (and matching handlers in
     * `electron-main.js`) when the renderer grows a model picker / abort button /
     * disk-usage view, not preemptively.
     */
    llamacpp: {
        status: () => ipcRenderer.invoke('arborito-llamacpp-status'),
        writeSettings: (settings) => ipcRenderer.invoke('arborito-llamacpp-settings-write', settings),

        /** Download (if missing) + load a model. Emits `arborito-llamacpp-progress`. */
        load: (opts) => ipcRenderer.invoke('arborito-llamacpp-load', opts || {}),

        /** Generate chat completion. Emits `arborito-llamacpp-token` per chunk. */
        chat: (opts) => ipcRenderer.invoke('arborito-llamacpp-chat', opts || {}),

        onProgress: (cb) => on('arborito-llamacpp-progress', cb),
        onToken: (cb) => on('arborito-llamacpp-token', cb)
    }
});
