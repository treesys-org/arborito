/**
 * Simple “sync code” login: username + high-entropy secret (QR or typed).
 * Secret hash is stored on Nostr; plaintext is shown once at registration.
 */

import { hashRecoveryCode, timingSafeEqualString } from './passkey-recovery.js';

const GROUPS = 4;
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

export async function hashSyncSecret(plain) {
    return hashRecoveryCode(plain);
}

export const SYNC_LOGIN_QR_KIND = 'arborito.sync.login';

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
        if (o.k !== SYNC_LOGIN_QR_KIND && o.k !== 'arborito.sync.login') return null;
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
