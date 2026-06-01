import { isNostrNetworkAvailable } from '../../nostr/nostr-universe.js';
import {
    encryptAccountEscrow,
    decryptAccountEscrow
} from '../account-escrow.js';

/** Per-account user-pair escrow on Nostr (decrypt on first sign-in, republish on rotation). */
export const storeAccountEscrowClientMethods = {
    /**
     * Phase 1: user-pair escrow.
     *
     * On first sign-in from a fresh device the local `arborito-nostr-user-pair`
     * is auto-generated (`ensureNetworkUserPair`) and does NOT match the one
     * the user already used on another device — so we cannot decrypt remote
     * per-user blobs encrypted by the original device.
     *
     * Strategy:
     *   1. If Nostr has an escrow for this username, decrypt it with the sync
     *      secret and overwrite the local user pair with the escrowed one. The
     *      previous local pair (if any) is discarded — Arborito has not gone
     *      to production so no real progress would be lost.
     *   2. If Nostr has no escrow yet (first device that signs in for this
     *      username), encrypt the local user pair under the sync secret and
     *      publish it so the next device can pick it up.
     *   3. If the sync secret is missing (e.g. QR-scan that did not carry it)
     *      we skip the restore step; the user will be able to read their own
     *      data once they enter the secret manually.
     */
    async _restoreOrPublishUserPairEscrow(username) {
        const name = String(username || '').trim();
        const secret = String(this._authSession?.syncSecretPlain || '').trim();
        if (!name || !isNostrNetworkAvailable()) return;
        try {
            const blob = await this.nostr.loadAccountUserPairEscrowOnce(name);
            if (blob && secret) {
                try {
                    const restored = await decryptAccountEscrow(blob, secret);
                    if (restored?.identityPair?.pub && restored.identityPair.priv) {
                        this.saveNetworkUserPair(restored.identityPair);
                        return;
                    }
                } catch (e) {
                    console.warn('User-pair escrow decrypt failed', e);
                }
            }
            if (!blob && secret) {
                const local = await this.ensureNetworkUserPair();
                if (local?.pub && local?.priv) {
                    const escrow = await encryptAccountEscrow({ username: name, identityPair: local }, secret);
                    this.nostr.putAccountUserPairEscrow({ username: name, escrow });
                }
            }
        } catch (e) {
            console.warn('User-pair escrow flow failed', e);
        }
    },

    /**
     * Phase 1 helper: republish escrow after a sync-secret rotation so older
     * escrows (encrypted under the old secret) no longer work.
     */
    async _republishUserPairEscrowOnRotation(username) {
        const name = String(username || '').trim();
        const secret = String(this._authSession?.syncSecretPlain || '').trim();
        if (!name || !secret || !isNostrNetworkAvailable()) return;
        try {
            const local = await this.ensureNetworkUserPair();
            if (!(local?.pub && local?.priv)) return;
            const escrow = await encryptAccountEscrow({ username: name, identityPair: local }, secret);
            this.nostr.putAccountUserPairEscrow({ username: name, escrow });
        } catch (e) {
            console.warn('User-pair escrow republish failed', e);
        }
    }
};
