/**
 * Static trigram search shards, the serverless "search tier" for large
 * catalogs (see docs/SEARCH_AND_DIRECTORY_SCALE.md).
 *
 * The aggregator writes one JSON file per trigram (`<tri>.json`); any static
 * host (GitHub Pages, CDN, object storage) serves them, which scales to
 * millions of catalog entries with zero servers to operate. Shards are NOT
 * trusted: every entry carries its signed Nostr event and the client
 * re-verifies signature + PoW per row, so a malicious or compromised host can
 * only omit rows, never inject fake ones.
 */

export const DIRECTORY_SEARCH_SHARD_VERSION = 1;

/** Max rows per trigram shard file (newest first; older rows fall off). */
export const DIRECTORY_SEARCH_SHARD_CAP = 500;

/**
 * Parse + structurally validate a shard payload. Row-level crypto happens in
 * the caller (each row is verified individually so one bad row can't poison
 * the shard).
 * @param {unknown} payload
 * @param {string} tri expected trigram
 * @returns {object[]} raw entries (unverified)
 */
export function entriesFromSearchShardPayload(payload, tri) {
    if (!payload || typeof payload !== 'object') return [];
    if (Number(payload.v) !== DIRECTORY_SEARCH_SHARD_VERSION) return [];
    if (String(payload.tri || '') !== String(tri || '')) return [];
    const entries = Array.isArray(payload.entries) ? payload.entries : [];
    return entries.slice(0, DIRECTORY_SEARCH_SHARD_CAP).filter((e) => e && typeof e === 'object');
}
