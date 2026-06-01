/**
 * Cryptographic primitives: event finalization, payload sign/verify, NIP-04
 * encrypt/decrypt, the per-browser auth writer keypair, and proof-of-work
 * solve/verify used by the metric-bearing event kinds.
 */

import {
    finalizeEvent,
    verifyEvent,
    getPublicKey,
    generateSecretKey,
    verifiedSymbol
} from '../../../../vendor/nostr-tools/lib/esm/index.js';
import { bytesToHex } from '../../../../vendor/deps/noble-hashes/esm/utils.js';
import {
    KIND_APP_SIGNED_PAYLOAD,
    TAG_APP,
    TAG_APP_VALUE
} from '../nostr-spec.js';
import { pairSecretKey } from './_shared.js';

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

    async encryptForSelf({ pair, data }) {
        const { encrypt } = await import('../../../../vendor/nostr-tools/lib/esm/nip04.js');
        return encrypt(pairSecretKey(pair), pair.pub, JSON.stringify(data));
    },

    async decryptForSelf({ pair, encrypted }) {
        const { decrypt } = await import('../../../../vendor/nostr-tools/lib/esm/nip04.js');
        const txt = await decrypt(pairSecretKey(pair), pair.pub, String(encrypted));
        return JSON.parse(txt);
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
        if (kind === 'tree_usage_v1') return 16;
        if (kind === 'tree_vote_v1') return 18;
        if (kind === 'tree_report_v1') return 20;
        if (kind === 'tree_legal_report_v1') return 22;
        return 0;
    },

    async _solvePow(kind, ownerPub, universeId, bucket, actorPub, bits) {
        const b = Math.max(0, Math.min(24, Number(bits) || 0));
        if (!b) return { powBits: 0, powNonce: '' };
        const ch = `${String(kind)}|${String(ownerPub)}|${String(universeId)}|${String(bucket)}|${String(actorPub)}`;
        const enc = new TextEncoder();
        const subtle = globalThis.crypto?.subtle;
        if (!subtle) return { powBits: b, powNonce: '' };
        const countLeadingZeroBits = (bytes) => {
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
        };
        const maxIters = 220000;
        for (let i = 0; i < maxIters; i++) {
            const nonce = `${i.toString(16)}:${Math.random().toString(16).slice(2, 10)}`;
            const h = new Uint8Array(await subtle.digest('SHA-256', enc.encode(`${ch}|${nonce}`)));
            if (countLeadingZeroBits(h) >= b) return { powBits: b, powNonce: nonce };
            if (i % 2000 === 0) await new Promise((r) => setTimeout(r, 0));
        }
        return { powBits: b, powNonce: '' };
    },

    async _verifyPow(kind, ownerPub, universeId, bucket, actorPub, powBits, powNonce) {
        const b = Math.max(0, Math.min(24, Number(powBits) || 0));
        if (!b) return true;
        const nonce = String(powNonce || '');
        if (!nonce) return false;
        const ch = `${String(kind)}|${String(ownerPub)}|${String(universeId)}|${String(bucket)}|${String(actorPub)}`;
        const enc = new TextEncoder();
        try {
            const h = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', enc.encode(`${ch}|${nonce}`)));
            let n = 0;
            for (let i = 0; i < h.length; i++) {
                const by = h[i];
                if (by === 0) {
                    n += 8;
                    continue;
                }
                for (let bit = 7; bit >= 0; bit--) {
                    if ((by >> bit) & 1) return n >= b;
                    n += 1;
                }
            }
            return n >= b;
        } catch {
            return false;
        }
    },

    metricKindName(base) {
        return `a:${base}`;
    }
};
