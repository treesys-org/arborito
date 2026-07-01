/**
 * Offline game cartridges — desktop files only (~/.config/Arborito/offline-games/).
 */
import { downloadGameBundle } from './game-bundle.js';
import { isElectronDesktop } from '../../learning/api/electron-bridge.js';

/** In-memory cache so replaying the same cartridge in one session is instant. */
const sessionBundleCache = new Map();
const SESSION_CACHE_MAX = 6;

function rememberSessionBundle(cacheKey, bundle) {
    if (sessionBundleCache.has(cacheKey)) sessionBundleCache.delete(cacheKey);
    sessionBundleCache.set(cacheKey, bundle);
    while (sessionBundleCache.size > SESSION_CACHE_MAX) {
        const oldest = sessionBundleCache.keys().next().value;
        sessionBundleCache.delete(oldest);
    }
}

function ud() {
    if (!isElectronDesktop()) return null;
    return typeof window !== 'undefined' ? window.arboritoElectron?.userData : null;
}

/** @param {string} gameId @param {{ entryUrl: string, files: Record<string, string>, updatedAt: number }} bundle */
async function saveOfflineGameBundle(gameId, bundle) {
    if (!gameId || !bundle?.entryUrl) return false;
    const electron = ud();
    if (!electron?.offlineGamePut) return false;
    return electron.offlineGamePut(gameId, bundle);
}

/** @param {string} gameId */
async function getOfflineGameBundle(gameId) {
    if (!gameId) return null;
    const electron = ud();
    if (!electron?.offlineGameGet) return null;
    return electron.offlineGameGet(gameId);
}

/** @param {string} gameId */
export async function hasOfflineGameBundle(gameId) {
    const bundle = await getOfflineGameBundle(gameId);
    return !!(bundle && bundle.entryUrl);
}

/** @param {string} gameId */
export async function removeOfflineGameBundle(gameId) {
    if (!gameId) return false;
    const electron = ud();
    if (!electron?.offlineGameRemove) return false;
    return electron.offlineGameRemove(gameId);
}

/** @param {string} gameId @param {string} entryUrl */
export async function downloadAndCacheGame(gameId, entryUrl) {
    if (!isElectronDesktop()) {
        throw new Error('Offline games require the desktop app.');
    }
    const baseUrl = String(entryUrl || '').split('?')[0];
    if (!gameId || !baseUrl) throw new Error('Missing game id or URL');
    const bundle = await downloadGameBundle(baseUrl);
    const saved = await saveOfflineGameBundle(gameId, bundle);
    if (!saved) throw new Error('Could not save offline copy');
    return bundle;
}

/**
 * Load a cartridge bundle for play. Web fetches online only; desktop caches while playing.
 * @param {string} gameId
 * @param {string} entryUrl
 * @param {{ playOffline?: boolean }} [opts]
 */
export async function fetchGameBundleForPlay(gameId, entryUrl, opts = {}) {
    const baseUrl = String(entryUrl || '').split('?')[0];
    if (!baseUrl) throw new Error('Missing game URL');

    if (opts.playOffline) {
        const bundle = await getOfflineGameBundle(gameId);
        if (!bundle?.files?.[baseUrl]) {
            throw new Error(
                opts.offlineMissingMessage || 'No offline copy of this game. Play online once first.'
            );
        }
        return bundle;
    }

    const cacheKey = `${gameId || ''}::${baseUrl}`;
    if (!opts.skipSessionCache && sessionBundleCache.has(cacheKey)) {
        return sessionBundleCache.get(cacheKey);
    }

    let bundle;
    if (isElectronDesktop()) {
        bundle = await downloadAndCacheGame(gameId, baseUrl);
    } else {
        bundle = await downloadGameBundle(baseUrl);
    }
    rememberSessionBundle(cacheKey, bundle);
    return bundle;
}
