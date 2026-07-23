/**
 * Local recovery kit for password accounts (1Password-style emergency kit).
 *
 * - A random **recovery key** (96-bit hex, display format) is generated at sign-up.
 * - The account **password** is AES-GCM encrypted under scrypt(recoveryKey).
 * - QR / file carry the kit so a new device can sign in without typing the password.
 * - The password hash on relays is unchanged; recovery is an offline extra layer.
 */

import { scryptAsync } from '@noble/hashes/scrypt';
import {
    generatePlainSyncSecret,
    formatSyncSecretForDisplay,
    normalizeSyncSecret,
    normalizeUserPassword,
} from './sync-login-secret.js';

export const RECOVERY_KIT_FORMAT = 'arborito-recovery-kit';
export const RECOVERY_KIT_QR_KIND = 'arborito.recovery.kit';
export const RECOVERY_KIT_VERSION = 1;

const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
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

/** @returns {string} formatted recovery key */
export function generateRecoveryKey() {
    return formatSyncSecretForDisplay(generatePlainSyncSecret());
}

function normalizeRecoveryKey(key) {
    return formatSyncSecretForDisplay(normalizeSyncSecret(key));
}

async function deriveAesKey(recoveryKey, salt) {
    const norm = normalizeRecoveryKey(recoveryKey);
    const keyBytes = await scryptAsync(new TextEncoder().encode(norm), salt, {
        N: SCRYPT_N,
        r: SCRYPT_R,
        p: SCRYPT_P,
        dkLen: 32,
    });
    return crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/**
 * @param {{ username: string, password: string, recoveryKey: string }} payload
 */
export async function encryptRecoveryKit({ username, password, recoveryKey }) {
    const user = String(username || '').trim();
    const pass = normalizeUserPassword(password);
    const rk = normalizeRecoveryKey(recoveryKey);
    if (!user || !pass) throw new Error('Recovery kit needs username and password.');
    if (!rk) throw new Error('Recovery kit needs a recovery key.');
    const salt = randomBytes(SALT_BYTES);
    const iv = randomBytes(IV_BYTES);
    const key = await deriveAesKey(rk, salt);
    const inner = { v: 1, username: user, password: pass };
    const plain = new TextEncoder().encode(JSON.stringify(inner));
    const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain);
    return {
        format: RECOVERY_KIT_FORMAT,
        version: RECOVERY_KIT_VERSION,
        kdf: 'scrypt',
        scrypt: { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P },
        salt: b64Encode(salt),
        iv: b64Encode(iv),
        ciphertext: b64Encode(new Uint8Array(cipherBuf)),
    };
}

/**
 * @param {object} blob
 * @param {string} recoveryKey
 */
export async function decryptRecoveryKit(blob, recoveryKey) {
    if (!blob || typeof blob !== 'object') throw new Error('Recovery kit data is missing.');
    if (String(blob.format) !== RECOVERY_KIT_FORMAT) throw new Error('Not an Arborito recovery kit.');
    if (Number(blob.version) !== RECOVERY_KIT_VERSION) throw new Error('Unsupported recovery kit version.');
    const rk = normalizeRecoveryKey(recoveryKey);
    if (!rk) throw new Error('Enter the recovery key.');
    const salt = b64Decode(String(blob.salt || ''));
    const iv = b64Decode(String(blob.iv || ''));
    const ct = b64Decode(String(blob.ciphertext || ''));
    if (salt.length < 8 || iv.length < 12 || !ct.length) throw new Error('Recovery kit is corrupt.');
    const key = await deriveAesKey(rk, salt);
    let plainBuf;
    try {
        plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    } catch {
        throw new Error('Wrong sync key. Could not read the file.');
    }
    const inner = JSON.parse(new TextDecoder().decode(new Uint8Array(plainBuf)));
    const username = String(inner?.username || '').trim();
    const password = normalizeUserPassword(inner?.password || '');
    if (!username || !password) throw new Error('Recovery kit payload is incomplete.');
    return { username, password };
}

/**
 * @param {{ username: string, password: string, recoveryKey: string }} args
 */
export async function buildRecoveryKitQrPayload({ username, password, recoveryKey }) {
    const u = String(username || '').trim();
    const rk = normalizeRecoveryKey(recoveryKey);
    if (!u || !rk) return '';
    const blob = await encryptRecoveryKit({ username: u, password, recoveryKey: rk });
    try {
        return JSON.stringify({
            v: RECOVERY_KIT_VERSION,
            k: RECOVERY_KIT_QR_KIND,
            u,
            rk,
            blob,
        });
    } catch {
        return '';
    }
}

/**
 * @param {string} text
 * @returns {Promise<{ username: string, password: string } | null>}
 */
export async function parseRecoveryKitFromText(text) {
    const raw = String(text || '').trim();
    if (!raw) return null;
    try {
        const o = JSON.parse(raw);
        if (!o || typeof o !== 'object') return null;
        if (o.k !== RECOVERY_KIT_QR_KIND) return null;
        const u = String(o.u || '').trim();
        const rk = normalizeRecoveryKey(o.rk || '');
        const blob = o.blob;
        if (!u || !rk || !blob) return null;
        return decryptRecoveryKit(blob, rk);
    } catch {
        return null;
    }
}

/**
 * @param {{ username: string, password: string, recoveryKey: string }} args
 * @returns {Promise<string>} single-line base64 recovery kit file
 */
export async function serializeRecoveryKitFile({ username, password, recoveryKey }) {
    const u = String(username || '').trim();
    const rk = normalizeRecoveryKey(recoveryKey);
    const blob = await encryptRecoveryKit({ username: u, password, recoveryKey: rk });
    const payload = {
        v: RECOVERY_KIT_VERSION,
        u,
        rk,
        blob,
    };
    const json = JSON.stringify(payload);
    const bytes = new TextEncoder().encode(json);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const b64 = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    return `ARBORITO-RECOVERY-v${RECOVERY_KIT_VERSION}\n${b64}\n`;
}

function parseRecoveryKitBase64File(text) {
    const raw = String(text || '').trim();
    if (!raw) return null;
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const header = lines[0] || '';
    const b64 = lines.length > 1 ? lines[lines.length - 1] : raw;
    if (!header.startsWith('ARBORITO-RECOVERY-v') && !/^[A-Za-z0-9_-]+$/.test(b64)) return null;
    try {
        const norm = b64.replace(/-/g, '+').replace(/_/g, '/');
        const pad = norm.length % 4 ? '='.repeat(4 - (norm.length % 4)) : '';
        const bin = atob(norm + pad);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const payload = JSON.parse(new TextDecoder().decode(bytes));
        const u = String(payload?.u || '').trim();
        const rk = normalizeRecoveryKey(payload?.rk || '');
        const blob = payload?.blob;
        if (!u || !rk || !blob) return null;
        return decryptRecoveryKit(blob, rk);
    } catch {
        return null;
    }
}

/**
 * @param {string} text
 * @returns {Promise<{ username: string, password: string } | null>}
 */
export async function parseRecoveryKitFromExportFile(text) {
    const fromB64 = await parseRecoveryKitBase64File(text);
    if (fromB64) return fromB64;
    let u = '';
    let rk = '';
    let jsonPart = '';
    let inJson = false;
    for (const line of String(text || '').split(/\r?\n/)) {
        const mUser = line.match(/^\s*Username:\s*(.+)\s*$/i);
        if (mUser) u = String(mUser[1] || '').trim();
        const mKey = line.match(/^\s*Recovery key:\s*(.+)\s*$/i);
        if (mKey) rk = normalizeRecoveryKey(mKey[1]);
        if (line.trim().startsWith('{')) inJson = true;
        if (inJson) jsonPart += line + '\n';
    }
    if (!u || !rk || !jsonPart.trim()) return null;
    try {
        const blob = JSON.parse(jsonPart.trim());
        return decryptRecoveryKit(blob, rk);
    } catch {
        return null;
    }
}

/** Ensure session has a recovery key (backfill for older password sessions). */
export function ensureRecoveryKeyInSession(sess) {
    if (!sess || typeof sess !== 'object') return sess;
    if (String(sess.recoveryKeyPlain || '').trim()) return sess;
    const rk = generateRecoveryKey();
    return { ...sess, recoveryKeyPlain: rk };
}
