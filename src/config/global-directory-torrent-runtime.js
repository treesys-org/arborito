/**
 * Optional global index (same JSON, multiple transports):
 *
 * 1) **HTTP (recommended on GitHub Pages):** static file on the same site, no seeders.
 *    window.ARBORITO_GLOBAL_DIRECTORY_JSON_URL = './global-directory.json';
 *    o URL absoluta https://arborito.org/global-directory.json
 *
 * 2) **WebTorrent:** magnet + ruta dentro del torrent (job/CI que regenere el torrent).
 *    window.ARBORITO_GLOBAL_DIRECTORY_MAGNET = 'magnet:?...';
 *    window.ARBORITO_GLOBAL_DIRECTORY_TORRENT_PATH = 'global-directory.json'; // optional
 *
 * 3) **Pointer to “latest torrent” (model B):** fixed URL to a small JSON that only changes when there is a new magnet.
 *    window.ARBORITO_GLOBAL_DIRECTORY_POINTER_URL = './global-directory-pointer.json';
 *    File must be JSON: `{ "magnet": "magnet:?xt=urn:btih:...", "path": "global-directory.json" }` (path optional).
 *    If you also set `ARBORITO_GLOBAL_DIRECTORY_MAGNET`, the fixed magnet wins and the pointer is ignored.
 *    `ARBORITO_GLOBAL_DIRECTORY_POINTER_TTL_MS` — pointer re-fetch interval (default 120000).
 *
 * CI/job updates the torrent JSON; course publication stays on Nostr (live).
 */

import { GLOBAL_DIRECTORY_TORRENT_DEFAULT_PATH } from './directory-index.js';

/** @returns {string} URL (relativa al HTML o absoluta) del JSON del directorio global. */
export function getWindowGlobalDirectoryJsonUrl() {
    try {
        const v = globalThis.ARBORITO_GLOBAL_DIRECTORY_JSON_URL;
        const s = typeof v === 'string' ? v.trim() : '';
        return s;
    } catch {
        return '';
    }
}

/** @returns {string} */
export function getWindowGlobalDirectoryTorrentMagnet() {
    try {
        const v = globalThis.ARBORITO_GLOBAL_DIRECTORY_MAGNET;
        const s = typeof v === 'string' ? v.trim() : '';
        return s;
    } catch {
        return '';
    }
}

/** @returns {string} Pointer JSON URL (current per-torrent index magnet). */
export function getWindowGlobalDirectoryPointerUrl() {
    try {
        const v = globalThis.ARBORITO_GLOBAL_DIRECTORY_POINTER_URL;
        const s = typeof v === 'string' ? v.trim() : '';
        return s;
    } catch {
        return '';
    }
}

/** @returns {number} ms between pointer re-fetches (min 15s, max 1h). */
export function getWindowGlobalDirectoryPointerTtlMs() {
    try {
        const v = globalThis.ARBORITO_GLOBAL_DIRECTORY_POINTER_TTL_MS;
        const n = Number(v);
        if (!Number.isFinite(n)) return 120000;
        return Math.max(15000, Math.min(3600000, Math.floor(n)));
    } catch {
        return 120000;
    }
}

/** Pointer active and no fixed magnet: torrent index follows pointer JSON (may lag vs Nostr relays). */
export function usesGlobalDirectoryPointerForTorrent() {
    return !!getWindowGlobalDirectoryPointerUrl() && !getWindowGlobalDirectoryTorrentMagnet();
}

/** @returns {string} */
export function getWindowGlobalDirectoryTorrentPath() {
    try {
        const v = globalThis.ARBORITO_GLOBAL_DIRECTORY_TORRENT_PATH;
        const s = typeof v === 'string' && v.trim() ? v.trim() : GLOBAL_DIRECTORY_TORRENT_DEFAULT_PATH;
        return s.replace(/^\/+/, '');
    } catch {
        return GLOBAL_DIRECTORY_TORRENT_DEFAULT_PATH;
    }
}
