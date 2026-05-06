/**
 * QR Signaling Service - "WhatsApp Web" flow:
 * 1. Desktop generates temporary token → displays QR
 * 2. Mobile scans → publishes authorization on Nostr
 * 3. Desktop detects authorization → completes login
 */

import { generateSecretKey, getPublicKey } from '../../vendor/nostr-tools/lib/esm/index.js';
import { bytesToHex, hexToBytes } from '../../vendor/deps/noble-hashes/esm/utils.js';
import { randomUUIDSafe } from '../utils/secure-web-crypto.js';

export const QR_SIGNAL_KIND = 'arborito.qr.signal.v1';
export const QR_AUTH_KIND = 'arborito.qr.auth.v1';
export const QR_TOKEN_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

/**
 * @typedef {Object} QrSession
 * @property {string} sessionId - Unique session ID
 * @property {string} token - Secret token (only desktop knows initially)
 * @property {string} pubkey - Temporary public key for verification
 * @property {number} createdAt - Creation timestamp
 * @property {string} username - Associated username (for authorized mobile)
 * @property {'pending'|'authorized'|'expired'} status
 */

/**
 * Generates a temporary Nostr keypair for the QR session
 * @returns {{ priv: string, pub: string }}
 */
export function createQrSignalingPair() {
    const sk = generateSecretKey();
    return { priv: bytesToHex(sk), pub: getPublicKey(sk) };
}

/**
 * Creates a payload for the QR (desktop → mobile)
 * @param {string} sessionId
 * @param {string} pubkey - Temporary public key
 * @param {string[]} relays - Relay URLs to use
 * @returns {string} JSON string for the QR
 */
export function buildQrSignalingPayload(sessionId, pubkey, relays = []) {
    const payload = {
        v: 1,
        k: QR_SIGNAL_KIND,
        sid: sessionId,
        pub: pubkey,
        rel: Array.isArray(relays) ? relays.slice(0, 5) : [],
        ts: Date.now()
    };
    return JSON.stringify(payload);
}

/**
 * Parses the QR payload scanned by mobile
 * @param {string} text
 * @returns {{ sessionId: string, pubkey: string, relays: string[], timestamp: number } | null}
 */
export function parseQrSignalingPayload(text) {
    try {
        const raw = String(text || '').trim();
        if (!raw) return null;
        const o = JSON.parse(raw);
        if (!o || typeof o !== 'object') return null;
        if (o.k !== QR_SIGNAL_KIND && o.k !== 'arborito.qr.signal.v1') return null;
        const sid = String(o.sid || '').trim();
        const pub = String(o.pub || '').trim();
        if (!sid || !pub || !/^[0-9a-fA-F]{64}$/.test(pub)) return null;
        return {
            sessionId: sid,
            pubkey: pub,
            relays: Array.isArray(o.rel) ? o.rel : [],
            timestamp: Number(o.ts) || Date.now()
        };
    } catch {
        return null;
    }
}

/**
 * Creates the authorization payload (mobile → desktop via Nostr)
 * @param {string} sessionId - From scanned QR
 * @param {string} desktopPubkey - From scanned QR
 * @param {string} mobileUsername - Mobile's already authenticated username
 * @param {string} mobileSecretHash - Secret hash for verification
 * @returns {string} JSON string
 */
export function buildQrAuthorizationPayload(sessionId, desktopPubkey, mobileUsername, mobileSecretHash) {
    const payload = {
        v: 1,
        k: QR_AUTH_KIND,
        sid: sessionId,
        to: desktopPubkey,
        u: String(mobileUsername || '').trim(),
        h: String(mobileSecretHash || '').trim(),
        ts: Date.now()
    };
    return JSON.stringify(payload);
}

/**
 * Parses the authorization received by desktop
 * @param {string} text
 * @returns {{ sessionId: string, desktopPubkey: string, username: string, secretHash: string, timestamp: number } | null}
 */
export function parseQrAuthorizationPayload(text) {
    try {
        const raw = String(text || '').trim();
        if (!raw) return null;
        const o = JSON.parse(raw);
        if (!o || typeof o !== 'object') return null;
        if (o.k !== QR_AUTH_KIND && o.k !== 'arborito.qr.auth.v1') return null;
        const sid = String(o.sid || '').trim();
        const to = String(o.to || '').trim();
        const u = String(o.u || '').trim();
        const h = String(o.h || '').trim();
        if (!sid || !to || !u || !h) return null;
        return {
            sessionId: sid,
            desktopPubkey: to,
            username: u,
            secretHash: h,
            timestamp: Number(o.ts) || Date.now()
        };
    } catch {
        return null;
    }
}

/**
 * Verifies if an authorization is valid for a desktop session
 * @param {Object} auth - Result from parseQrAuthorizationPayload
 * @param {string} desktopPubkey - Our temporary pubkey
 * @param {number} sessionStartTime - When we created the session
 * @returns {boolean}
 */
export function isQrAuthorizationValid(auth, desktopPubkey, sessionStartTime) {
    if (!auth) return false;
    if (auth.desktopPubkey !== desktopPubkey) return false;
    if (Date.now() - auth.timestamp > QR_TOKEN_EXPIRY_MS) return false;
    if (Date.now() - sessionStartTime > QR_TOKEN_EXPIRY_MS) return false;
    return true;
}

/**
 * Generates unique session ID
 * @returns {string}
 */
export function generateQrSessionId() {
    return randomUUIDSafe().replace(/-/g, '').slice(0, 24);
}

/**
 * In-memory QR session manager (desktop side)
 */
export class QrSignalingManager {
    constructor() {
        /** @type {Map<string, QrSession>} */
        this.sessions = new Map();
        /** @type {Set<string>} */
        this.authorizedSessionIds = new Set();
        this._cleanupInterval = null;
    }

    start() {
        if (this._cleanupInterval) return;
        this._cleanupInterval = setInterval(() => this._cleanup(), 30000); // Every 30s
    }

    stop() {
        if (this._cleanupInterval) {
            clearInterval(this._cleanupInterval);
            this._cleanupInterval = null;
        }
        this.sessions.clear();
        this.authorizedSessionIds.clear();
    }

    /**
     * Creates new QR session (desktop displays it)
     * @param {string} [preferredUsername] - Preferred username if known
     * @returns {{ sessionId: string, pair: {priv: string, pub: string}, payload: string }}
     */
    createSession(preferredUsername = '') {
        const sessionId = generateQrSessionId();
        const pair = createQrSignalingPair();
        const session = {
            sessionId,
            token: randomUUIDSafe(),
            pubkey: pair.pub,
            privkey: pair.priv,
            createdAt: Date.now(),
            username: preferredUsername,
            status: 'pending'
        };
        this.sessions.set(sessionId, session);
        this.start();
        return { sessionId, pair, session };
    }

    /**
     * Marks a session as authorized
     * @param {string} sessionId
     * @param {string} username - The username that authorized from mobile
     * @returns {boolean}
     */
    authorize(sessionId, username) {
        const session = this.sessions.get(sessionId);
        if (!session) return false;
        if (Date.now() - session.createdAt > QR_TOKEN_EXPIRY_MS) {
            session.status = 'expired';
            return false;
        }
        session.status = 'authorized';
        session.username = username;
        session.authorizedAt = Date.now();
        this.authorizedSessionIds.add(sessionId);
        return true;
    }

    /**
     * Gets session by ID
     * @param {string} sessionId
     * @returns {QrSession | undefined}
     */
    get(sessionId) {
        return this.sessions.get(sessionId);
    }

    /**
     * Checks if a session is authorized
     * @param {string} sessionId
     * @returns {{ authorized: boolean, username?: string }}
     */
    checkAuthorization(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) return { authorized: false };
        if (session.status === 'authorized') {
            return { authorized: true, username: session.username };
        }
        if (Date.now() - session.createdAt > QR_TOKEN_EXPIRY_MS) {
            session.status = 'expired';
            return { authorized: false };
        }
        return { authorized: false };
    }

    _cleanup() {
        const now = Date.now();
        for (const [id, session] of this.sessions.entries()) {
            if (now - session.createdAt > QR_TOKEN_EXPIRY_MS * 2) {
                this.sessions.delete(id);
                this.authorizedSessionIds.delete(id);
            }
        }
    }

    /**
     * Creates the QR payload including recommended relays
     * @param {string} sessionId
     * @param {string[]} relays
     * @returns {string | null} Payload for QR generation
     */
    buildQrPayload(sessionId, relays) {
        const session = this.sessions.get(sessionId);
        if (!session) return null;
        return buildQrSignalingPayload(sessionId, session.pubkey, relays);
    }
}
