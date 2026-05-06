/** Bitcoin / multibase base58-btc alphabet (no checksum). */
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/**
 * @param {Uint8Array|ArrayBuffer} input
 * @returns {string}
 */
export function base58BtcEncode(input) {
    const buf = input instanceof Uint8Array ? input : new Uint8Array(input);
    if (!buf.length) return '';
    const digits = [0];
    for (let i = 0; i < buf.length; i++) {
        let carry = buf[i];
        for (let j = 0; j < digits.length; j++) {
            carry += digits[j] << 8;
            digits[j] = carry % 58;
            carry = (carry / 58) | 0;
        }
        while (carry) {
            digits.push(carry % 58);
            carry = (carry / 58) | 0;
        }
    }
    let out = '';
    for (let k = 0; k < buf.length && buf[k] === 0; k++) out += B58[0];
    for (let j = digits.length - 1; j >= 0; j--) out += B58[digits[j]];
    return out;
}
