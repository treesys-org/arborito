import { getArboritoStore } from '../core/store-singleton.js';
import { notifyIdentityChanged } from './store-notify.js';
import {
    ensureLocalEd25519Identity,
    buildSignedIdentityClaim,
    verifyIdentityClaimRecord,
} from '../features/identity-auth/api/arborito-identity.js';
import {
    hasGdprNetworkConsent,
    onGdprNetworkConsentGranted,
    getConnectedNostr,
} from '../shared/lib/connected-services/index.js';
import { CREDENTIAL_KIND_PASSWORD, resolveSessionCredentialKind } from '../features/identity-auth/api/sync-login-secret.js';
import { buildRecoveryKitQrPayload, ensureRecoveryKeyInSession } from '../features/identity-auth/api/recovery-kit.js';
import { qrTextToDataUrl } from '../features/identity-auth/api/identity-qr.js';
import {
    loadPersistedAuthSession,
    clearPersistedAuthSession,
    persistAuthSession,
} from '../features/identity-auth/api/auth-session-persist.js';
import { findCommunitySourceByUrl } from '../features/sources/api/modals/logic/sources-helpers.js';
import { isSourcesWelcomeLoadClose } from '../features/sources/api/sources-session.js';
import { maybeSyncNetworkProgressAction } from './garden-progress-store-actions.js';
import { loadDataAction } from './sources-store-actions.js';
import { dismissModalAction } from './shell-ui-store-actions.js';

function shell() {
    return getArboritoStore();
}

export function isSignedInAction() {
    const store = shell();
    if (!store) return undefined;

        return !!(store._authSession && store._authSession.username);
    
}

export function isSyncAccountAction() {
    const store = shell();
    if (!store) return undefined;

        const s = store._authSession;
        return !!(s && s.username && s.authMode === 'sync');
    
}

export function signOutAction() {
    const store = shell();
    if (!store) return undefined;

        store._authSession = null;
        clearPersistedAuthSession();
        notifyIdentityChanged(store);
    
}

export function _restorePersistedAuthSessionAction() {
    const store = shell();
    if (!store) return undefined;

        const persisted = loadPersistedAuthSession();
        if (!persisted?.username) return;
        const credentialKind = resolveSessionCredentialKind(persisted);
        store._authSession = {
            ...persisted,
            credentialKind,
            syncQrDataUrl: '',
        };
        if (!persisted.credentialKind || persisted.credentialKind !== credentialKind) {
            persistAuthSession(store._authSession);
        }
        const finalize = () => {
            void _finalizeSyncLoginSessionAction(persisted.username).catch((e) => {
                console.warn('[arborito] restore session finalize failed', e);
            });
        };
        if (hasGdprNetworkConsent()) {
            queueMicrotask(finalize);
        } else {
            onGdprNetworkConsentGranted(finalize);
        }
    
}

export async function publishIdentityClaimAfterSignInAction() {
    const store = shell();
    if (!store) return undefined;

        const username = store._authSession?.username;
        if (!username) return false;
        const net = await getConnectedNostr(store);
        if (!net) return false;
        const { did, publicJwk, privateJwk } = await ensureLocalEd25519Identity();
        const record = await buildSignedIdentityClaim({ username, did, publicJwk, privateJwk });
        if (!(await verifyIdentityClaimRecord(record))) return false;
        return net.putIdentityClaim({ username, record });
    
}

export function _schedulePublishIdentityClaimAfterSignInAction() {
    const store = shell();
    if (!store) return undefined;

        queueMicrotask(() => {
            void publishIdentityClaimAfterSignInAction().catch(() => {});
        });
    
}

export async function _finalizeSyncLoginSessionAction(name) {
    const store = shell();
    if (!store) return undefined;

        try {
            let sess = store._authSession;
            const isPassword = resolveSessionCredentialKind(sess) === CREDENTIAL_KIND_PASSWORD;
            if (isPassword) {
                sess = ensureRecoveryKeyInSession(sess);
                if (store._authSession && store._authSession.username === name) {
                    store._authSession = { ...store._authSession, recoveryKeyPlain: sess.recoveryKeyPlain };
                }
                const payload = await buildRecoveryKitQrPayload({
                    username: name,
                    password: sess?.syncSecretPlain || '',
                    recoveryKey: sess?.recoveryKeyPlain || '',
                });
                const dataUrl = payload ? await qrTextToDataUrl(payload, { size: 220 }) : '';
                if (store._authSession && store._authSession.username === name) {
                    store._authSession.syncQrDataUrl = dataUrl || '';
                    persistAuthSession(store._authSession);
                }
            }
        } catch { /* QR generation is best-effort */ }
        try {
            store.userStore.state.cloudProgressSync = true;
            store.userStore.persist();
        } catch { /* ignore */ }
        _schedulePublishIdentityClaimAfterSignInAction();
        await store._restoreOrPublishUserPairEscrow?.(name);
        try {
            maybeSyncNetworkProgressAction(store.userStore.getPersistenceData());
        } catch { /* ignore */ }
        store._scheduleLoadOwnedTreesAfterSignIn(name);
        store._scheduleLoadInstalledSourcesAfterSignIn(name);
        store._scheduleLoadPrivateTreesAfterSignIn(name);
        store._scheduleLoadOwnedProgressAfterSignIn(name);
        store._scheduleAutoloadTreeAfterSignIn(name);
        notifyIdentityChanged(store);
    
}

export function _scheduleAutoloadTreeAfterSignInAction(username) {
    const store = shell();
    if (!store) return undefined;

        const name = String(username || '').trim();
        if (!name) return;
        if (store.state.activeSource) return;
        if (store._autoloadAfterSignInTimers) {
            store._autoloadAfterSignInTimers.forEach((t) => clearTimeout(t));
        }
        const attempt = () => {
            try {
                if (store.state.activeSource || store.state.treeHydrating || store.state.loading) {
                    return true;
                }
                const branches = Array.isArray(store.userStore?.state?.branches)
                    ? store.userStore.state.branches
                    : [];
                const community = Array.isArray(store.state.communitySources)
                    ? store.state.communitySources
                    : [];
                const preferredUrl = String(store._restoredActiveSourceUrl || '').trim();
                let src = null;

                const openLocalById = (localId) => {
                    const entry = branches.find((t) => t && t.id === localId);
                    if (!entry) return null;
                    return {
                        id: entry.id,
                        name: entry.name || 'Tree',
                        url: `branch://${entry.id}`,
                        type: 'branch',
                        isTrusted: true
                    };
                };

                if (preferredUrl) {
                    if (preferredUrl.startsWith('branch://')) {
                        src = openLocalById(preferredUrl.slice('branch://'.length));
                    } else if (preferredUrl.startsWith('privtree://')) {
                        src = openLocalById(preferredUrl.slice('privtree://'.length));
                    } else {
                        src = findCommunitySourceByUrl(community, preferredUrl);
                    }
                }

                if (!src && branches.length) {
                    const sorted = [...branches].sort(
                        (a, b) => Number(b?.updated || 0) - Number(a?.updated || 0)
                    );
                    const target = sorted[0];
                    if (target?.id) {
                        src = {
                            id: target.id,
                            name: target.name || 'Tree',
                            url: `branch://${target.id}`,
                            type: 'branch',
                            isTrusted: true
                        };
                    }
                }

                if (!src) {
                    const saved = community.filter(
                        (s) => s && s.url && !String(s.url).startsWith('privtree://')
                    );
                    if (!saved.length) return false;
                    src = saved[0];
                }

                if (!src) return false;
                /* Dismiss the Trees picker if it's still asking "load a tree"
                   (the typical fresh-device path). Leave the Profile modal
                   open so the user can copy/keep their access code; the tree
                   will be visible behind it. */
                const cur = store.state.modal;
                const ct = typeof cur === 'string' ? cur : cur?.type;
                if (ct === 'sources' && isSourcesWelcomeLoadClose()) {
                    dismissModalAction({ returnToMore: false });
                }
                void loadDataAction(src, false);
                return true;
            } catch (e) {
                console.warn('[arborito] auto-load tree after sign-in failed', e);
                return true;
            }
        };
        const delays = [1500, 3000, 5500];
        store._autoloadAfterSignInTimers = delays.map((d, i) =>
            setTimeout(() => {
                /* Stop the cascade once a tick succeeds. */
                if (attempt()) {
                    store._autoloadAfterSignInTimers?.forEach((t) => clearTimeout(t));
                    store._autoloadAfterSignInTimers = null;
                    return;
                }
                /* Last attempt failed and the user has no trees yet (brand-new
                   account, or relays returned nothing in time): make sure
                   they're not stranded, open the Trees picker so they can
                   create or browse one. The picker is undismissable until
                   they actually have a curriculum loaded, so store is safe. */
                if (i === delays.length - 1) {
                    try {
                        if (!store.state.activeSource && !store.state.treeHydrating && !store.state.loading) {
                            const cur = store.state.modal;
                            const ct = typeof cur === 'string' ? cur : cur?.type;
                            /* DO NOT replace `onboarding` here. The "Account
                             * created!" view of the register flow needs an
                             * explicit user tap on "Continue" before we
                             * advance, auto-replacing it 5.5 s after register
                             * looked to the user like the wizard was advancing
                             * on its own. Onboarding's `_complete()` is the
                             * single source of truth that opens the Trees
                             * picker when the user is actually ready. */
                            if (!ct) {
                                store.setModal({ type: 'sources' });
                            }
                        }
                    } catch (e) {
                        console.warn('[arborito] sign-in fallback picker open failed', e);
                    }
                    store._autoloadAfterSignInTimers = null;
                }
            }, d)
        );
    
}

/** Store.prototype, explicit actions. */
export const storeIdentityAuthMethods = {
    isSignedIn: isSignedInAction,
    isSyncAccount: isSyncAccountAction,
    signOut: signOutAction,
    _restorePersistedAuthSession: _restorePersistedAuthSessionAction,
    publishIdentityClaimAfterSignIn: publishIdentityClaimAfterSignInAction,
    _schedulePublishIdentityClaimAfterSignIn: _schedulePublishIdentityClaimAfterSignInAction,
    _finalizeSyncLoginSession: _finalizeSyncLoginSessionAction,
    _scheduleAutoloadTreeAfterSignIn: _scheduleAutoloadTreeAfterSignInAction,
};
