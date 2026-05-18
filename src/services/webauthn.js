/**
 * Minimal WebAuthn (passkeys) helpers for a serverless / P2P environment.
 *
 * Security model:
 * - We DO verify assertions client-side using the stored public key.
 * - We DO validate challenge + origin + type.
 * - We cannot fully enforce RP ID constraints in file:// contexts; prefer https:// for web builds.
 *
 * Stored credential record (public):
 * { v: 1, id: base64url, publicKeyJwk: object, createdAt: isoString, lastUsedAt?: isoString }
 */

function b64urlEncode(buf) {
    const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const b64 = btoa(bin);
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64urlDecode(str) {
    const s = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
    const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
    const bin = atob(s + pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

function concatBytes(a, b) {
    const aa = a instanceof Uint8Array ? a : new Uint8Array(a);
    const bb = b instanceof Uint8Array ? b : new Uint8Array(b);
    const out = new Uint8Array(aa.length + bb.length);
    out.set(aa, 0);
    out.set(bb, aa.length);
    return out;
}

function utf8Bytes(s) {
    return new TextEncoder().encode(String(s || ''));
}

async function sha256(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const h = await crypto.subtle.digest('SHA-256', b);
    return new Uint8Array(h);
}

function randomBytes(n = 32) {
    const out = new Uint8Array(n);
    crypto.getRandomValues(out);
    return out;
}

// --- Minimal CBOR decoder (enough for WebAuthn attestation parsing) ---

function cborDecode(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    let i = 0;
    const read = () => bytes[i++];
    const readN = (n) => {
        const s = bytes.slice(i, i + n);
        i += n;
        return s;
    };
    const readUint = (ai) => {
        if (ai < 24) return ai;
        if (ai === 24) return read();
        if (ai === 25) {
            const b = readN(2);
            return (b[0] << 8) | b[1];
        }
        if (ai === 26) {
            const b = readN(4);
            return (b[0] * 2 ** 24) + (b[1] << 16) + (b[2] << 8) + b[3];
        }
        throw new Error('CBOR uint too large');
    };
    const readInt = (ai) => {
        const u = readUint(ai);
        return -1 - u;
    };
    const decodeItem = () => {
        const first = read();
        const mt = first >> 5;
        const ai = first & 0x1f;
        if (mt === 0) return readUint(ai);
        if (mt === 1) return readInt(ai);
        if (mt === 2) {
            const len = readUint(ai);
            return readN(len);
        }
        if (mt === 3) {
            const len = readUint(ai);
            const s = readN(len);
            return new TextDecoder().decode(s);
        }
        if (mt === 4) {
            const len = readUint(ai);
            const arr = [];
            for (let j = 0; j < len; j++) arr.push(decodeItem());
            return arr;
        }
        if (mt === 5) {
            const len = readUint(ai);
            const obj = {};
            for (let j = 0; j < len; j++) {
                const k = decodeItem();
                const v = decodeItem();
                obj[k] = v;
            }
            return obj;
        }
        if (mt === 6) {
            // Tag: skip tag value, decode tagged item
            readUint(ai);
            return decodeItem();
        }
        if (mt === 7) {
            if (ai === 20) return false;
            if (ai === 21) return true;
            if (ai === 22) return null;
            throw new Error('CBOR simple/float not supported');
        }
        throw new Error('CBOR type not supported');
    };
    const value = decodeItem();
    return { value, bytesRead: i };
}

function parseAuthData(authData) {
    const b = authData instanceof Uint8Array ? authData : new Uint8Array(authData);
    if (b.length < 37) throw new Error('authData too short');
    let o = 0;
    const rpIdHash = b.slice(o, o + 32); o += 32;
    const flags = b[o]; o += 1;
    const signCount = (b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]; o += 4;
    const hasAttestedCredData = !!(flags & 0x40);
    if (!hasAttestedCredData) {
        return { rpIdHash, flags, signCount, attested: null };
    }
    if (b.length < o + 16 + 2) throw new Error('authData missing attested credential data');
    const aaguid = b.slice(o, o + 16); o += 16;
    const credIdLen = (b[o] << 8) | b[o + 1]; o += 2;
    const credId = b.slice(o, o + credIdLen); o += credIdLen;
    const pkCbor = b.slice(o); // rest is CBOR-encoded credentialPublicKey
    const decoded = cborDecode(pkCbor);
    const credentialPublicKey = decoded.value;
    return { rpIdHash, flags, signCount, attested: { aaguid, credId, credentialPublicKey } };
}

function coseEc2ToJwk(coseKey) {
    // COSE_Key for EC2: {1:2, 3:-7, -1:1, -2:x, -3:y}
    const kty = coseKey[1];
    const crv = coseKey[-1];
    const x = coseKey[-2];
    const y = coseKey[-3];
    if (kty !== 2 || crv !== 1) throw new Error('Unsupported COSE key (expected EC2 P-256)');
    if (!(x instanceof Uint8Array) || !(y instanceof Uint8Array)) throw new Error('Invalid COSE x/y');
    return {
        kty: 'EC',
        crv: 'P-256',
        x: b64urlEncode(x),
        y: b64urlEncode(y),
        alg: 'ES256',
        ext: true
    };
}

function coseRsaToJwk(coseKey) {
    // COSE_Key for RSA: {1:3, 3:-257, -1:n, -2:e}
    const kty = coseKey[1];
    const alg = coseKey[3];
    const n = coseKey[-1];
    const e = coseKey[-2];
    if (kty !== 3 || alg !== -257) throw new Error('Unsupported COSE key (expected RSA RS256)');
    if (!(n instanceof Uint8Array) || !(e instanceof Uint8Array)) throw new Error('Invalid COSE RSA n/e');
    return {
        kty: 'RSA',
        n: b64urlEncode(n),
        e: b64urlEncode(e),
        alg: 'RS256',
        ext: true
    };
}

function cosePublicKeyToJwk(coseKey) {
    const kty = (coseKey ? coseKey[1] : undefined);
    if (kty === 2) return coseEc2ToJwk(coseKey);
    if (kty === 3) return coseRsaToJwk(coseKey);
    throw new Error('Unsupported passkey public key type.');
}

function safeParseJson(bytes) {
    const text = new TextDecoder().decode(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    return JSON.parse(text);
}

export function isWebAuthnAvailable() {
    return typeof navigator !== 'undefined' && !!navigator.credentials && typeof PublicKeyCredential !== 'undefined';
}

async function isUvPlatformAuthenticatorAvailable() {
    try {
        if (typeof (PublicKeyCredential && PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) !== 'function') return false;
        return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch {
        return false;
    }
}

export async function createPasskeyCredential({ username, rpName = 'Arborito' } = {}) {
    if (!isWebAuthnAvailable()) throw new Error('WebAuthn is not available in this environment.');
    const name = String(username || '').trim();
    if (name.length < 2) throw new Error('Username is required.');

    const userId = await sha256(utf8Bytes(`arborito:user:${name}`));
    const challenge = randomBytes(32);
    const now = new Date().toISOString();

    /** @type {PublicKeyCredentialCreationOptions} */
    const hasPlatform = await isUvPlatformAuthenticatorAvailable();
    const publicKey = {
        challenge,
        // IMPORTANT: do not set rp.id manually for loopback/IP environments.
        // Browsers may reject rp.id = "127.0.0.1" as an invalid domain.
        // Let the user agent derive the RP ID from the current origin instead.
        rp: { name: rpName },
        user: {
            id: userId.slice(0, 16), // 16 bytes is fine; stable per username
            name,
            displayName: name
        },
        pubKeyCredParams: [
            { type: 'public-key', alg: -7 }, // ES256
            { type: 'public-key', alg: -257 }, // RS256
            { type: 'public-key', alg: -8 }  // EdDSA (Ed25519)
        ],
        authenticatorSelection: {
            // On Linux, "platform" authenticators may be unavailable depending on distro, desktop keyring,
            // and browser build. If we force `platform`, Chromium shows:
            // "Your device can't be used with this site".
            // Prefer platform when available, otherwise allow cross-platform (USB/NFC security keys).
            userVerification: hasPlatform ? 'preferred' : 'preferred',
            residentKey: 'preferred',
            ...(hasPlatform ? { authenticatorAttachment: 'platform' } : {})
        },
        timeout: 60_000,
        attestation: 'none'
    };

    const cred = await navigator.credentials.create({ publicKey });
    if (!cred) throw new Error('Passkey creation failed.');
    if (!(cred instanceof PublicKeyCredential)) throw new Error('Unexpected credential type.');

    const resp = /** @type {AuthenticatorAttestationResponse} */ (cred.response);
    const clientDataJSON = new Uint8Array(resp.clientDataJSON);
    const client = safeParseJson(clientDataJSON);
    if (client.type !== 'webauthn.create') throw new Error('Unexpected clientData type.');
    
    const currentOrigin = location.origin || '';
    const clientOrigin = String(client.origin || '');
    
    // In Electron file:// contexts, origin is "file://". 
    // In localhost, it might be "http://localhost:port".
    if (clientOrigin !== currentOrigin) {
        const h = location.hostname;
        const isLoopback = h === 'localhost' || h === '127.0.0.1' || h === '::1';
        // Special case for loopback if there's a port mismatch or similar
        if (isLoopback && (clientOrigin.includes('localhost') || clientOrigin.includes('127.0.0.1'))) {
            // allow
        } else {
            throw new Error(`Origin mismatch: expected ${currentOrigin}, got ${clientOrigin}`);
        }
    }

    const attObj = cborDecode(new Uint8Array(resp.attestationObject)).value;
    const authData = (attObj && attObj.authData);
    if (!(authData instanceof Uint8Array)) throw new Error('Missing authData in attestation.');
    const parsed = parseAuthData(authData);
    if (!(parsed.attested && parsed.attested.credId) || !(parsed.attested && parsed.attested.credentialPublicKey)) throw new Error('Missing credential data.');

    const jwk = cosePublicKeyToJwk(parsed.attested.credentialPublicKey);
    const idB64u = b64urlEncode(new Uint8Array(cred.rawId));

    return {
        v: 1,
        username: name,
        createdAt: now,
        id: idB64u,
        publicKeyJwk: jwk
    };
}

export async function verifyAssertionAndGetSession({ username, allowCredentials, expectedChallengeB64u } = {}) {
    if (!isWebAuthnAvailable()) throw new Error('WebAuthn is not available in this environment.');
    const name = String(username || '').trim();
    if (!name) throw new Error('Username is required.');
    const expectedChallenge = String(expectedChallengeB64u || '').trim();
    if (!expectedChallenge) throw new Error('Challenge is required.');

    const allow = Array.isArray(allowCredentials) ? allowCredentials : [];
    if (!allow.length) throw new Error('No credentials are registered for this username.');

    /** @type {PublicKeyCredentialRequestOptions} */
    const publicKey = {
        challenge: b64urlDecode(expectedChallenge),
        allowCredentials: allow.map((c) => ({
            type: 'public-key',
            id: b64urlDecode(c.id)
        })),
        timeout: 60_000,
        userVerification: 'preferred'
    };

    const cred = await navigator.credentials.get({ publicKey });
    if (!cred) throw new Error('Passkey assertion failed.');
    if (!(cred instanceof PublicKeyCredential)) throw new Error('Unexpected credential type.');
    const resp = /** @type {AuthenticatorAssertionResponse} */ (cred.response);

    const rawIdB64u = b64urlEncode(new Uint8Array(cred.rawId));
    const reg = allow.find((c) => String(c.id) === rawIdB64u);
    if (!reg) throw new Error('Credential not recognized for this username.');

    const clientDataJSON = new Uint8Array(resp.clientDataJSON);
    const client = safeParseJson(clientDataJSON);
    if (client.type !== 'webauthn.get') throw new Error('Unexpected clientData type.');
    
    const currentOrigin = location.origin || '';
    const clientOrigin = String(client.origin || '');
    if (clientOrigin !== currentOrigin) {
        const h = location.hostname;
        const isLoopback = h === 'localhost' || h === '127.0.0.1' || h === '::1';
        if (isLoopback && (clientOrigin.includes('localhost') || clientOrigin.includes('127.0.0.1'))) {
            // allow
        } else {
            throw new Error('Origin mismatch.');
        }
    }
    if (String(client.challenge || '') !== expectedChallenge) throw new Error('Challenge mismatch.');

    const authenticatorData = new Uint8Array(resp.authenticatorData);
    const sig = new Uint8Array(resp.signature);
    const clientHash = await sha256(clientDataJSON);
    const signed = concatBytes(authenticatorData, clientHash);

    const jwk = reg.publicKeyJwk || {};
    const isRsa = jwk.kty === 'RSA';
    const importAlgorithm = isRsa
        ? { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }
        : { name: 'ECDSA', namedCurve: 'P-256' };
    const verifyAlgorithm = isRsa
        ? { name: 'RSASSA-PKCS1-v1_5' }
        : { name: 'ECDSA', hash: 'SHA-256' };
    const key = await crypto.subtle.importKey('jwk', jwk, importAlgorithm, false, ['verify']);
    const ok = await crypto.subtle.verify(verifyAlgorithm, key, sig, signed);
    if (!ok) throw new Error('Invalid passkey signature.');

    return {
        v: 1,
        username: name,
        credentialId: rawIdB64u,
        authenticatedAt: new Date().toISOString()
    };
}

export function newChallengeB64u() {
    return b64urlEncode(randomBytes(32));
}

export function normalizeUsername(input) {
    const u = String(input || '').trim();
    // Keep it simple and predictable across locales.
    return u.replace(/\s+/g, ' ').slice(0, 64);
}

