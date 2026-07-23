/**
 * Client side of the static search shards (see directory-search-shared.js).
 *
 * Enabled by pointing `window.ARBORITO_GLOBAL_DIRECTORY_SEARCH_URL` at the
 * folder the aggregator wrote (`ARBORITO_INDEX_SEARCH_DIR`). Off by default,
 * without the hook this module returns no rows and the relay trigram search
 * carries discovery alone.
 */

import { hasGdprNetworkConsent } from '../../../shared/lib/connected-services/index.js';
import {
    catalogRowMatchesQuery,
    directoryRowKey,
    rankTrigramsForSearch,
    trigramsFromQuery,
} from '../../nostr/api/directory-trigram-index.js';
import { verifyGlobalTreeDirectoryMetaNostr } from './directory-index-shared.js';
import { entriesFromSearchShardPayload } from './directory-search-shared.js';

/** @returns {string} base URL of the shard folder ('' = feature off). */
export function getWindowGlobalDirectorySearchUrl() {
    try {
        const v = globalThis.ARBORITO_GLOBAL_DIRECTORY_SEARCH_URL;
        const s = typeof v === 'string' ? v.trim() : '';
        return s ? s.replace(/\/+$/, '') : '';
    } catch {
        return '';
    }
}

function isCrossOrigin(url) {
    try {
        const u = new URL(url, typeof window !== 'undefined' ? window.location.href : 'http://localhost/');
        return typeof window !== 'undefined' && u.origin !== window.location.origin;
    } catch {
        return false;
    }
}

/** Per-session shard cache: shards are static files rebuilt on a cron. */
const _shardCache = new Map();
const SHARD_CACHE_TTL_MS = 120000;
const SHARD_CACHE_MAX = 40;

async function fetchShard(baseUrl, tri) {
    const now = Date.now();
    const cached = _shardCache.get(tri);
    if (cached && now - cached.at < SHARD_CACHE_TTL_MS) return cached.entries;
    let entries = [];
    try {
        const res = await fetch(`${baseUrl}/${encodeURIComponent(tri)}.json`, {
            cache: 'no-store',
            credentials: 'same-origin'
        });
        // 404 is normal: no tree contains that trigram.
        if (res.ok) entries = entriesFromSearchShardPayload(await res.json(), tri);
    } catch {
        entries = [];
    }
    if (_shardCache.size >= SHARD_CACHE_MAX) {
        const oldest = _shardCache.keys().next().value;
        if (oldest !== undefined) _shardCache.delete(oldest);
    }
    _shardCache.set(tri, { at: now, entries });
    return entries;
}

/**
 * Search the static shard index. Rows come back in the same shape as Nostr
 * directory rows, each one re-verified (signature + PoW), the host is
 * untrusted.
 * @param {{ query?: string, limit?: number, excludeKeys?: Set<string> }} [opts]
 * @returns {Promise<object[]>}
 */
export async function searchGlobalDirectoryViaHttpShards(opts = {}) {
    const baseUrl = getWindowGlobalDirectorySearchUrl();
    if (!baseUrl) return [];
    /* GDPR: a cross-origin shard host sees the visitor's IP/UA (and the search
     * trigrams). Same consent gate as the other optional HTTP transports. */
    if (isCrossOrigin(baseUrl) && !hasGdprNetworkConsent()) return [];

    const q = String(opts.query || '').trim();
    if (q.length < 3) return [];
    const limit = Math.max(1, Math.min(800, Number(opts.limit) || 120));
    const excludeKeys = opts.excludeKeys instanceof Set ? opts.excludeKeys : new Set();

    const tris = rankTrigramsForSearch(trigramsFromQuery(q)).filter((t) => t.length === 3);
    if (!tris.length) return [];

    /* Rarest trigram narrows the candidate set most; a second shard only when
     * the first one came back thin. */
    let candidates = await fetchShard(baseUrl, tris[0]);
    if (candidates.length < limit && tris.length > 1) {
        const extra = await fetchShard(baseUrl, tris[1]);
        candidates = [...candidates, ...extra];
    }

    const out = [];
    const seen = new Set();
    for (const meta of candidates) {
        if (out.length >= limit) break;
        const key = directoryRowKey(meta.ownerPub, meta.universeId);
        if (!key || seen.has(key) || excludeKeys.has(key)) continue;
        seen.add(key);
        if (meta.delisted === true) continue;
        if (!catalogRowMatchesQuery(q, meta)) continue;
        if (!(await verifyGlobalTreeDirectoryMetaNostr(meta.sig, meta))) continue;
        const { sig: _sig, ...row } = meta;
        out.push(row);
    }
    return out;
}
