/**
 * "Sync code" login: username + high-entropy secret (typed or scanned via QR).
 * The hashed secret is published to Nostr; plaintext is shown once at registration
 * and never leaves the device unless the user copies / exports it.
 */

import { normalizeUsername } from '../../../shared/lib/normalize-username.js';
import { getPublicKey } from '../../../../vendor/nostr-tools/lib/esm/pure.js';
import { sha256 } from '../../../../vendor/deps/noble-hashes/esm/sha256.js';
import { bytesToHex } from '../../../../vendor/deps/noble-hashes/esm/utils.js';

/* 6 groups × 4 hex = 24 hex chars = 12 random bytes = 96 bits of entropy.
 * The SHA-256 of this secret is published to public relays keyed by username,
 * so it must resist offline brute force: 96 bits puts that well out of reach
 * while staying short enough to type/scan ("XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"). */
const GROUPS = 6;
const HEX_PER_GROUP = 4;

function randomBytes(n) {
    const out = new Uint8Array(n);
    crypto.getRandomValues(out);
    return out;
}

function bytesToHexUpper(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i++) {
        s += bytes[i].toString(16).toUpperCase().padStart(2, '0');
    }
    return s;
}

/** @param {string} input */
export function normalizeSyncSecret(input) {
    return String(input || '')
        .trim()
        .replace(/\s+/g, '')
        .replace(/-/g, '')
        .toUpperCase();
}

export function formatSyncSecretForDisplay(normalized) {
    const s = normalizeSyncSecret(normalized);
    if (!s) return '';
    const parts = [];
    for (let i = 0; i < s.length; i += HEX_PER_GROUP) {
        parts.push(s.slice(i, i + HEX_PER_GROUP));
    }
    return parts.join('-');
}

export function generatePlainSyncSecret() {
    const raw = randomBytes((GROUPS * HEX_PER_GROUP) / 2);
    const hex = bytesToHexUpper(raw);
    return formatSyncSecretForDisplay(hex);
}

/** Constant-time string compare (length-insensitive guard). */
function timingSafeEqualString(a, b) {
    const aa = String(a || '');
    const bb = String(b || '');
    if (aa.length !== bb.length) return false;
    let out = 0;
    for (let i = 0; i < aa.length; i++) out |= aa.charCodeAt(i) ^ bb.charCodeAt(i);
    return out === 0;
}

async function sha256Bytes(data) {
    const subtle = globalThis.crypto?.subtle;
    if (subtle && typeof subtle.digest === 'function') {
        const buf = await subtle.digest('SHA-256', data);
        return new Uint8Array(buf);
    }
    const { sha256 } = await import('../../../../vendor/deps/noble-hashes/esm/sha256.js');
    return sha256(data);
}

/** SHA-256(normalize(plain)) → base64url (no padding). */
export async function hashSyncSecret(plain) {
    const norm = normalizeSyncSecret(plain);
    const enc = new TextEncoder().encode(norm);
    const bytes = await sha256Bytes(enc);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const b64 = btoa(bin);
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

const SYNC_LOGIN_QR_KIND = 'arborito.sync.login';

/**
 * @param {string} username
 * @param {string} plainSecret
 */
export function buildSyncLoginQrPayload(username, plainSecret) {
    const u = String(username || '').trim();
    const s = normalizeSyncSecret(plainSecret);
    if (!u || !s) return '';
    try {
        return JSON.stringify({ v: 1, k: SYNC_LOGIN_QR_KIND, u, s });
    } catch {
        return '';
    }
}

/**
 * @param {string} text
 * @returns {{ username: string, secret: string } | null}
 */
export function parseSyncLoginFromText(text) {
    const raw = String(text || '').trim();
    if (!raw) return null;
    try {
        const o = JSON.parse(raw);
        if (!o || typeof o !== 'object') return null;
        if (o.k !== SYNC_LOGIN_QR_KIND) return null;
        const u = String(o.u || '').trim();
        const s = normalizeSyncSecret(o.s || '');
        if (!u || !s) return null;
        return { username: u, secret: s };
    } catch {
        return null;
    }
}

/**
 * Parse `downloadSyncSecretFile` export (plain text lines).
 * @param {string} text
 * @returns {{ username: string, secret: string } | null}
 */
export function parseSyncLoginFromExportFile(text) {
    let u = '';
    let s = '';
    for (const line of String(text || '').split(/\r?\n/)) {
        const m1 = line.match(/^\s*Username:\s*(.+)\s*$/i);
        if (m1) u = String(m1[1] || '').trim();
        const m2 = line.match(/^\s*Secret:\s*(.+)\s*$/i);
        if (m2) s = String(m2[1] || '').trim();
    }
    if (!u || !s) return null;
    return { username: u, secret: normalizeSyncSecret(s) };
}

/**
 * @param {string} storedHashB64u
 * @param {string} candidatePlain
 */
export async function syncSecretMatchesStored(storedHashB64u, candidatePlain) {
    const want = String(storedHashB64u || '').trim();
    if (!want) return false;
    const got = await hashSyncSecret(candidatePlain);
    return timingSafeEqualString(want, got);
}

/**
 * Deterministically derive the Nostr keypair that signs this account's
 * sync-login record, from (username + secret) alone.
 *
 * Why: the sync-login record (the SHA-256 of the secret, keyed by username on
 * public relays) is the account gate. If it were signed by a random per-browser
 * key, ANY stranger could publish a record under the same username `d` tag and
 * either lock the owner out or claim an unregistered name. By signing it with a
 * key that only someone who knows the secret can reproduce, the record becomes
 * self-authenticating: sign-in derives the same pubkey from the typed secret and
 * fetches/verifies ONLY that author's record (`authors:[pub]`), so a forged
 * record signed by a different key is invisible and cannot replace it
 * (replaceable events are per pubkey+`d`). Deriving from the secret also makes
 * the signing key identical across devices, fixing the old per-browser
 * ambiguity. It never leaves the device and is unrelated to the user's content
 * key pair.
 *
 * @param {string} username
 * @param {string} plainSecret
 * @returns {{ pub: string, priv: string } | null}
 */
export function deriveAccountSigningPair(username, plainSecret) {
    const norm = normalizeUsername(username);
    const sec = normalizeSyncSecret(plainSecret);
    if (!norm || !sec) return null;
    const enc = new TextEncoder();
    let seed = sha256(enc.encode(`arborito:account-sign:v1|${norm}|${sec}`));
    /* sha256 output is a uniform 256-bit value; the (astronomically unlikely)
     * case where it is not a valid secp256k1 scalar is handled by rehashing so
     * the derivation stays deterministic across devices. */
    for (let i = 0; i < 8; i++) {
        try {
            const pub = getPublicKey(seed);
            if (/^[0-9a-f]{64}$/.test(pub)) return { pub, priv: bytesToHex(seed) };
        } catch {
            /* invalid scalar — fall through to rehash */
        }
        seed = sha256(seed);
    }
    return null;
}

/** Normalize a username for storage keys, tags, and lookups (lowercase, trimmed). */
export { normalizeUsername };
