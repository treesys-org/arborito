/** Key generation for publishing — no full Nostr client / store deps. */

import {
    getPublicKey,
    generateSecretKey,
} from '../../../../vendor/nostr-tools/lib/esm/index.js';
import { bytesToHex } from '../../../../vendor/deps/noble-hashes/esm/utils.js';

/** @returns {Promise<{ pub: string, priv: string }>} */
export async function createNostrPair() {
    const sk = generateSecretKey();
    return { pub: getPublicKey(sk), priv: bytesToHex(sk) };
}
