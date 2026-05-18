/**
 * One-time backup recovery codes for passkey accounts (stored on Nostr as hashes only).
 */

const CODE_GROUPS = 4;
const HEX_PER_GROUP = 4; // 4 groups × 4 hex = 16 hex chars from 8 random bytes

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
export function normalizeRecoveryCode(input) {
    return String(input || '')
        .trim()
        .replace(/\s+/g, '')
        .replace(/-/g, '')
        .toUpperCase();
}

export function formatRecoveryCodeForDisplay(normalized) {
    const s = normalizeRecoveryCode(normalized);
    if (!s) return '';
    const parts = [];
    for (let i = 0; i < s.length; i += HEX_PER_GROUP) {
        parts.push(s.slice(i, i + HEX_PER_GROUP));
    }
    return parts.join('-');
}

export function generatePlainRecoveryCode() {
    const raw = randomBytes((CODE_GROUPS * HEX_PER_GROUP) / 2);
    const hex = bytesToHexUpper(raw);
    return formatRecoveryCodeForDisplay(hex);
}

/** @param {string} a @param {string} b */
export function timingSafeEqualString(a, b) {
    const aa = String(a || '');
    const bb = String(b || '');
    if (aa.length !== bb.length) return false;
    let out = 0;
    for (let i = 0; i < aa.length; i++) out |= aa.charCodeAt(i) ^ bb.charCodeAt(i);
    return out === 0;
}

export async function hashRecoveryCode(normalizedCode) {
    const norm = normalizeRecoveryCode(normalizedCode);
    const enc = new TextEncoder().encode(norm);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const b64 = btoa(bin);
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/**
 * @param {number} [count=10]
 * @returns {Promise<{ id: string, hash: string, createdAt: string, plain: string }[]>}
 */
export async function generateRecoveryCodeBatch(count = 10) {
    const n = Math.max(6, Math.min(20, Number(count) || 10));
    const createdAt = new Date().toISOString();
    const out = [];
    for (let i = 0; i < n; i++) {
        const plain = generatePlainRecoveryCode();
        const hash = await hashRecoveryCode(plain);
        const id = `rc_${createdAt.replace(/[:.]/g, '')}_${i}_${bytesToHexUpper(randomBytes(4)).toLowerCase()}`;
        out.push({ id, hash, createdAt, plain });
    }
    return out;
}

export const RECOVERY_QR_KIND = 'arborito.recover.entry';

/**
 * JSON string to encode in a QR that opens the in-app recovery assistant (not a secret).
 */
export function buildRecoveryEntryQrPayload() {
    try {
        const u = new URL(window.location.href);
        u.hash = '';
        u.search = '';
        u.searchParams.set('recover', '1');
        const entryUrl = `${u.origin}${u.pathname}${u.search}`;
        return JSON.stringify({ v: 1, k: RECOVERY_QR_KIND, u: entryUrl, t: new Date().toISOString() });
    } catch {
        return '';
    }
}

/**
 * @param {string} text
 * @returns {{ url: string } | null}
 */
export function parseRecoveryEntryFromText(text) {
    const raw = String(text || '').trim();
    if (!raw) return null;
    if (/^https?:\/\//i.test(raw) && raw.includes('recover=1')) {
        try {
            const u = new URL(raw);
            if (u.searchParams.get('recover') === '1') return { url: raw };
        } catch {
            return null;
        }
    }
    try {
        const o = JSON.parse(raw);
        if (!o || typeof o !== 'object') return null;
        if (Number(o.v) !== 1) return null;
        if (String(o.k) !== RECOVERY_QR_KIND) return null;
        const u = String(o.u || '').trim();
        if (!u || !/^https?:\/\//i.test(u)) return null;
        return { url: u };
    } catch {
        return null;
    }
}
