/**
 * Account user-pair escrow.
 *
 * The Nostr "user pair" (Ed25519/secp keys used as a stable per-user identity
 * for encrypted per-user data) lives in localStorage. To make a sync-login
 * account portable across devices we encrypt that user pair with a key derived
 * from the user's sync secret (PBKDF2-SHA256 + AES-GCM) and publish the
 * resulting blob on Nostr under the username. A new device that knows the sync
 * secret can fetch + decrypt the escrow, write the user pair to localStorage
 * and immediately decrypt the user's progress / sources / private trees.
 *
 * The escrow blob never contains the sync secret itself: only an AES-GCM
 * ciphertext over `{ identityPair }`. Anyone who learns the sync secret can
 * decrypt it — that is by design, the sync secret IS the account password.
 */

const FORMAT = 'arborito-account-escrow';
const VERSION = 1;
const PBKDF2_ITERATIONS = 210000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

function randomBytes(n) {
    const out = new Uint8Array(n);
    crypto.getRandomValues(out);
    return out;
}

function b64Encode(bytes) {
    let bin = '';
    const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    for (let i = 0; i < u.length; i++) bin += String.fromCharCode(u[i]);
    const b64 = btoa(bin);
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64Decode(str) {
    const s = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
    const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
    const bin = atob(s + pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

async function deriveAesKey(secret, salt) {
    const enc = new TextEncoder();
    const material = await crypto.subtle.importKey(
        'raw',
        enc.encode(String(secret || '')),
        'PBKDF2',
        false,
        ['deriveBits', 'deriveKey']
    );
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
        material,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

/**
 * @param {{ username: string, identityPair: { pub: string, priv: string } }} payload
 * @param {string} syncSecret normalised plaintext sync secret
 * @returns {Promise<object>} serialisable escrow blob (publish as JSON)
 */
export async function encryptAccountEscrow(payload, syncSecret) {
    const username = String((payload && payload.username) || '').trim();
    const pair = payload && payload.identityPair;
    if (!username) throw new Error('Escrow needs a username.');
    if (!pair || !pair.pub || !pair.priv) throw new Error('Escrow needs a user pair.');
    if (!String(syncSecret || '').trim()) throw new Error('Escrow needs a sync secret.');
    const salt = randomBytes(SALT_BYTES);
    const iv = randomBytes(IV_BYTES);
    const key = await deriveAesKey(syncSecret, salt);
    const inner = { v: 1, username, identityPair: pair, updatedAt: new Date().toISOString() };
    const plain = new TextEncoder().encode(JSON.stringify(inner));
    const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain);
    return {
        format: FORMAT,
        version: VERSION,
        username,
        kdf: 'PBKDF2-SHA256',
        iterations: PBKDF2_ITERATIONS,
        salt: b64Encode(salt),
        iv: b64Encode(iv),
        ciphertext: b64Encode(new Uint8Array(cipherBuf))
    };
}

/**
 * @param {object} blob result of `encryptAccountEscrow` (or null/garbage)
 * @param {string} syncSecret normalised plaintext sync secret
 * @returns {Promise<{ username: string, identityPair: { pub: string, priv: string } }>}
 */
export async function decryptAccountEscrow(blob, syncSecret) {
    if (!blob || typeof blob !== 'object') throw new Error('Escrow blob is missing.');
    if (String(blob.format) !== FORMAT) throw new Error('Not an Arborito account escrow.');
    if (Number(blob.version) !== VERSION) throw new Error('Unsupported escrow version.');
    const salt = b64Decode(String(blob.salt || ''));
    const iv = b64Decode(String(blob.iv || ''));
    const ct = b64Decode(String(blob.ciphertext || ''));
    if (salt.length < 8 || iv.length < 12 || !ct.length) throw new Error('Escrow blob is corrupt.');
    const key = await deriveAesKey(syncSecret, salt);
    let plainBuf;
    try {
        plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    } catch {
        throw new Error('Escrow could not be decrypted (wrong sync secret?).');
    }
    const inner = JSON.parse(new TextDecoder().decode(new Uint8Array(plainBuf)));
    if (!inner || typeof inner !== 'object') throw new Error('Escrow payload is invalid.');
    const username = String(inner.username || '').trim();
    const pair = inner.identityPair && typeof inner.identityPair === 'object' ? inner.identityPair : null;
    if (!username || !pair || !pair.pub || !pair.priv) throw new Error('Escrow payload is incomplete.');
    return { username, identityPair: pair };
}
