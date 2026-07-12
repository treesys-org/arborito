/**
 * Shared application proof-of-work (browser + Node aggregator).
 *
 * Challenge string (stable, do not change, existing events depend on it):
 *   `${kind}|${ownerPub}|${universeId}|${bucket}|${actorPub}|${nonce}` → SHA-256,
 * counted as leading zero bits.
 *
 * Security model: relays accept anything, so the ONLY thing that matters is
 * what readers verify. `verifyAppPow` therefore takes the required difficulty
 * from the `APP_POW_BITS` table, it never trusts bits claimed inside a
 * payload (a bot could claim `powBits: 0`).
 */

import { sha256 } from '../../../../vendor/deps/noble-hashes/esm/sha256.js';
import { utf8ToBytes } from '../../../../vendor/deps/noble-hashes/esm/utils.js';

/** Required leading-zero bits per logical payload kind. */
const APP_POW_BITS = Object.freeze({
    tree_usage_v1: 16,
    tree_vote_v1: 18,
    tree_fork_v1: 18,
    tree_report_v1: 20,
    tree_urgent_user_message_v1: 20,
    tree_legal_report_v1: 22,
    forum_message_v1: 14,
    forum_thread_v1: 16,
    account_register_v1: 20,
    tree_directory_v2: 20
});

/** @param {string} kind @returns {number} required bits (0 = no PoW for this kind) */
export function requiredAppPowBits(kind) {
    const b = APP_POW_BITS[String(kind)];
    return Number.isFinite(b) ? b : 0;
}

const MAX_BITS = 24;

function clampBits(bits) {
    return Math.max(0, Math.min(MAX_BITS, Number(bits) || 0));
}

function challengePrefix(kind, ownerPub, universeId, bucket, actorPub) {
    return `${String(kind)}|${String(ownerPub)}|${String(universeId)}|${String(bucket)}|${String(actorPub)}`;
}

/** @param {Uint8Array} bytes */
function countLeadingZeroBits(bytes) {
    let n = 0;
    for (let i = 0; i < bytes.length; i++) {
        const by = bytes[i];
        if (by === 0) {
            n += 8;
            continue;
        }
        for (let bit = 7; bit >= 0; bit--) {
            if ((by >> bit) & 1) return n;
            n += 1;
        }
        return n;
    }
    return n;
}

/**
 * Solve PoW for an app payload. Yields to the event loop periodically so the
 * UI does not freeze. Budget scales with difficulty (≈64·2^bits attempts) so
 * honest clients essentially always find a nonce, the previous fixed cap of
 * 220k iterations failed most of the time at 20+ bits and silently published
 * unverifiable events.
 * @returns {Promise<{ powBits: number, powNonce: string }>}
 */
export async function solveAppPow(kind, ownerPub, universeId, bucket, actorPub, bits) {
    const b = clampBits(bits);
    if (!b) return { powBits: 0, powNonce: '' };
    const prefix = challengePrefix(kind, ownerPub, universeId, bucket, actorPub);
    const maxIters = 64 * Math.pow(2, b);
    const salt = Math.random().toString(16).slice(2, 10);
    for (let i = 0; i < maxIters; i++) {
        const nonce = `${i.toString(16)}:${salt}`;
        const h = sha256(utf8ToBytes(`${prefix}|${nonce}`));
        if (countLeadingZeroBits(h) >= b) return { powBits: b, powNonce: nonce };
        if ((i & 0x1fff) === 0x1fff) await new Promise((r) => setTimeout(r, 0));
    }
    return { powBits: b, powNonce: '' };
}

/**
 * Verify PoW against the difficulty REQUIRED for `kind` (table above). Any
 * `powBits` value claimed inside the payload is irrelevant.
 * @returns {boolean}
 */
export function verifyAppPow(kind, ownerPub, universeId, bucket, actorPub, powNonce) {
    const required = clampBits(requiredAppPowBits(kind));
    if (!required) return true;
    const nonce = String(powNonce || '');
    if (!nonce) return false;
    try {
        const prefix = challengePrefix(kind, ownerPub, universeId, bucket, actorPub);
        const h = sha256(utf8ToBytes(`${prefix}|${nonce}`));
        return countLeadingZeroBits(h) >= required;
    } catch {
        return false;
    }
}
