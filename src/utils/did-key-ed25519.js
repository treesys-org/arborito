import { base58BtcEncode } from './base58btc.js';

/** Multicodec prefix for Ed25519 public key (0xed01). */
const MC_ED25519_PUB = new Uint8Array([0xed, 0x01]);

/**
 * @param {Uint8Array} rawPublic32
 * @returns {string} did:key:… (multibase base58-btc)
 */
export function didKeyFromEd25519Raw(rawPublic32) {
    const raw = rawPublic32 instanceof Uint8Array ? rawPublic32 : new Uint8Array(rawPublic32);
    if (raw.length !== 32) throw new Error('Ed25519 public key must be 32 bytes.');
    const payload = new Uint8Array(MC_ED25519_PUB.length + raw.length);
    payload.set(MC_ED25519_PUB, 0);
    payload.set(raw, MC_ED25519_PUB.length);
    return `did:key:z${base58BtcEncode(payload)}`;
}

/**
 * @param {JsonWebKey} publicJwk Ed25519 public JWK (crv Ed25519, kty OKP)
 * @returns {Promise<string>}
 */
export async function didKeyFromEd25519Jwk(publicJwk) {
    const key = await crypto.subtle.importKey(
        'jwk',
        { kty: 'OKP', crv: 'Ed25519', x: String((publicJwk && publicJwk.x) || '') },
        { name: 'Ed25519' },
        false,
        ['verify']
    );
    const raw = await crypto.subtle.exportKey('raw', key);
    return didKeyFromEd25519Raw(new Uint8Array(raw));
}
