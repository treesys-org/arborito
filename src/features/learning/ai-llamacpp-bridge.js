/**
 * Renderer-side bridge to the native `node-llama-cpp` integration exposed by the
 * Electron preload (`window.arboritoElectron.llamacpp`). Provides the same
 * `init()` / `generate()` shape the wllama Web Worker exposes, so `ai.js` can
 * choose between desktop-native and in-browser providers without branching deep
 * inside the chat pipeline.
 *
 * Browser-only sessions never see this module: `isDesktopLlamacppBridgePresent()`
 * checks for the IPC surface first.
 */

const PROGRESS_SUBS = new Set();
const TOKEN_SUBS = new Map(); // sessionId -> handler
let listenersBound = false;
let lastStatusPromise = null;

function bridge() {
    if (typeof window === 'undefined') return null;
    const e = window.arboritoElectron;
    if (!e || !e.llamacpp) return null;
    return e.llamacpp;
}

function bindListenersOnce() {
    if (listenersBound) return;
    const b = bridge();
    if (!b) return;
    if (typeof b.onProgress === 'function') {
        b.onProgress((data) => {
            PROGRESS_SUBS.forEach((cb) => {
                try { cb(data); } catch (_) {}
            });
        });
    }
    if (typeof b.onToken === 'function') {
        b.onToken(({ sessionId, token }) => {
            const handler = TOKEN_SUBS.get(sessionId);
            if (handler) {
                try { handler(token); } catch (_) {}
            }
        });
    }
    listenersBound = true;
}

/** @returns {Promise<{ available: boolean, modelLoaded?: boolean, currentModelFile?: string|null, loadError?: string|null }>} */
export async function getLlamacppStatus() {
    const b = bridge();
    if (!b) return { available: false };
    if (lastStatusPromise) return lastStatusPromise;
    lastStatusPromise = b.status().catch(() => ({ available: false }));
    const out = await lastStatusPromise;
    lastStatusPromise = null;
    return out || { available: false };
}

/** Cheap synchronous test for "are we in Electron with the bridge wired up?". */
export function isDesktopLlamacppBridgePresent() {
    return !!bridge();
}

export async function writeLlamacppSettings(settings) {
    const b = bridge();
    if (!b) return { ok: false, error: 'No bridge' };
    return b.writeSettings(settings || {});
}

/**
 * Parse the same `modelId:modelFile` shorthand the wllama worker accepts.
 */
function parseModelShorthand(modelName) {
    let modelId = 'bartowski/Llama-3.2-1B-Instruct-GGUF';
    let modelFile = 'Llama-3.2-1B-Instruct-Q4_K_M.gguf';
    if (typeof modelName === 'string' && modelName.length) {
        if (modelName.includes(':')) {
            const [id, file] = modelName.split(':');
            modelId = id;
            modelFile = file;
        } else if (modelName.includes('/') && modelName.toLowerCase().endsWith('.gguf')) {
            const idx = modelName.lastIndexOf('/');
            modelId = modelName.slice(0, idx);
            modelFile = modelName.slice(idx + 1);
        }
    }
    return { modelId, modelFile };
}

/**
 * Download (if missing) + load a model. `onProgress` receives
 * `{ phase, progress, message }` updates emitted from the main process.
 */
export async function loadLlamacppModel(modelShorthand, opts = {}, onProgress = null) {
    const b = bridge();
    if (!b) throw new Error('llama.cpp bridge unavailable');
    const { modelId, modelFile } = parseModelShorthand(modelShorthand);

    if (onProgress) {
        bindListenersOnce();
        PROGRESS_SUBS.add(onProgress);
    }
    try {
        const r = await b.load({
            modelId,
            modelFile,
            contextSize: opts.contextSize || 4096,
            gpuLayers: opts.gpuLayers
        });
        if (!r || !r.ok) throw new Error((r && r.error) || 'llama.cpp load failed');
        return r;
    } finally {
        if (onProgress) PROGRESS_SUBS.delete(onProgress);
    }
}

let chatSessionCounter = 0;
function nextSessionId() {
    chatSessionCounter += 1;
    return 's_' + Date.now() + '_' + chatSessionCounter;
}

/**
 * Generate a chat completion. `onToken` is called with each streamed text chunk.
 * Returns `{ text }` on success, throws on failure.
 */
export async function llamacppChat({ messages, systemPrompt, maxTokens, temperature }, onToken = null) {
    const b = bridge();
    if (!b) throw new Error('llama.cpp bridge unavailable');
    const sessionId = nextSessionId();

    if (onToken) {
        bindListenersOnce();
        TOKEN_SUBS.set(sessionId, onToken);
    }
    try {
        const r = await b.chat({
            sessionId,
            messages,
            systemPrompt,
            maxTokens,
            temperature
        });
        if (!r || !r.ok) throw new Error((r && r.error) || 'llama.cpp chat failed');
        return { text: String(r.text || '') };
    } finally {
        TOKEN_SUBS.delete(sessionId);
    }
}

