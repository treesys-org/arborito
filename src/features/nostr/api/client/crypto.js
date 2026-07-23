/**
 * Cryptographic primitives: event finalization, payload sign/verify, NIP-44
 * authenticated encrypt/decrypt (encrypt-to-self), the per-browser auth writer
 * keypair, and proof-of-work solve/verify used by the metric-bearing kinds.
 */

import {
    finalizeEvent,
    verifyEvent,
    getPublicKey,
    generateSecretKey,
    verifiedSymbol
} from '../../../../../vendor/nostr-tools/lib/esm/index.js';
import { bytesToHex } from '../../../../../vendor/deps/noble-hashes/esm/utils.js';
import {
    KIND_APP_SIGNED_PAYLOAD,
    TAG_APP,
    TAG_APP_VALUE
} from '../nostr-spec.js';
import { requiredAppPowBits, solveAppPow, verifyAppPow } from '../nostr-pow.js';
import { pairSecretKey, splitUtf8Chunks } from './_shared.js';
import { PRIVATE_TREE_NIP44_PLAINTEXT_MAX } from '../nostr-spec.js';

export const cryptoMixin = {
    /**
     * Ensures templates compatible with nostr-tools `validateEvent` (tags without `null`/objects,
     * `content` always string, numeric `kind`). Without this, e.g. `null` in a tag triggers
     * «can't serialize event with wrong or missing properties» before talking to relays.
     */
    _finalize(pair, tpl) {
        const kind = Number((tpl && tpl.kind) ?? NaN);
        if (!Number.isFinite(kind)) {
            throw new Error(`Invalid Nostr event kind: ${String(tpl && tpl.kind)}`);
        }
        let content = tpl && tpl.content;
        if (typeof content !== 'string') {
            if (content === undefined || content === null) content = '';
            else {
                try {
                    content = JSON.stringify(content);
                } catch {
                    content = '';
                }
            }
        }
        const tagsRaw = tpl && tpl.tags;
        const tags = Array.isArray(tagsRaw)
            ? tagsRaw.map((row) =>
                  Array.isArray(row)
                      ? row.map((cell) => {
                            if (cell == null) return '';
                            const t = typeof cell;
                            if (t === 'string') return cell;
                            if (t === 'number' || t === 'boolean' || t === 'bigint') return String(cell);
                            return '';
                        })
                      : []
              )
            : [];
        const created_at =
            typeof (tpl && tpl.created_at) === 'number' && Number.isFinite(tpl.created_at)
                ? tpl.created_at
                : Math.floor(Date.now() / 1000);
        const base = { ...(tpl || {}) };
        delete base.id;
        delete base.sig;
        delete base.pubkey;
        try {
            delete base[verifiedSymbol];
        } catch {
            /* ignore */
        }
        return finalizeEvent(
            {
                ...base,
                kind,
                tags,
                content,
                created_at
            },
            pairSecretKey(pair)
        );
    },

    async _signJsonPayload(pair, payload) {
        const content = JSON.stringify(payload);
        return this._finalize(pair, {
            kind: KIND_APP_SIGNED_PAYLOAD,
            tags: [
                [TAG_APP, TAG_APP_VALUE],
                ['pk', String(pair.pub)]
            ],
            content
        });
    },

    async _verifyJsonPayloadEvent(ev) {
        try {
            if (!ev || !verifyEvent(ev)) return null;
            if (Number(ev.kind) !== KIND_APP_SIGNED_PAYLOAD) return null;
            const o = JSON.parse(String(ev.content || 'null'));
            return o && typeof o === 'object' ? o : null;
        } catch {
            return null;
        }
    },

    async _verify(sig, pub) {
        const ev = typeof sig === 'object' && sig && sig.sig ? sig : null;
        if (!ev) return null;
        if (!verifyEvent(ev)) return null;
        if (String(ev.pubkey) !== String(pub)) return null;
        return this._verifyJsonPayloadEvent(ev);
    },

    async _sign(payload, pair) {
        return this._signJsonPayload(pair, payload);
    },

    /**
     * Encrypt-to-self with NIP-44 (ChaCha20 + HMAC-SHA256, authenticated).
     * Replaces the deprecated NIP-04 (AES-CBC, unauthenticated) we used before:
     * NIP-44 gives integrity (tampered ciphertext is rejected on decrypt) and
     * hides the plaintext length via padding. The conversation key is derived
     * from the user pair with itself as counterparty, so the blob can only be
     * read by whoever holds that pair's secret.
     */
    async _selfConversationKey(pair) {
        const { getConversationKey } = await import('../../../../../vendor/nostr-tools/lib/esm/nip44.js');
        return getConversationKey(pairSecretKey(pair), String(pair.pub));
    },

    async encryptForSelf({ pair, data }) {
        const { encrypt } = await import('../../../../../vendor/nostr-tools/lib/esm/nip44.js');
        const key = await this._selfConversationKey(pair);
        return encrypt(JSON.stringify(data), key);
    },

    async decryptForSelf({ pair, encrypted }) {
        const { decrypt } = await import('../../../../../vendor/nostr-tools/lib/esm/nip44.js');
        const key = await this._selfConversationKey(pair);
        return JSON.parse(decrypt(String(encrypted), key));
    },

    /**
     * Slice + NIP-44-encrypt a private-tree body for account sync (any size).
     * @returns {Promise<{ manifestCiphertext: string, partCiphertexts: string[] }>}
     */
    async packPrivateTreeForSync({ pair, data }) {
        const { encrypt } = await import('../../../../../vendor/nostr-tools/lib/esm/nip44.js');
        const key = await this._selfConversationKey(pair);
        const plain = JSON.stringify(data);
        const slices = splitUtf8Chunks(plain, PRIVATE_TREE_NIP44_PLAINTEXT_MAX);
        const partCiphertexts = slices.map((slice) => encrypt(slice, key));
        const manifest = { v: 2, n: partCiphertexts.length };
        return {
            manifestCiphertext: encrypt(JSON.stringify(manifest), key),
            partCiphertexts
        };
    },

    /** Reassemble a private-tree body from encrypted manifest + part ciphertexts. */
    async unpackPrivateTreeFromSync({ pair, manifestCiphertext, partCiphertexts }) {
        const { decrypt } = await import('../../../../../vendor/nostr-tools/lib/esm/nip44.js');
        const key = await this._selfConversationKey(pair);
        const parts = Array.isArray(partCiphertexts) ? partCiphertexts : [];
        if (!manifestCiphertext || !parts.length) {
            throw new Error('Missing private tree sync payload.');
        }
        let json = '';
        for (const ct of parts) {
            json += decrypt(String(ct), key);
        }
        return JSON.parse(json);
    },

    /**
     * Throwaway writer keypair, persisted per-browser. Used only to sign user
     * account/identity records so relays can verify the publisher; the signing
     * pubkey is NOT used as the account identity (that is the username).
     */
    _authWriterPair() {
        try {
            const raw = localStorage.getItem('arborito-nostr-auth-writer-v1');
            if (raw) {
                const o = JSON.parse(raw);
                if (o && o.priv && o.pub) return o;
            }
        } catch {
            /* ignore */
        }
        const sk = generateSecretKey();
        const p = { pub: getPublicKey(sk), priv: bytesToHex(sk) };
        try {
            localStorage.setItem('arborito-nostr-auth-writer-v1', JSON.stringify(p));
        } catch {
            /* ignore */
        }
        return p;
    },

    _powBits(kind) {
        return requiredAppPowBits(kind);
    },

    async _solvePow(kind, ownerPub, universeId, bucket, actorPub, bits) {
        return solveAppPow(kind, ownerPub, universeId, bucket, actorPub, bits);
    },

    /**
     * Verifies against the difficulty REQUIRED for `kind`. The `_claimedBits`
     * argument is accepted for call-site compatibility but deliberately
     * ignored: trusting payload-declared bits let a bot claim `powBits: 0`
     * and skip the work entirely.
     */
    async _verifyPow(kind, ownerPub, universeId, bucket, actorPub, _claimedBits, powNonce) {
        return verifyAppPow(kind, ownerPub, universeId, bucket, actorPub, powNonce);
    },

    metricKindName(base) {
        return `a:${base}`;
    }
};
