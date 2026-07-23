/** True when running inside the Electron desktop app (not plain browser). */
export function isElectronDesktop() {
    if (typeof window === 'undefined') return false;
    const ua = String(navigator.userAgent || '');
    if (/\bElectron\//i.test(ua) || /\belectron\b/i.test(ua)) return true;
    const e = window.arboritoElectron;
    return !!(e && (e.llamacpp || e.sageVoice || e.fetchUrl || e.resolveAsset || e.userData || e.openExternalUrl || e.openExternalUrlSync || e.saveExportFile || e.appUpdate));
}

/**
 * True inside a Capacitor native shell (Android / iOS APK), not mobile Chrome.
 * Uses the global Capacitor injects; no @capacitor/core import in the web bundle.
 */
export function isCapacitorNative() {
    if (typeof window === 'undefined') return false;
    try {
        const c = window.Capacitor;
        if (!c) return false;
        if (typeof c.isNativePlatform === 'function') return !!c.isNativePlatform();
        const platform = typeof c.getPlatform === 'function' ? c.getPlatform() : c.platform;
        return platform === 'android' || platform === 'ios';
    } catch {
        return false;
    }
}

/** Electron desktop or Capacitor native — not a plain browser tab. */
export function isInstalledAppShell() {
    return isElectronDesktop() || isCapacitorNative();
}

/**
 * Prefer app/device copy when running in Capacitor; otherwise the browser key.
 * @param {Record<string, string>} ui
 * @param {string} webKey
 * @param {string} appKey
 * @param {string} [fallback]
 */
export function pickHostUi(ui, webKey, appKey, fallback = '') {
    const bag = ui || {};
    if (isCapacitorNative()) {
        const app = bag[appKey];
        if (app != null && String(app).trim()) return String(app);
    }
    const web = bag[webKey];
    if (web != null && String(web).trim()) return String(web);
    return fallback;
}

/** Windows packaged app-update bridge (undefined on web / other platforms). */
export function getAppUpdateBridge() {
    if (typeof window === 'undefined') return null;
    const bridge = window.arboritoElectron?.appUpdate;
    if (!bridge || typeof bridge.onAvailable !== 'function') return null;
    return bridge;
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
