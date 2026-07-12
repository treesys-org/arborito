/**
 * Electron preload script (context-isolated). Add `contextBridge` exports here if the
 * renderer needs safe IPC; keep this file minimal.
 *
 * Sage chat: native llama.cpp in Electron; Expert API or unavailable in browser.
 * `arboritoElectron.sageVoice` is desktop-only voice (STT/TTS).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
/* `nativeTheme` is a MAIN-process-only module: it is `undefined` here in the
 * (context-isolated) preload, so reading `nativeTheme.shouldUseDarkColors`
 * threw "Cannot read properties of undefined" and aborted boot. The renderer
 * gets the OS theme over IPC instead (see electron-main.js). */
const { contextBridge, ipcRenderer, clipboard } = require('electron');

/** Absolute file:// URL for bundled assets (fonts, emoji PNGs). Required under Electron file:// + asar. */
function resolveAsset(relativePath) {
    const rel = String(relativePath || '').replace(/^\/+/, '');
    const direct = path.join(__dirname, rel);
    if (fs.existsSync(direct)) {
        return pathToFileURL(direct).href;
    }
    // Native modules + vendor assets unpacked from asar (electron-builder asarUnpack).
    if (__dirname.includes('app.asar')) {
        const unpacked = path.join(__dirname.replace('app.asar', 'app.asar.unpacked'), rel);
        if (fs.existsSync(unpacked)) {
            return pathToFileURL(unpacked).href;
        }
    }
    return pathToFileURL(direct).href;
}

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
    /** GTK / Windows / macOS appearance (reliable on Linux Electron; matchMedia often does not).
     * Resolved in the main process via IPC — `nativeTheme` is not available in the preload. */
    systemTheme: {
        get: () => {
            try {
                const t = ipcRenderer.sendSync('arborito-system-theme-get');
                return t === 'dark' || t === 'light' ? t : 'light';
            } catch (_) {
                return 'light';
            }
        },
        onChanged: (cb) => on('arborito-system-theme-changed', cb),
    },

    /** Reliable clipboard on Linux Electron (navigator.clipboard often fails under file://). */
    copyText: (text) => {
        try {
            clipboard.writeText(String(text ?? ''));
            return true;
        } catch (_) {
            return false;
        }
    },

    /** file:// URL to a file under the app install dir (e.g. vendor/fonts/…). */
    resolveAsset,

    /** Open http(s) links in the user's default browser (never in-app). */
    openExternalUrl: (url) => ipcRenderer.invoke('arborito-open-external-url', url),
    openExternalUrlSync: (url) => {
        try {
            return ipcRenderer.sendSync('arborito-open-external-url-sync', url);
        } catch (_) {
            return { ok: false, error: 'IPC failed' };
        }
    },

    /** Save export bytes via native “Save as…” dialog (Electron). */
    saveExportFile: (opts) => ipcRenderer.invoke('arborito-save-export-file', opts || {}),

    /**
     * Fetch URL text in the main process (bypasses renderer CORS for file:// apps).
     */
    fetchUrl: (url, options) => ipcRenderer.invoke('arborito-fetch-url', url, options || {}),

    /** Native llama.cpp chat (llama-server in main process). Electron only. */
    llamacpp: {
        status: () => ipcRenderer.invoke('arborito-llamacpp-status'),
        load: (opts) => ipcRenderer.invoke('arborito-llamacpp-load', opts || {}),
        chat: (opts) => ipcRenderer.invoke('arborito-llamacpp-chat', opts || {}),
        abort: () => ipcRenderer.invoke('arborito-llamacpp-abort'),
        onProgress: (cb) => on('arborito-llamacpp-progress', cb),
        onToken: (cb) => on('arborito-llamacpp-token', cb),
    },

    /** Fired when the BrowserWindow is resized, maximized, or first shown (Electron repaint). */
    onWindowResized: (cb) => on('arborito-window-resized', cb),

    /** User closed the window (X / Alt+F4 / Cmd+Q). Renderer must call respondWindowClose. */
    onWindowCloseRequest: (cb) => on('arborito-window-close-request', cb),
    respondWindowClose: (decision) =>
        ipcRenderer.invoke('arborito-window-close-decision', decision === 'proceed' ? 'proceed' : 'cancel'),

    /** Frozen trees / offline games as files under userData (~/.config/Arborito). */
    userData: {
        layout: () => ipcRenderer.invoke('arborito-ud-layout'),
        frozenTreeGet: (sourceId) => ipcRenderer.invoke('arborito-ud-frozen-tree-get', sourceId),
        frozenTreePut: (sourceId, payload) => ipcRenderer.invoke('arborito-ud-frozen-tree-put', sourceId, payload),
        frozenTreeRemove: (sourceId) => ipcRenderer.invoke('arborito-ud-frozen-tree-remove', sourceId),
        offlineGameGet: (gameId) => ipcRenderer.invoke('arborito-ud-offline-game-get', gameId),
        offlineGamePut: (gameId, bundle) => ipcRenderer.invoke('arborito-ud-offline-game-put', gameId, bundle),
        offlineGameRemove: (gameId) => ipcRenderer.invoke('arborito-ud-offline-game-remove', gameId),
    },

    /** Desktop-only voice: Whisper STT + Piper neural TTS (all auto-downloaded). */
    sageVoice: {
        assetStatus: (opts) => ipcRenderer.invoke('arborito-sage-voice-status', opts || {}),
        transcribeAudio: (opts) => ipcRenderer.invoke('arborito-sage-transcribe-audio', opts || {}),
        synthesizeSpeech: (opts) => ipcRenderer.invoke('arborito-sage-synthesize-speech', opts || {}),
        prefetchTts: (opts) => ipcRenderer.invoke('arborito-sage-voice-prefetch-tts', opts || {}),
        prefetchStt: (opts) => ipcRenderer.invoke('arborito-sage-voice-prefetch-stt', opts || {}),
        abort: () => ipcRenderer.invoke('arborito-sage-voice-abort'),
        abortTts: () => ipcRenderer.invoke('arborito-sage-voice-abort-tts'),
        onProgress: (cb) => on('arborito-sage-voice-progress', cb),
    }
});
