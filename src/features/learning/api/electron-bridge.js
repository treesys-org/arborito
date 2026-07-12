/** True when running inside the Electron desktop app (not plain browser). */
export function isElectronDesktop() {
    if (typeof window === 'undefined') return false;
    const ua = String(navigator.userAgent || '');
    if (/\bElectron\//i.test(ua) || /\belectron\b/i.test(ua)) return true;
    const e = window.arboritoElectron;
    return !!(e && (e.llamacpp || e.sageVoice || e.fetchUrl || e.resolveAsset || e.userData || e.openExternalUrl || e.openExternalUrlSync || e.saveExportFile));
}

/** Electron uses native llama.cpp in main; browser has no WASM fallback. */
export function mustUseNativeLlamacpp() {
    return isElectronDesktop();
}

/** True when Sage can run a local GGUF model (Electron / llama.cpp bridge), not Expert API. */
export function sageHasNativeLlmRuntime() {
    if (typeof window === 'undefined') return false;
    if (mustUseNativeLlamacpp()) return true;
    const e = window.arboritoElectron;
    return !!(e && e.llamacpp);
}
