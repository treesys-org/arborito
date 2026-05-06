/**
 * Public share codes: 8 alphanumeric chars (no ambiguous 0/O/1/I), grouped XXXX-XXXX.
 * Safer for brand/trust than free-form names; no central name server.
 */

const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/** @returns {string|null} normalized "XXXX-XXXX" or null */
export function normalizeTreeShareCode(input) {
    const s = String(input || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');
    if (s.length !== 8) return null;
    return `${s.slice(0, 4)}-${s.slice(4)}`;
}

export function isTreeShareCodeInput(input) {
    return normalizeTreeShareCode(input) != null;
}

export function generateTreeShareCode() {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    let s = '';
    for (let i = 0; i < 8; i++) {
        s += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    }
    return `${s.slice(0, 4)}-${s.slice(4)}`;
}
