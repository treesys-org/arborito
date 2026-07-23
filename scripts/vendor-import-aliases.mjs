/**
 * Bare-import → vendored path (relative to repo root).
 * Shared by Vite (`vite.config.mjs`), `index.html` import map, and Node CI scripts.
 */
export const VENDOR_IMPORT_ALIASES = {
    '@noble/ciphers/aes': 'vendor/deps/noble-ciphers/esm/aes.js',
    '@noble/ciphers/chacha': 'vendor/deps/noble-ciphers/esm/chacha.js',
    '@noble/ciphers/crypto': 'vendor/deps/noble-ciphers/esm/crypto.js',
    '@noble/ciphers/utils': 'vendor/deps/noble-ciphers/esm/utils.js',
    '@noble/curves/secp256k1': 'vendor/deps/noble-curves/esm/secp256k1.js',
    '@noble/hashes/crypto': 'vendor/deps/noble-hashes/esm/crypto.js',
    '@noble/hashes/hkdf': 'vendor/deps/noble-hashes/esm/hkdf.js',
    '@noble/hashes/hmac': 'vendor/deps/noble-hashes/esm/hmac.js',
    '@noble/hashes/scrypt': 'vendor/deps/noble-hashes/esm/scrypt.js',
    '@noble/hashes/sha256': 'vendor/deps/noble-hashes/esm/sha256.js',
    '@noble/hashes/utils': 'vendor/deps/noble-hashes/esm/utils.js',
    '@scure/base': 'vendor/deps/scure-base/lib/esm/index.js',
};
