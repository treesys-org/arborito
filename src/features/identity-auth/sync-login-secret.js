/**
 * "Sync code" login: username + high-entropy secret (typed or scanned via QR).
 * The hashed secret is published to Nostr; plaintext is shown once at registration
 * and never leaves the device unless the user copies / exports it.
 */

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

/** Constant-time string compare (length-insensitive guard). */
function timingSafeEqualString(a, b) {
    const aa = String(a || '');
    const bb = String(b || '');
    if (aa.length !== bb.length) return false;
    let out = 0;
    for (let i = 0; i < aa.length; i++) out |= aa.charCodeAt(i) ^ bb.charCodeAt(i);
    return out === 0;
}

/** SHA-256(normalize(plain)) → base64url (no padding). */
export async function hashSyncSecret(plain) {
    const norm = normalizeSyncSecret(plain);
    const enc = new TextEncoder().encode(norm);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    const bytes = new Uint8Array(buf);
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

/** Normalize a username for storage keys, tags, and lookups (lowercase, trimmed). */
export function normalizeUsername(input) {
    return String(input || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '');
}
