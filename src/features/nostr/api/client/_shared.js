/**
 * Cross-cutting helpers and constants used by every nostr mixin.
 * Shared helpers for the Nostr client facade (`client/index.js`).
 * lift them into a sibling module so each mixin file can import only what it
 * actually needs.
 */

import {
    getPublicKey,
    generateSecretKey
} from '../../../../../vendor/nostr-tools/lib/esm/index.js';
import { bytesToHex, hexToBytes } from '../../../../../vendor/deps/noble-hashes/esm/utils.js';
import { NOSTR_CHUNK_CONTENT_MAX, arbRootTag } from '../nostr-spec.js';

export const QUERY_MS = 4000;
export const QUERY_MS_LONG = 12000;

/** Safe UTF-8 budget for forum message bodies (pending envelope must stay under relay max). */
export const FORUM_MESSAGE_BODY_MAX = 7000;
/** Thread title / subject on Nostr forum buckets. */
export const FORUM_THREAD_TITLE_MAX = 240;

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
    const bytes = new TextEncoder().encode(str);
    if (bytes.length <= maxBytes) return [str];
    const dec = new TextDecoder();
    const out = [];
    let i = 0;
    while (i < bytes.length) {
        let end = Math.min(bytes.length, i + maxBytes);
        /* If `end` lands inside a multi-byte sequence, walk back to the lead byte. */
        while (end > i && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
        if (end <= i) {
            /* Lead byte alone would exceed max: take the whole codepoint (rare; emoji). */
            end = i + 1;
            while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end++;
        }
        out.push(dec.decode(bytes.subarray(i, end)));
        i = end;
    }
    if (!out.length) out.push('');
    return out;
}

export function utf8ByteLength(s) {
    return new TextEncoder().encode(String(s ?? '')).length;
}

/** Fail closed when relay content would exceed NOSTR_CHUNK_CONTENT_MAX. */
export function assertNostrContentSize(content, label = 'event') {
    const n = utf8ByteLength(content);
    if (n > NOSTR_CHUNK_CONTENT_MAX) {
        const err = new Error(`Nostr ${label} too large: ${n} bytes (max ${NOSTR_CHUNK_CONTENT_MAX})`);
        err.code = 'nostr_content_too_large';
        err.bytes = n;
        err.maxBytes = NOSTR_CHUNK_CONTENT_MAX;
        throw err;
    }
    return n;
}

export function isNostrContentTooLargeError(e) {
    if (!e) return false;
    if (e.code === 'nostr_content_too_large') return true;
    return /too large/i.test(String(e.message || e));
}

/** Truncate to at most maxBytes UTF-8 without splitting a codepoint. */
export function truncateUtf8(s, maxBytes) {
    const str = String(s ?? '');
    const limit = Math.max(0, Math.floor(Number(maxBytes)) || 0);
    const bytes = new TextEncoder().encode(str);
    if (bytes.length <= limit) return str;
    let end = limit;
    while (end > 0 && (bytes[end] & 0xc0) === 0x80) end--;
    return new TextDecoder().decode(bytes.subarray(0, end));
}

/**
 * Pending forum records must not duplicate `body` outside `sig`
 * (outer+inner body blew past the relay limit well under an 8KB body budget).
 */
export function slimForumPendingRecord(message) {
    if (!message || typeof message !== 'object') return message;
    const author = message.author && typeof message.author === 'object' ? message.author : {};
    return {
        id: String(message.id || ''),
        threadId: String(message.threadId || ''),
        createdAt: String(message.createdAt || ''),
        parentId: String(message.parentId || ''),
        author: {
            pub: String(author.pub || ''),
            name: truncateUtf8(String(author.name || ''), 120),
            avatar: truncateUtf8(String(author.avatar || '💬'), 32)
        },
        sig: message.sig
    };
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
