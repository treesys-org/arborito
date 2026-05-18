/**
 * Encrypted recovery kit (passphrase-protected JSON file).
 * Plain payload may include optional Nostr writer keypair for encrypted sync restore.
 */

const KIT_FORMAT = 'arborito-recovery-kit';
const KIT_VERSION = 1;
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

async function deriveAesKey(passphrase, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(String(passphrase)), 'PBKDF2', false, [
        'deriveBits',
        'deriveKey'
    ]);
    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt,
            iterations: PBKDF2_ITERATIONS,
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

/**
 * @param {{ username: string, identityPair?: object|null, nostrPair?: object|null }} payload
 * @param {string} passphrase
 * @returns {Promise<string>} JSON string (downloadable file body)
 */
export async function encryptRecoveryKit(payload, passphrase) {
    const username = String((payload && payload.username) || '').trim();
    if (!username) throw new Error('Username is required.');
    if (!String(passphrase || '').trim()) throw new Error('Passphrase is required.');
    const pair =
        (payload && payload.identityPair && typeof payload.identityPair === 'object' && payload.identityPair) ||
        (payload && payload.nostrPair && typeof payload.nostrPair === 'object' && payload.nostrPair) ||
        null;
    const inner = {
        v: 1,
        username,
        createdAt: new Date().toISOString(),
        identityPair: pair,
        nostrPair: pair
    };
    const salt = randomBytes(SALT_BYTES);
    const iv = randomBytes(IV_BYTES);
    const key = await deriveAesKey(passphrase, salt);
    const plain = new TextEncoder().encode(JSON.stringify(inner));
    const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain);
    const ciphertext = new Uint8Array(cipherBuf);
    const out = {
        format: KIT_FORMAT,
        version: KIT_VERSION,
        username,
        kdf: 'PBKDF2-SHA256',
        iterations: PBKDF2_ITERATIONS,
        salt: b64Encode(salt),
        iv: b64Encode(iv),
        ciphertext: b64Encode(ciphertext)
    };
    return JSON.stringify(out, null, 2);
}

/**
 * @param {string} jsonText
 * @param {string} passphrase
 * @returns {Promise<{ username: string, identityPair: object|null, nostrPair: object|null, createdAt: string }>}
 */
export async function decryptRecoveryKit(jsonText, passphrase) {
    const data = JSON.parse(String(jsonText || '').trim());
    if (!data || typeof data !== 'object') throw new Error('Invalid recovery file.');
    if (String(data.format) !== KIT_FORMAT) throw new Error('Not an Arborito recovery file.');
    if (Number(data.version) !== KIT_VERSION) throw new Error('Unsupported recovery file version.');
    const salt = b64Decode(String(data.salt || ''));
    const iv = b64Decode(String(data.iv || ''));
    const ct = b64Decode(String(data.ciphertext || ''));
    if (salt.length < 8 || iv.length < 12 || !ct.length) throw new Error('Corrupt recovery file.');
    const key = await deriveAesKey(passphrase, salt);
    let plainBuf;
    try {
        plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    } catch {
        throw new Error('Wrong passphrase or corrupted file.');
    }
    const inner = JSON.parse(new TextDecoder().decode(new Uint8Array(plainBuf)));
    if (!inner || typeof inner !== 'object') throw new Error('Invalid payload.');
    const username = String(inner.username || '').trim();
    if (!username) throw new Error('Invalid payload username.');
    const id =
        (inner.identityPair && typeof inner.identityPair === 'object' && inner.identityPair) ||
        (inner.nostrPair && typeof inner.nostrPair === 'object' && inner.nostrPair) ||
        null;
    return {
        username,
        identityPair: id,
        nostrPair: id,
        createdAt: String(inner.createdAt || '')
    };
}
