/**
 * Serverless account recovery, v2 (recovery passphrase).
 *
 * The account **password** is the daily sign-in credential; only its SHA-256 hash
 * lives on relays. If the user forgets it, they can set a **recovery passphrase**
 * (chosen by them, not auto-generated): we derive a key with scrypt (memory-hard,
 * GPU-hostile) and AES-GCM-encrypt the password under it. The blob is published on
 * Nostr keyed by username; a new device fetches it and, given the passphrase,
 * recovers the password and signs in.
 *
 * Why a passphrase and NOT security questions: personal questions leak profiling
 * data on public relays and are low-entropy. A user-invented passphrase keeps the
 * blob PII-free (ciphertext + KDF parameters only).
 *
 * Trade-off: the blob is public per username, so weak passphrases are brute-forceable
 * offline. Recovery is a convenience layer, not a replacement for the password or
 * sync key backup.
 */

import { scryptAsync } from '@noble/hashes/scrypt';

const FORMAT = 'arborito-account-recovery';
const VERSION = 2;

/* scrypt cost: N=2^15, r=8, p=1 → ~32 MB and ~0.5–1 s per guess on a phone,
 * far worse than PBKDF2 for GPU farms because of the memory requirement. */
const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SALT_BYTES = 16;
const IV_BYTES = 12;

/** Minimum passphrase length AFTER normalization. */
export const RECOVERY_MIN_PASSPHRASE_CHARS = 12;
/** Recommend at least this many words in the UI (not enforced). */
export const RECOVERY_RECOMMENDED_WORDS = 4;

function randomBytes(n) {
    const out = new Uint8Array(n);
    crypto.getRandomValues(out);
    return out;
}

function b64Encode(bytes) {
    let bin = '';
    const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    for (let i = 0; i < u.length; i++) bin += String.fromCharCode(u[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64Decode(str) {
    const s = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
    const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
    const bin = atob(s + pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

/**
 * Normalize the passphrase so trivial formatting differences (case, extra
 * spaces, accents) don't lock a legitimate user out, while keeping the word
 * content (the entropy source) intact.
 * @param {string} passphrase
 */
export function normalizeRecoveryPassphrase(passphrase) {
    return String(passphrase || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * @param {string} passphrase
 * @returns {{ ok: boolean, reason?: 'too_short'|'too_repetitive' }}
 */
export function checkRecoveryPassphraseStrength(passphrase) {
    const p = normalizeRecoveryPassphrase(passphrase);
    if (p.length < RECOVERY_MIN_PASSPHRASE_CHARS) return { ok: false, reason: 'too_short' };
    // Reject single repeated character/word ("aaaaaaaaaaaa", "hola hola hola…").
    const uniqueChars = new Set(p.replace(/ /g, '')).size;
    if (uniqueChars < 4) return { ok: false, reason: 'too_repetitive' };
    return { ok: true };
}

async function deriveAesKey(passphrase, salt) {
    /* scryptAsync yields to the event loop periodically so the ~0.5–1 s
     * derivation doesn't freeze the UI on phones. */
    const keyBytes = await scryptAsync(new TextEncoder().encode(passphrase), salt, {
        N: SCRYPT_N,
        r: SCRYPT_R,
        p: SCRYPT_P,
        dkLen: 32
    });
    return crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/**
 * @param {{ username: string, syncSecret: string, passphrase: string }} payload
 * @returns {Promise<object>} serialisable recovery blob (publish as JSON). PII-free.
 */
export async function encryptRecoveryBlob({ username, syncSecret, passphrase }) {
    const user = String(username || '').trim();
    const secret = String(syncSecret || '').trim();
    const phrase = normalizeRecoveryPassphrase(passphrase);
    const strength = checkRecoveryPassphraseStrength(phrase);
    if (!user) throw new Error('Recovery needs a username.');
    if (!secret) throw new Error('Recovery needs the sync secret.');
    if (!strength.ok) throw new Error('Recovery passphrase is too weak.');
    const salt = randomBytes(SALT_BYTES);
    const iv = randomBytes(IV_BYTES);
    const key = await deriveAesKey(phrase, salt);
    const inner = { v: 2, username: user, syncSecret: secret, updatedAt: new Date().toISOString() };
    const plain = new TextEncoder().encode(JSON.stringify(inner));
    const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain);
    return {
        format: FORMAT,
        version: VERSION,
        username: user,
        kdf: 'scrypt',
        scrypt: { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P },
        salt: b64Encode(salt),
        iv: b64Encode(iv),
        ciphertext: b64Encode(new Uint8Array(cipherBuf)),
        updatedAt: new Date().toISOString()
    };
}

/**
 * @param {object} blob result of `encryptRecoveryBlob`
 * @param {string} passphrase
 * @returns {Promise<{ username: string, syncSecret: string }>}
 */
export async function decryptRecoveryBlob(blob, passphrase) {
    if (!blob || typeof blob !== 'object') throw new Error('Recovery data is missing.');
    if (String(blob.format) !== FORMAT) throw new Error('Recovery phrase not set up for this account.');
    if (Number(blob.version) !== VERSION) throw new Error('Unsupported recovery version.');
    const salt = b64Decode(String(blob.salt || ''));
    const iv = b64Decode(String(blob.iv || ''));
    const ct = b64Decode(String(blob.ciphertext || ''));
    if (salt.length < 8 || iv.length < 12 || !ct.length) throw new Error('Recovery data could not be read.');
    const key = await deriveAesKey(normalizeRecoveryPassphrase(passphrase), salt);
    let plainBuf;
    try {
        plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    } catch {
        throw new Error('Wrong recovery passphrase. Try again.');
    }
    const inner = JSON.parse(new TextDecoder().decode(new Uint8Array(plainBuf)));
    const username = String((inner && inner.username) || '').trim();
    const syncSecret = String((inner && inner.syncSecret) || '').trim();
    if (!username || !syncSecret) throw new Error('Recovery payload is incomplete.');
    return { username, syncSecret };
}

/** True when the blob looks like a usable v2 recovery blob. */
export function isUsableRecoveryBlob(blob) {
    return !!(
        blob &&
        typeof blob === 'object' &&
        String(blob.format) === FORMAT &&
        Number(blob.version) === VERSION &&
        blob.ciphertext
    );
}
