/**
 * Browsers treat http://localhost (and 127.0.0.1) as a secure context, but
 * http://192.168.x.x / other LAN IPs are not — Web Crypto + Nostr keys can fail there.
 */

/**
 * randomUUID() is specified for secure contexts only; this falls back to getRandomValues,
 * then to a non-cryptographic last resort if needed (e.g. some plain-HTTP contexts).
 * @returns {string}
 */
export function randomUUIDSafe() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        try {
            return crypto.randomUUID();
        } catch {
            /* insecure context or other restriction */
        }
    }
    const bytes = new Uint8Array(16);
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        try {
            crypto.getRandomValues(bytes);
        } catch {
            for (let i = 0; i < 16; i++) bytes[i] = (Math.random() * 256) | 0;
        }
    } else {
        for (let i = 0; i < 16; i++) bytes[i] = (Math.random() * 256) | 0;
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
