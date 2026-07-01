/** Renderer bridge to native llama.cpp (llama-server) in Electron main process. */

export function isDesktopLlamacppBridgePresent() {
    if (typeof window === 'undefined') return false;
    return !!(window.arboritoElectron && window.arboritoElectron.llamacpp);
}

export function llamacppBridge() {
    if (typeof window === 'undefined') return null;
    const e = window.arboritoElectron;
    return e && e.llamacpp ? e.llamacpp : null;
}

export async function llamacppStatus() {
    const b = llamacppBridge();
    if (!b || typeof b.status !== 'function') return { available: false };
    try {
        return await b.status();
    } catch (_) {
        return { available: false };
    }
}
