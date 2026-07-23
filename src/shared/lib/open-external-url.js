import { isElectronDesktop } from '../../features/learning/api/electron-bridge.js';

/**
 * Open an http(s) URL in the user's default browser.
 * Electron: one IPC call only (never window.open, that retriggers openExternal/xdg-open).
 * @param {string} url
 * @returns {Promise<boolean>}
 */
export async function openExternalUrl(url) {
    const href = String(url || '').trim();
    if (!href) return false;
    try {
        const parsed = new URL(href);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    } catch {
        return false;
    }

    const bridge = window.arboritoElectron;
    if (!isElectronDesktop()) {
        window.open(href, '_blank', 'noopener,noreferrer');
        return true;
    }

    if (typeof bridge?.openExternalUrlSync === 'function') {
        try {
            const res = bridge.openExternalUrlSync(href);
            return !!res?.ok;
        } catch (e) {
            console.warn('[arborito] openExternalUrlSync failed', e);
        }
    }

    if (typeof bridge?.openExternalUrl === 'function') {
        try {
            const res = await bridge.openExternalUrl(href);
            return !!res?.ok;
        } catch (e) {
            console.warn('[arborito] openExternalUrl failed', e);
        }
    }

    return false;
}
