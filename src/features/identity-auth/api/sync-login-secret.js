/**
 * Online account credentials: username + password (or recovery kit on another device).
 * The hashed credential is published to Nostr; plaintext stays on the device unless the user exports a sync key.
 */

import { normalizeUsername } from '../../../shared/lib/normalize-username.js';
import { looksLikeSyncSecretCode } from './login-password-strength.js';
import { getPublicKey } from '../../../../vendor/nostr-tools/lib/esm/pure.js';
import { sha256 } from '../../../../vendor/deps/noble-hashes/esm/sha256.js';
import { bytesToHex } from '../../../../vendor/deps/noble-hashes/esm/utils.js';

/** Published on Nostr sync-login record (`credential` field). */
export const CREDENTIAL_KIND_SYNC_CODE = 'sync_code';
export const CREDENTIAL_KIND_PASSWORD = 'password';

/**
 * Trim user-chosen password; preserve case and symbols (unlike hex sync codes).
 * @param {string} input
 */
export function normalizeUserPassword(input) {
    return String(input || '').trim();
}

/**
 * @param {string} plain
 * @param {string} [credentialKind]
 */
export function normalizeCredentialSecret(plain, credentialKind = CREDENTIAL_KIND_SYNC_CODE) {
    if (credentialKind === CREDENTIAL_KIND_PASSWORD) {
        return normalizeUserPassword(plain);
    }
    return normalizeSyncSecret(plain);
}

/**
 * @param {string} credentialKind
 */
export function resolveCredentialKind(credentialKind) {
    return credentialKind === CREDENTIAL_KIND_PASSWORD ? CREDENTIAL_KIND_PASSWORD : CREDENTIAL_KIND_SYNC_CODE;
}

/**
 * Resolve how this session signs in (password vs sync code).
 * Older sessions may omit `credentialKind`; infer from secret shape.
 * @param {{ credentialKind?: string, syncSecretPlain?: string } | null | undefined} session
 */
export function resolveSessionCredentialKind(session) {
    if (session?.credentialKind === CREDENTIAL_KIND_PASSWORD) return CREDENTIAL_KIND_PASSWORD;
    if (session?.credentialKind === CREDENTIAL_KIND_SYNC_CODE) return CREDENTIAL_KIND_SYNC_CODE;
    const plain = String(session?.syncSecretPlain || '').trim();
    if (plain && !looksLikeSyncSecretCode(plain)) return CREDENTIAL_KIND_PASSWORD;
    return CREDENTIAL_KIND_SYNC_CODE;
}

/** @param {{ credentialKind?: string, syncSecretPlain?: string } | null | undefined} session */
export function isPasswordCredentialSession(session) {
    return resolveSessionCredentialKind(session) === CREDENTIAL_KIND_PASSWORD;
}

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
    return sha256(data);
}

/** SHA-256(normalize(plain)) → base64url (no padding). */
export async function hashSyncSecret(plain, credentialKind = CREDENTIAL_KIND_SYNC_CODE) {
    const norm = normalizeCredentialSecret(plain, resolveCredentialKind(credentialKind));
    const enc = new TextEncoder().encode(norm);
    const bytes = await sha256Bytes(enc);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const b64 = btoa(bin);
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/**
 * @param {string} storedHashB64u
 * @param {string} candidatePlain
 * @param {string} [credentialKind]
 */
export async function syncSecretMatchesStored(storedHashB64u, candidatePlain, credentialKind = CREDENTIAL_KIND_SYNC_CODE) {
    const want = String(storedHashB64u || '').trim();
    if (!want) return false;
    const got = await hashSyncSecret(candidatePlain, resolveCredentialKind(credentialKind));
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
 * @param {{ credentialKind?: string }} [opts]
 * @returns {{ pub: string, priv: string } | null}
 */
export function deriveAccountSigningPair(username, plainSecret, opts = {}) {
    const norm = normalizeUsername(username);
    const kind = resolveCredentialKind(opts.credentialKind);
    const sec = normalizeCredentialSecret(plainSecret, kind);
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
            /* invalid scalar, fall through to rehash */
        }
        seed = sha256(seed);
    }
    return null;
}

/** Normalize a username for storage keys, tags, and lookups (lowercase, trimmed). */
export { normalizeUsername };
