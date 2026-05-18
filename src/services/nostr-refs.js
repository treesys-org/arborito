/**
 * Public tree URLs use `nostr://pub/universeId` (normalized forms).
 * Format: `nostr://<hex64-pubkey>/<universeId>` (universeId URL-encoded if needed).
 */

/**
 * @param {string} input
 * @returns {{ pub: string, universeId: string } | null}
 */
export function parseNostrTreeUrl(input) {
    const s = String(input || '').trim();
    if (!s) return null;
    const m = s.match(/^nostr:\/\/([0-9a-fA-F]{64})\/([^?#]+)$/i);
    if (!m) return null;
    let uid = m[2];
    try {
        uid = decodeURIComponent(uid);
    } catch {
        /* keep raw */
    }
    return { pub: m[1].toLowerCase(), universeId: uid };
}

/**
 * @param {string} pubHex64
 * @param {string} universeId
 */
export function formatNostrTreeUrl(pubHex64, universeId) {
    const p = String(pubHex64 || '').toLowerCase();
    const u = String(universeId != null ? universeId : '');
    return `nostr://${p}/${encodeURIComponent(u)}`;
}

/**
 * @param {string} input
 * @returns {boolean}
 */
export function isNostrTreeUrl(input) {
    return !!parseNostrTreeUrl(String(input || '').trim());
}

export { isNostrNetworkAvailable, createNostrPair } from './nostr-universe.js';
