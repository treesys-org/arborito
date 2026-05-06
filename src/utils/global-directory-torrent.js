import { GLOBAL_DIRECTORY_TORRENT_MAX_ENTRIES } from '../config/directory-index.js';
import { normalizeNostrRelayUrls } from '../config/nostr-relays-runtime.js';
import {
    getWindowGlobalDirectoryJsonUrl,
    getWindowGlobalDirectoryTorrentMagnet,
    getWindowGlobalDirectoryTorrentPath,
    getWindowGlobalDirectoryPointerUrl,
    getWindowGlobalDirectoryPointerTtlMs
} from '../config/global-directory-torrent-runtime.js';

export { usesGlobalDirectoryPointerForTorrent } from '../config/global-directory-torrent-runtime.js';

/** @type {{ pointerUrl: string, magnet: string, path: string, fetchedAt: number }} */
let _torrentPointerCache = { pointerUrl: '', magnet: '', path: '', fetchedAt: 0 };

/** Last per-torrent index magnet we added to the client (drop the previous one if the pointer changes). */
let _lastResolvedDirectoryTorrentMagnet = '';

/**
 * @param {string} s
 * @returns {boolean}
 */
function isMagnetUri(s) {
    return /^magnet:\?/i.test(String(s || '').trim());
}

/**
 * @param {string} text
 * @returns {{ magnet: string, path: string }|null}
 */
function parsePointerJson(text) {
    let o;
    try {
        o = JSON.parse(String(text || '').trim());
    } catch {
        return null;
    }
    if (!o || typeof o !== 'object') return null;
    const magnet = String(o.magnet || '').trim();
    if (!magnet) return null;
    const path = String(o.path || '').trim();
    return { magnet, path };
}

/**
 * Resuelve magnet + path: magnet fijo en `window`, o puntero HTTP, o nada.
 * @param {{ webtorrent?: { available?: () => boolean, removeTorrent?: (o: { magnet: string }) => Promise<void> } }} store
 * @returns {Promise<{ magnet: string, path: string, fromPointer: boolean }|null>}
 */
export async function resolveGlobalDirectoryTorrentSpec(store) {
    const defaultPath = getWindowGlobalDirectoryTorrentPath();
    const fixed = getWindowGlobalDirectoryTorrentMagnet();
    if (fixed) {
        if (!isMagnetUri(fixed)) return null;
        return { magnet: fixed, path: defaultPath, fromPointer: false };
    }

    const pointerUrl = getWindowGlobalDirectoryPointerUrl();
    if (!pointerUrl) return null;

    const ttl = getWindowGlobalDirectoryPointerTtlMs();
    const now = Date.now();
    if (
        _torrentPointerCache.pointerUrl === pointerUrl &&
        _torrentPointerCache.magnet &&
        now - _torrentPointerCache.fetchedAt < ttl
    ) {
        return {
            magnet: _torrentPointerCache.magnet,
            path: _torrentPointerCache.path || defaultPath,
            fromPointer: true
        };
    }

    let res;
    try {
        res = await fetch(pointerUrl, { cache: 'no-store', credentials: 'same-origin' });
    } catch (e) {
        console.warn('[Arborito] global directory pointer fetch failed', e);
        if (_torrentPointerCache.pointerUrl === pointerUrl && _torrentPointerCache.magnet) {
            return {
                magnet: _torrentPointerCache.magnet,
                path: _torrentPointerCache.path || defaultPath,
                fromPointer: true
            };
        }
        return null;
    }
    if (!res.ok) {
        console.warn('[Arborito] global directory pointer HTTP', res.status, pointerUrl);
        if (_torrentPointerCache.pointerUrl === pointerUrl && _torrentPointerCache.magnet) {
            return {
                magnet: _torrentPointerCache.magnet,
                path: _torrentPointerCache.path || defaultPath,
                fromPointer: true
            };
        }
        return null;
    }

    let text;
    try {
        text = await res.text();
    } catch (e) {
        console.warn('[Arborito] global directory pointer read failed', e);
        if (_torrentPointerCache.pointerUrl === pointerUrl && _torrentPointerCache.magnet) {
            return {
                magnet: _torrentPointerCache.magnet,
                path: _torrentPointerCache.path || defaultPath,
                fromPointer: true
            };
        }
        return null;
    }

    const parsed = parsePointerJson(text);
    if (!parsed || !isMagnetUri(parsed.magnet)) {
        console.warn('[Arborito] global directory pointer JSON invalid or missing magnet', pointerUrl);
        if (_torrentPointerCache.pointerUrl === pointerUrl && _torrentPointerCache.magnet) {
            return {
                magnet: _torrentPointerCache.magnet,
                path: _torrentPointerCache.path || defaultPath,
                fromPointer: true
            };
        }
        return null;
    }

    const path = parsed.path.replace(/^\/+/, '') || defaultPath;
    const nextMagnet = parsed.magnet;
    if (
        _lastResolvedDirectoryTorrentMagnet &&
        _lastResolvedDirectoryTorrentMagnet !== nextMagnet &&
        store?.webtorrent &&
        typeof store.webtorrent.removeTorrent === 'function'
    ) {
        try {
            await store.webtorrent.removeTorrent({ magnet: _lastResolvedDirectoryTorrentMagnet });
        } catch {
            /* ignore */
        }
    }
    _lastResolvedDirectoryTorrentMagnet = nextMagnet;
    _torrentPointerCache = { pointerUrl, magnet: nextMagnet, path, fetchedAt: now };
    return { magnet: nextMagnet, path, fromPointer: true };
}

/**
 * @param {unknown} r
 * @returns {string}
 */
function directoryRowKey(r) {
    if (!r || typeof r !== 'object') return '';
    const a = String(r.ownerPub || '').trim();
    const b = String(r.universeId || '').trim();
    if (!a || !b) return '';
    return `${a}/${b}`;
}

/**
 * @param {{ updatedAt?: string }|null} a
 * @param {{ updatedAt?: string }|null} b
 * @returns {{ updatedAt?: string }}
 */
function pickNewerDirectoryRow(a, b) {
    const ta = String(a?.updatedAt || '');
    const tb = String(b?.updatedAt || '');
    const base = tb > ta ? b : a;
    const other = tb > ta ? a : b;
    const relays = normalizeNostrRelayUrls([...(base?.recommendedRelays || []), ...(other?.recommendedRelays || [])]);
    return { ...base, ...(relays.length ? { recommendedRelays: relays } : {}) };
}

/**
 * @param {{ ownerPub?: string, universeId?: string, title?: string, shareCode?: string, updatedAt?: string, description?: string, authorName?: string }[]} nostrRows — filas desde relays Nostr
 * @param {{ ownerPub?: string, universeId?: string, title?: string, shareCode?: string, updatedAt?: string, description?: string, authorName?: string }[]} torrentRows — rows from torrent index
 * @returns {typeof nostrRows}
 */
export function mergeNostrAndTorrentDirectoryRows(nostrRows, torrentRows) {
    const map = new Map();
    for (const r of Array.isArray(nostrRows) ? nostrRows : []) {
        const k = directoryRowKey(r);
        if (k) map.set(k, r);
    }
    for (const r of Array.isArray(torrentRows) ? torrentRows : []) {
        const k = directoryRowKey(r);
        if (!k) continue;
        if (!map.has(k)) {
            map.set(k, r);
            continue;
        }
        map.set(k, pickNewerDirectoryRow(map.get(k), r));
    }
    return Array.from(map.values());
}

/**
 * @param {string} qRaw
 * @param {{ title?: string, description?: string, authorName?: string }} row
 */
function directoryRowMatchesQuery(qRaw, row) {
    const q = String(qRaw || '').trim().toLowerCase();
    if (!q) return true;
    const title = String(row?.title || '').trim();
    const description = String(row?.description || '').trim();
    const authorName = String(row?.authorName || '').trim();
    const hay = `${title}\n${description}\n${authorName}`.toLowerCase();
    return hay.includes(q);
}

/**
 * Normaliza una entrada del JSON del torrent a fila de directorio (mismo shape que filas Nostr).
 * @param {unknown} e
 * @returns {{ ownerPub: string, universeId: string, title: string, shareCode: string, updatedAt: string, description?: string, authorName?: string }|null}
 */
function normalizeTorrentEntry(e) {
    if (!e || typeof e !== 'object') return null;
    const ownerPub = String(e.ownerPub || '').trim();
    const universeId = String(e.universeId || '').trim();
    if (!ownerPub || !universeId) return null;
    const title = String(e.title || 'Arborito').trim() || 'Arborito';
    const shareCode = String(e.shareCode || '').trim();
    const updatedAt = String(e.updatedAt || '').trim();
    const description = String(e.description || '').trim();
    const authorName = String(e.authorName || '').trim();
    const out = {
        ownerPub,
        universeId,
        title,
        shareCode,
        updatedAt
    };
    if (description) out.description = description;
    if (authorName) out.authorName = authorName;
    const relays = normalizeNostrRelayUrls(Array.isArray(e.recommendedRelays) ? e.recommendedRelays : []);
    if (relays.length) out.recommendedRelays = relays;
    return out;
}

/**
 * @param {string} text
 * @param {string} qRaw
 * @returns {{ ownerPub: string, universeId: string, title: string, shareCode: string, updatedAt: string, description?: string, authorName?: string }[]}
 */
function rowsFromGlobalDirectoryJsonText(text, qRaw) {
    const q = String(qRaw || '').trim();
    let parsed;
    try {
        parsed = JSON.parse(String(text || '').trim());
    } catch (e) {
        console.warn('[Arborito] global directory JSON parse failed', e);
        return [];
    }
    const entries = parsed && typeof parsed === 'object' && Array.isArray(parsed.entries) ? parsed.entries : null;
    if (!entries) return [];

    const out = [];
    const cap = Math.max(1, Math.min(800, Number(GLOBAL_DIRECTORY_TORRENT_MAX_ENTRIES) || 160));
    for (let i = 0; i < entries.length && out.length < cap; i++) {
        const row = normalizeTorrentEntry(entries[i]);
        if (!row) continue;
        if (!directoryRowMatchesQuery(q, row)) continue;
        out.push(row);
    }
    return out;
}

/**
 * Global index via `fetch` (same origin or absolute URL). Suited to GitHub Pages.
 * @param {{ query?: string }} [opts]
 */
export async function loadGlobalDirectoryRowsFromHttp(opts = {}) {
    const url = getWindowGlobalDirectoryJsonUrl();
    if (!url) return [];
    const q = String(opts.query || '').trim();
    let res;
    try {
        res = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
    } catch (e) {
        console.warn('[Arborito] global directory HTTP fetch failed', e);
        return [];
    }
    if (!res.ok) {
        console.warn('[Arborito] global directory HTTP', res.status, url);
        return [];
    }
    let text;
    try {
        text = await res.text();
    } catch (e) {
        console.warn('[Arborito] global directory HTTP read failed', e);
        return [];
    }
    return rowsFromGlobalDirectoryJsonText(text, q);
}

/**
 * @param {{ webtorrent?: { available?: () => boolean, readTextFile?: (o: { magnet: string, path: string }) => Promise<string> } }} store
 * @param {{ query?: string }} [opts]
 * @returns {Promise<{ ownerPub: string, universeId: string, title: string, shareCode: string, updatedAt: string, description?: string, authorName?: string }[]>}
 */
export async function loadGlobalDirectoryRowsFromTorrent(store, opts = {}) {
    const spec = await resolveGlobalDirectoryTorrentSpec(store);
    if (!spec?.magnet) return [];

    const wt = store?.webtorrent;
    if (!wt || typeof wt.available !== 'function' || !wt.available() || typeof wt.readTextFile !== 'function') {
        return [];
    }

    const path = spec.path || getWindowGlobalDirectoryTorrentPath();
    const q = String(opts.query || '').trim();

    let text;
    try {
        text = await wt.readTextFile({ magnet: spec.magnet, path });
    } catch (e) {
        console.warn('[Arborito] global directory torrent read failed', e);
        return [];
    }

    return rowsFromGlobalDirectoryJsonText(text, q);
}
