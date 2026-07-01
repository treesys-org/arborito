/**
 * Optional global index (same JSON, multiple transports). All transports are
 * OFF by default; operators opt in by setting any of the `window.*` hooks
 * below. Arborito ships no `global-directory.json` itself — point at one you
 * publish yourself.
 *
 * 1) **HTTP (recommended on GitHub Pages):** static file you host.
 *    window.ARBORITO_GLOBAL_DIRECTORY_JSON_URL = 'https://example.org/global-directory.json';
 *
 * 2) **WebTorrent:** magnet + path inside the torrent.
 *    window.ARBORITO_GLOBAL_DIRECTORY_MAGNET = 'magnet:?...';
 *    window.ARBORITO_GLOBAL_DIRECTORY_TORRENT_PATH = 'global-directory.json'; // optional
 *
 * 3) **Pointer to "latest torrent" (model B):** small JSON whose magnet rolls forward.
 *    window.ARBORITO_GLOBAL_DIRECTORY_POINTER_URL = 'https://example.org/global-directory-pointer.json';
 *    File shape: `{ "magnet": "magnet:?xt=urn:btih:...", "path": "global-directory.json" }`.
 *    If you also set `ARBORITO_GLOBAL_DIRECTORY_MAGNET`, the fixed magnet wins.
 *    `ARBORITO_GLOBAL_DIRECTORY_POINTER_TTL_MS` — pointer re-fetch interval (default 120000).
 *
 * CI/job updates the torrent JSON; course publication stays on Nostr (live).
 */

import { GLOBAL_DIRECTORY_TORRENT_DEFAULT_PATH } from './directory-index-config.js';

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
