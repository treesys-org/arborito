import {
    ensureLocalEd25519Identity,
    buildSignedIdentityClaim,
    verifyIdentityClaimRecord
} from '../arborito-identity.js';
import { isNostrNetworkAvailable } from '../../nostr/nostr-universe.js';
import { buildSyncLoginQrPayload } from '../sync-login-secret.js';
import { qrTextToDataUrl } from '../identity-qr.js';

/** Sign-in session predicates, signed identity claim publication, and post-sign-in finalize / autoload. */
export const storeIdentityAuthMethods = {
    /** True when the user has an active sync-login session on this device. */
    isSignedIn() {
        return !!(this._authSession && this._authSession.username);
    },

    isSyncAccount() {
        const s = this._authSession;
        return !!(s && s.username && s.authMode === 'sync');
    },

    signOut() {
        this._authSession = null;
        this.update({});
    },

    /**
     * Publish a signed DID claim to Nostr so others can verify the
     * username ↔ public key binding (no-op for signed-out devices).
     */
    async publishIdentityClaimAfterSignIn() {
        const username = this._authSession?.username;
        if (!username || !isNostrNetworkAvailable()) return false;
        const { did, publicJwk, privateJwk } = await ensureLocalEd25519Identity();
        const record = await buildSignedIdentityClaim({ username, did, publicJwk, privateJwk });
        if (!(await verifyIdentityClaimRecord(record))) return false;
        return this.nostr.putIdentityClaim({ username, record });
    },

    _schedulePublishIdentityClaimAfterSignIn() {
        queueMicrotask(() => {
            void this.publishIdentityClaimAfterSignIn().catch(() => {});
        });
    },

    /**
     * Shared post-sign-in housekeeping for any sync-login path (typed, file,
     * QR-scan, register, rotate). Builds the credentials QR for cross-device
     * pairing, enables cloud sync automatically, wires the gamification
     * username, and kicks off background tasks:
     *   1. Restore the per-user Nostr writer pair from escrow on Nostr (or
     *      publish the local one as the escrow if no escrow exists yet) — this
     *      is what makes user data (progress, sources, private trees) portable.
     *   2. Publish the signed identity claim for username ↔ DID binding.
     *   3. Pull owned trees from the directory and add them as community sources.
     *   4. Pull encrypted installed-sources blob and merge with local sources.
     *   5. Pull encrypted private trees blobs into the user-store.
     *   6. Pull stored progress for every owned tree.
     */
    async _finalizeSyncLoginSession(name) {
        try {
            const payload = buildSyncLoginQrPayload(name, this._authSession?.syncSecretPlain || '');
            const dataUrl = payload ? await qrTextToDataUrl(payload, { size: 220 }) : '';
            if (this._authSession && this._authSession.username === name) {
                this._authSession.syncQrDataUrl = dataUrl || '';
            }
        } catch { /* QR generation is best-effort */ }
        try {
            this.userStore.state.cloudProgressSync = true;
            this.userStore.persist();
        } catch { /* ignore */ }
        this._schedulePublishIdentityClaimAfterSignIn();
        // Restore the per-account user pair from Nostr (or publish ours) first
        // — every other restore step relies on the resulting pair to decrypt
        // user-scoped blobs.
        await this._restoreOrPublishUserPairEscrow(name);
        try {
            this.maybeSyncNetworkProgress(this.userStore.getPersistenceData());
        } catch { /* ignore */ }
        this._scheduleLoadOwnedTreesAfterSignIn(name);
        this._scheduleLoadInstalledSourcesAfterSignIn(name);
        this._scheduleLoadPrivateTreesAfterSignIn(name);
        this._scheduleLoadOwnedProgressAfterSignIn(name);
        this._scheduleAutoloadTreeAfterSignIn(name);
        this.update({});
    },

    /**
     * Post-sign-in onboarding: if the user signed in **without** a tree already
     * loaded (typical "fresh device" case), automatically open the most
     * recently updated tree from their account once the per-pair restore +
     * private/installed-trees pulls have had a chance to populate
     * `localTrees`. This way the user lands on a usable canvas instead of
     * being dumped into the empty Trees picker.
     *
     * We poll at 1.5s, 3s, and 5s instead of `await`ing each loader: relays can
     * be slow and we want the rest of the UI snappy. Each tick re-checks
     * activeSource so a user who picks something manually mid-wait is not
     * yanked away. After the last tick we give up silently (Trees picker stays
     * open, sign-in already pulled their saved bookmarks).
     */
    _scheduleAutoloadTreeAfterSignIn(username) {
        const name = String(username || '').trim();
        if (!name) return;
        if (this.state.activeSource) return;
        if (this._autoloadAfterSignInTimers) {
            this._autoloadAfterSignInTimers.forEach((t) => clearTimeout(t));
        }
        const attempt = () => {
            try {
                if (this.state.activeSource || this.state.treeHydrating || this.state.loading) {
                    return true;
                }
                /* Candidate set: local trees (private-synced, owned, or pre-existing)
                   take priority because they open without a network round-trip.
                   If none, fall back to the user's saved community/internet
                   bookmarks pulled by `loadInstalledSourcesFromAccount`. */
                const localTrees = Array.isArray(this.userStore?.state?.localTrees)
                    ? this.userStore.state.localTrees
                    : [];
                let target = null;
                let src = null;
                if (localTrees.length) {
                    const sorted = [...localTrees].sort(
                        (a, b) => Number(b?.updated || 0) - Number(a?.updated || 0)
                    );
                    target = sorted[0];
                    if (!target?.id) return false;
                    src = {
                        id: target.id,
                        name: target.name || 'Tree',
                        url: `local://${target.id}`,
                        type: 'local',
                        isTrusted: true
                    };
                } else {
                    const saved = Array.isArray(this.state.communitySources)
                        ? this.state.communitySources.filter(
                              (s) => s && s.url && !String(s.url).startsWith('privtree://')
                          )
                        : [];
                    if (!saved.length) return false;
                    /* No per-source timestamp on community bookmarks → just pick
                       the first (the user added them in some order). They can
                       still pick a different one from the Trees picker. */
                    target = saved[0];
                    src = target;
                }
                if (!src) return false;
                /* Dismiss the Trees picker if it's still asking "load a tree"
                   (the typical fresh-device path). Leave the Profile modal
                   open so the user can copy/keep their access code; the tree
                   will be visible behind it. */
                const cur = this.state.modal;
                const ct = typeof cur === 'string' ? cur : cur?.type;
                if (ct === 'sources') this.dismissModal();
                void this.loadData(src, false);
                return true;
            } catch (e) {
                console.warn('[arborito] auto-load tree after sign-in failed', e);
                return true;
            }
        };
        const delays = [1500, 3000, 5500];
        this._autoloadAfterSignInTimers = delays.map((d, i) =>
            setTimeout(() => {
                /* Stop the cascade once a tick succeeds. */
                if (attempt()) {
                    this._autoloadAfterSignInTimers?.forEach((t) => clearTimeout(t));
                    this._autoloadAfterSignInTimers = null;
                    return;
                }
                /* Last attempt failed and the user has no trees yet (brand-new
                   account, or relays returned nothing in time): make sure
                   they're not stranded — open the Trees picker so they can
                   create or browse one. The picker is undismissable until
                   they actually have a curriculum loaded, so this is safe. */
                if (i === delays.length - 1) {
                    try {
                        if (!this.state.activeSource && !this.state.treeHydrating && !this.state.loading) {
                            const cur = this.state.modal;
                            const ct = typeof cur === 'string' ? cur : cur?.type;
                            /* DO NOT replace `onboarding` here. The "Account
                             * created!" view of the register flow needs an
                             * explicit user tap on "Continue" before we
                             * advance — auto-replacing it 5.5 s after register
                             * looked to the user like the wizard was advancing
                             * on its own. Onboarding's `_complete()` is the
                             * single source of truth that opens the Trees
                             * picker when the user is actually ready. */
                            if (!ct) {
                                this.setModal({ type: 'sources' });
                            }
                        }
                    } catch (e) {
                        console.warn('[arborito] sign-in fallback picker open failed', e);
                    }
                    this._autoloadAfterSignInTimers = null;
                }
            }, d)
        );
    }
};
