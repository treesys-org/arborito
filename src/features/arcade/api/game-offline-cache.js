/**
 * Offline game cartridges, desktop files only (~/.config/Arborito/offline-games/).
 */
import { downloadGameBundle } from './game-bundle.js';
import { pinJsdelivrGitHubUrl } from './arcade-games-cdn.js';
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

function classroomEngineSource(bundle) {
    if (!bundle?.files) return '';
    return (
        Object.values(bundle.files).find(
            (t) => typeof t === 'string' && t.includes('drawBoardContent') && t.includes('class GameEngine')
        ) || ''
    );
}

/** Pre-1.2 classroom scrolled the topic list instead of fixed 3-slot pages. */
export function isStaleClassroomBundle(gameId, entryUrl, bundle) {
    const id = String(gameId || '').toLowerCase();
    const path = String(entryUrl || '').toLowerCase();
    if (id !== 'classroom' && !path.includes('/classroom/')) return false;
    const src = classroomEngineSource(bundle);
    if (!src) return false;
    return src.includes('maxVisible') || !src.includes('boardDisplayStart');
}

function bundleCatalogVersionStale(bundle, catalogVersion) {
    if (!catalogVersion) return false;
    if (!bundle?.gameVersion) return true;
    return bundle.gameVersion !== catalogVersion;
}

function bundleIsStale(gameId, entryUrl, bundle, catalogVersion) {
    if (!bundle?.files) return true;
    if (isStaleClassroomBundle(gameId, entryUrl, bundle)) return true;
    return bundleCatalogVersionStale(bundle, catalogVersion);
}

function attachGameVersion(bundle, gameVersion) {
    if (!bundle || !gameVersion) return bundle;
    return { ...bundle, gameVersion };
}

/** @param {string} gameId @param {string} entryUrl @param {{ gameVersion?: string }} [opts] */
export async function downloadAndCacheGame(gameId, entryUrl, opts = {}) {
    if (!isElectronDesktop()) {
        throw new Error('Offline games require the desktop app.');
    }
    const baseUrl = String(entryUrl || '').split('?')[0];
    if (!gameId || !baseUrl) throw new Error('Missing game id or URL');
    const bundle = attachGameVersion(
        await downloadGameBundle(baseUrl, { cacheBust: opts.gameVersion || '' }),
        opts.gameVersion || ''
    );
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
    const baseUrl = String(
        await pinJsdelivrGitHubUrl(String(entryUrl || '').split('?')[0])
    ).split('?')[0];
    if (!baseUrl) throw new Error('Missing game URL');
    const catalogVersion = opts.gameVersion || '';

    if (opts.playOffline) {
        const cached = await getOfflineGameBundle(gameId);
        if (cached?.files?.[baseUrl] && !bundleIsStale(gameId, baseUrl, cached, catalogVersion)) {
            return cached;
        }
        if (isElectronDesktop()) {
            return downloadAndCacheGame(gameId, baseUrl, { gameVersion: catalogVersion });
        }
        if (!cached?.files?.[baseUrl]) {
            throw new Error(
                opts.offlineMissingMessage || 'No offline copy of this game. Play online once first.'
            );
        }
        throw new Error(
            opts.offlineMissingMessage ||
                'Offline copy is outdated. Play online once to refresh this game.'
        );
    }

    const cacheKey = `${gameId || ''}::${baseUrl}::${catalogVersion}`;
    if (!opts.skipSessionCache && sessionBundleCache.has(cacheKey)) {
        const hit = sessionBundleCache.get(cacheKey);
        if (!bundleIsStale(gameId, baseUrl, hit, catalogVersion)) {
            return hit;
        }
        sessionBundleCache.delete(cacheKey);
    }

    let bundle;
    if (isElectronDesktop()) {
        bundle = await downloadAndCacheGame(gameId, baseUrl, { gameVersion: catalogVersion });
    } else {
        bundle = attachGameVersion(
            await downloadGameBundle(baseUrl, { cacheBust: catalogVersion }),
            catalogVersion
        );
    }
    rememberSessionBundle(cacheKey, bundle);
    return bundle;
}
