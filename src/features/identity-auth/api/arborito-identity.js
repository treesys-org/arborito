import { didKeyFromEd25519Raw, didKeyFromEd25519Jwk } from './did-key-ed25519.js';

const STORAGE_KEY = 'arborito-local-identity-v1';
const CLAIM_PREFIX = 'arborito|identity|1|';

function b64urlEncode(buf) {
    const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const b64 = btoa(bin);
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function utf8(s) {
    return new TextEncoder().encode(String(s || ''));
}

/**
 * @returns {Promise<{ did: string, publicJwk: JsonWebKey, privateJwk: JsonWebKey }>}
 */
export async function ensureLocalEd25519Identity() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if ((parsed && parsed.did) && (parsed && parsed.privateJwk) && (parsed && parsed.publicJwk)) {
                return {
                    did: String(parsed.did),
                    publicJwk: parsed.publicJwk,
                    privateJwk: parsed.privateJwk
                };
            }
        }
    } catch {
        /* fresh */
    }

    const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
    const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
    const pubRaw = await crypto.subtle.exportKey('raw', pair.publicKey);
    const did = didKeyFromEd25519Raw(new Uint8Array(pubRaw));
    const rec = { v: 1, did, publicJwk, privateJwk, createdAt: new Date().toISOString() };
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(rec));
    } catch {
        /* quota */
    }
    return { did, publicJwk, privateJwk };
}

/**
 * Canonical message signed for Nostr publication.
 * @param {string} username
 * @param {string} did
 * @param {string} issuedAt
 */
function identityClaimMessage(username, did, issuedAt) {
    return `${CLAIM_PREFIX}${String(username).trim()}|${String(did).trim()}|${String(issuedAt).trim()}`;
}

/**
 * @param {JsonWebKey} privateJwk
 * @param {string} messageUtf8
 * @returns {Promise<string>} base64url signature
 */
async function signUtf8WithEd25519PrivateJwk(privateJwk, messageUtf8) {
    const key = await crypto.subtle.importKey(
        'jwk',
        privateJwk,
        { name: 'Ed25519' },
        false,
        ['sign']
    );
    const sig = await crypto.subtle.sign('Ed25519', key, utf8(messageUtf8));
    return b64urlEncode(new Uint8Array(sig));
}

/**
 * @param {JsonWebKey} publicJwk
 * @param {string} messageUtf8
 * @param {string} sigB64u
 */
async function verifyEd25519Signature(publicJwk, messageUtf8, sigB64u) {
    const s = String(sigB64u || '').replace(/-/g, '+').replace(/_/g, '/');
    const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
    const bin = atob(s + pad);
    const sigBytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) sigBytes[i] = bin.charCodeAt(i);
    const key = await crypto.subtle.importKey(
        'jwk',
        { kty: 'OKP', crv: 'Ed25519', x: String((publicJwk && publicJwk.x) || '') },
        { name: 'Ed25519' },
        false,
        ['verify']
    );
    return crypto.subtle.verify('Ed25519', key, sigBytes, utf8(messageUtf8));
}

/**
 * @param {object} record
 * @returns {Promise<boolean>}
 */
export async function verifyIdentityClaimRecord(record) {
    try {
        if (!record || typeof record !== 'object') return false;
        if (Number(record.v) !== 1) return false;
        const username = String(record.username || '').trim();
        const did = String(record.did || '').trim();
        const issuedAt = String(record.issuedAt || '').trim();
        const sigB64u = String(record.sigB64u || '').trim();
        if (!username || !did || !issuedAt || !sigB64u) return false;
        if (!did.startsWith('did:key:z')) return false;
        const msg = identityClaimMessage(username, did, issuedAt);
        const ok = await verifyEd25519Signature(record.publicKeyJwk, msg, sigB64u);
        if (!ok) return false;
        const derivedDid = await didKeyFromEd25519Jwk(record.publicKeyJwk);
        return derivedDid === did;
    } catch {
        return false;
    }
}

/**
 * @param {{ username: string, privateJwk: JsonWebKey, did: string, publicJwk: JsonWebKey }} opts
 * @returns {Promise<object>} record to store on Nostr
 */
export async function buildSignedIdentityClaim(opts) {
    const issuedAt = new Date().toISOString();
    const msg = identityClaimMessage(opts.username, opts.did, issuedAt);
    const sigB64u = await signUtf8WithEd25519PrivateJwk(opts.privateJwk, msg);
    return {
        v: 1,
        did: String(opts.did),
        username: String(opts.username).trim(),
        publicKeyJwk: opts.publicJwk,
        issuedAt,
        sigB64u
    };
}

