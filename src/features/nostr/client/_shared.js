/**
 * Cross-cutting helpers and constants used by every nostr mixin.
 * The original `nostr-universe.js` file kept these as module-level helpers; we
 * lift them into a sibling module so each mixin file can import only what it
 * actually needs.
 */

import {
    getPublicKey,
    generateSecretKey
} from '../../../../vendor/nostr-tools/lib/esm/index.js';
import { bytesToHex, hexToBytes } from '../../../../vendor/deps/noble-hashes/esm/utils.js';
import { NOSTR_CHUNK_CONTENT_MAX, arbRootTag } from '../nostr-spec.js';

export const QUERY_MS = 4500;
export const QUERY_MS_LONG = 16000;

export function tagValue(ev, name) {
    const t = (ev.tags || []).find((x) => x && x[0] === name);
    return t && t.length > 1 ? String(t[1]) : '';
}

export function hasArbRoot(ev, pub, universeId) {
    const want = arbRootTag(pub, universeId);
    return (ev.tags || []).some((t) => t.length >= 4 && t[0] === want[0] && t[1] === want[1] && t[2] === want[2] && t[3] === want[3]);
}

export function splitUtf8Chunks(s, max = NOSTR_CHUNK_CONTENT_MAX) {
    const str = String(s);
    const maxBytes = Math.max(1, Math.floor(Number(max)) || NOSTR_CHUNK_CONTENT_MAX);
    const out = [];
    let i = 0;
    while (i < str.length) {
        let end = Math.min(str.length, i + maxBytes);
        while (end > i && (str.codePointAt(end - 1) & 0xfc00) === 0xdc00) end--;
        if (end <= i) end = i + 1;
        out.push(str.slice(i, end));
        i = end;
    }
    if (!out.length) out.push('');
    return out;
}

export function pairSecretKey(pair) {
    const h = String(pair.priv || '').trim();
    if (!/^[0-9a-fA-F]{64}$/.test(h)) throw new Error('Invalid publisher secret key (expect 64 hex).');
    return hexToBytes(h);
}

/** @param {{ priv: string }} pair */
export async function createNostrPair() {
    const sk = generateSecretKey();
    return { pub: getPublicKey(sk), priv: bytesToHex(sk) };
}

export function isNostrNetworkAvailable() {
    try {
        return typeof WebSocket !== 'undefined';
    } catch {
        return false;
    }
}
