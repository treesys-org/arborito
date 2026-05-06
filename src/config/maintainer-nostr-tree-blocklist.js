/**
 * Blocklist **curated by whoever ships this build** (pub + universeId of public Nostr trees).
 *
 * Pairs are **not** stored in plain source: `MAINTAINER_BLOCKLIST_JSON_B64` is UTF-8 JSON
 * Base64-encoded (e.g. `[]` → `W10=`).
 *
 * Generate value (empty list): `printf '%s' '[]' | base64 -w0`
 * With entries: `printf '%s' '[{"ownerPub":"…","universeId":"…"}]' | base64 -w0`
 *
 * - If a pair is in the decoded list, **this app does not load** that `nostr://` or code that resolves to that pair.
 * - **Not** automatic moderation (reports / legal dispute).
 */
import { parseNostrTreeUrl } from '../services/nostr-refs.js';

/** Base64(UTF-8 JSON): array of `{ ownerPub, universeId }`. Default `[]`. */
export const MAINTAINER_BLOCKLIST_JSON_B64 = 'W10=';

function decodeUtf8Base64ToString(b64) {
    const t = String(b64 || '').trim();
    if (!t) return '[]';
    try {
        if (typeof atob === 'function') {
            const binary = atob(t);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            return new TextDecoder('utf-8').decode(bytes);
        }
    } catch {
        /* fall through */
    }
    try {
        if (typeof Buffer !== 'undefined') return Buffer.from(t, 'base64').toString('utf8');
    } catch {
        /* ignore */
    }
    return '[]';
}

function loadBlockedPairs() {
    try {
        const raw = decodeUtf8Base64ToString(MAINTAINER_BLOCKLIST_JSON_B64);
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) return [];
        return arr;
    } catch {
        return [];
    }
}

const _key = (ownerPub, universeId) =>
    `${String(ownerPub || '').trim()}/${String(universeId || '').trim()}`;

const _blocked = (() => {
    const s = new Set();
    for (const row of loadBlockedPairs()) {
        if (!row || typeof row !== 'object') continue;
        const k = _key(row.ownerPub, row.universeId);
        if (k !== '/') s.add(k);
    }
    return s;
})();

/**
 * @param {string} ownerPub
 * @param {string} universeId
 * @returns {boolean}
 */
export function isNostrTreeMaintainerBlocked(ownerPub, universeId) {
    return _blocked.has(_key(ownerPub, universeId));
}

/**
 * @param {string} urlOrHref `nostr://…` o URL ya normalizada
 * @returns {boolean}
 */
export function isNostrUrlMaintainerBlocked(urlOrHref) {
    try {
        const g = parseNostrTreeUrl(String(urlOrHref || '').trim());
        if (!g) return false;
        return isNostrTreeMaintainerBlocked(g.pub, g.universeId);
    } catch {
        return false;
    }
}
