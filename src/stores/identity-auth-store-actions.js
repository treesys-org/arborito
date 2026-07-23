import { getArboritoStore } from '../core/store-singleton.js';
import { notifyIdentityChanged } from './store-notify.js';
import { DEMO_BRANCH_ID } from '../core/demo/arborito-demo-ids.js';
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
import { loadDataAction } from './sources-store-actions.js';
import { dismissModalAction } from './shell-ui-store-actions.js';

function shell() {
    return getArboritoStore();
}

function canonicalTreeKey(url) {
    const u = String(url || '').trim();
    if (u.startsWith('privtree://')) return `branch://${u.slice('privtree://'.length)}`;
    return u;
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
    try {
        cancelAutoloadTreeAfterSignInAction();
    } catch {
        /* ignore */
    }
    try {
        store._restoredActiveSourceUrl = '';
        store._userChoseActiveSource = false;
        store._autoloadMountInFlight = false;
        store._autoloadAfterSignInPending = false;
    } catch {
        /* ignore */
    }
    try {
        store.cancelPendingAccountSyncTimers?.();
    } catch {
        /* ignore */
    }
    try {
        const n = store.userStore?.clearAllPrivateSyncedFromAccountFlags?.() || 0;
        if (n) {
            store.sourceManager?.refreshPrivateAccountSources?.();
        }
    } catch {
        /* ignore */
    }
    notifyIdentityChanged(store);
}

/** Abort in-flight post–sign-in autoload (user already picked a tree). */
export function cancelAutoloadTreeAfterSignInAction(opts = {}) {
    const store = shell();
    if (!store) return undefined;
    if (opts.userChose) store._userChoseActiveSource = true;
    store._autoloadAfterSignInPending = false;
    if (store._autoloadIdleWaitCancel) {
        try {
            store._autoloadIdleWaitCancel();
        } catch {
            /* ignore */
        }
        store._autoloadIdleWaitCancel = null;
    }
}

/**
 * Wait until curriculum mount is idle (or user cancelled / timeout).
 * Restore of account sources/trees already finished before autoload runs.
 */
function waitForCurriculumIdle(store, timeoutMs = 20000) {
    if (!store.state.treeHydrating && !store.state.loading) {
        return Promise.resolve();
    }
    return new Promise((resolve) => {
        let settled = false;
        let timer = null;
        let raf = 0;
        const finish = () => {
            if (settled) return;
            settled = true;
            if (timer != null) clearTimeout(timer);
            if (raf) cancelAnimationFrame(raf);
            if (store._autoloadIdleWaitCancel === finish) store._autoloadIdleWaitCancel = null;
            resolve();
        };
        store._autoloadIdleWaitCancel = finish;
        timer = setTimeout(finish, timeoutMs);
        const tick = () => {
            if (settled) return;
            if (
                store._userChoseActiveSource ||
                (!store.state.treeHydrating && !store.state.loading)
            ) {
                finish();
                return;
            }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
    });
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

export async function _finalizeSyncLoginSessionAction(name, opts = {}) {
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
            const dataUrl = payload ? await qrTextToDataUrl(payload, { size: 320 }) : '';
            if (store._authSession && store._authSession.username === name) {
                store._authSession.syncQrDataUrl = dataUrl || '';
                persistAuthSession(store._authSession);
            }
        }
    } catch {
        /* QR generation is best-effort */
    }

    const runNetworkRestore = async () => {
        /* Gate publishes BEFORE enabling cloudProgressSync.persist — otherwise
         * onPersist schedules an 800ms publish of empty/pre-pull state. */
        store._nostrProgressPullInFlight = true;
        clearTimeout(store._nostrProgressSyncTimer);
        store._nostrProgressSyncTimer = null;
        try {
            try {
                store.userStore.state.cloudProgressSync = true;
                store.userStore.persist();
            } catch {
                /* ignore */
            }
            _schedulePublishIdentityClaimAfterSignInAction();
            await store._restoreOrPublishUserPairEscrow?.(name);
            /* Pull remote profile/progress BEFORE any publish. Publishing first with
             * empty local state was overwriting other devices (emoji, lessons, arcade). */
            await store.loadInstalledSourcesFromAccount?.(name);
            await store.loadPrivateTreesFromAccount?.(name);
            await store.loadOwnedTreesFromDirectory?.(name);
            await store._loadProgressForOwnedTrees?.(name);
            await store._loadProgressForInstalledSources?.();
            await store._loadAccountCareProgress?.();
        } catch (e) {
            console.warn('Post-login restore failed', e);
        } finally {
            store._nostrProgressPullInFlight = false;
        }
        /* Account data is ready — open last-opened once (no blind timers). */
        await autoloadTreeAfterSignInAction(name);
        try {
            void store.reconcileNetworkProgress?.();
        } catch {
            /* ignore */
        }
        notifyIdentityChanged(store);
    };

    /*
     * Auth UX: never hold the sign-in / register spinner on relay restores.
     * QR + session are ready; trees/progress catch up in the background.
     */
    if (opts.deferNetwork) {
        void runNetworkRestore().catch((e) => {
            console.warn('[arborito] deferred post-login restore failed', e);
        });
        notifyIdentityChanged(store);
        return;
    }

    await runNetworkRestore();
}

/**
 * After account restore: apply "last opened" once, or leave the current tree (incl. demo).
 * Waits only for an in-flight curriculum mount to finish — not for arbitrary delays.
 */
export async function autoloadTreeAfterSignInAction(username) {
    const store = shell();
    if (!store) return undefined;

    const name = String(username || '').trim();
    if (!name) return;

    store._userChoseActiveSource = false;
    store._autoloadAfterSignInPending = true;

    try {
        await waitForCurriculumIdle(store);
        if (store._userChoseActiveSource) return;

        const branches = Array.isArray(store.userStore?.state?.branches)
            ? store.userStore.state.branches
            : [];
        const community = Array.isArray(store.state.communitySources)
            ? store.state.communitySources
            : [];
        const preferredUrl = String(store._restoredActiveSourceUrl || '').trim();
        const active = store.state.activeSource;
        const activeUrl = String(active?.url || '').trim();

        const openLocalById = (localId) => {
            const entry = branches.find((t) => t && t.id === localId);
            if (!entry) return null;
            return {
                id: entry.id,
                name: entry.name || 'Tree',
                url: `branch://${entry.id}`,
                type: 'branch',
                isTrusted: true,
            };
        };

        let src = null;

        if (preferredUrl) {
            if (preferredUrl.startsWith('branch://')) {
                src = openLocalById(preferredUrl.slice('branch://'.length));
            } else if (preferredUrl.startsWith('privtree://')) {
                src = openLocalById(preferredUrl.slice('privtree://'.length));
            } else {
                src = findCommunitySourceByUrl(community, preferredUrl);
            }
            if (!src) {
                /* Preferred not available locally — leave current tree alone. */
                return;
            }
            if (active && canonicalTreeKey(activeUrl) === canonicalTreeKey(src.url || preferredUrl)) {
                store._restoredActiveSourceUrl = '';
                return;
            }
        } else {
            /* No synced last-opened: keep whatever is open (incl. demo). */
            if (active) return;
            const sorted = [...branches]
                .filter((t) => t?.id && String(t.id) !== DEMO_BRANCH_ID)
                .sort((a, b) => Number(b?.updated || 0) - Number(a?.updated || 0));
            const target = sorted[0];
            if (target?.id) {
                src = {
                    id: target.id,
                    name: target.name || 'Tree',
                    url: `branch://${target.id}`,
                    type: 'branch',
                    isTrusted: true,
                };
            }
            if (!src) {
                const saved = community.filter(
                    (s) => s && s.url && !String(s.url).startsWith('privtree://')
                );
                if (saved.length) src = saved[0];
            }
        }

        if (store._userChoseActiveSource) return;

        if (!src) {
            try {
                if (!store.state.activeSource && !store.state.treeHydrating && !store.state.loading) {
                    const cur = store.state.modal;
                    const ct = typeof cur === 'string' ? cur : cur?.type;
                    /* Never replace onboarding — wizard Continue opens Forest. */
                    if (!ct) store.setModal({ type: 'sources' });
                }
            } catch (e) {
                console.warn('[arborito] sign-in forest picker open failed', e);
            }
            return;
        }

        const cur = store.state.modal;
        const ct = typeof cur === 'string' ? cur : cur?.type;
        if (ct === 'sources' && isSourcesWelcomeLoadClose()) {
            dismissModalAction({ returnToMore: false });
        }

        store._autoloadMountInFlight = true;
        try {
            await loadDataAction(src, false);
            store._restoredActiveSourceUrl = '';
        } finally {
            store._autoloadMountInFlight = false;
        }
    } catch (e) {
        console.warn('[arborito] auto-load tree after sign-in failed', e);
        store._autoloadMountInFlight = false;
    } finally {
        store._autoloadAfterSignInPending = false;
        store._autoloadIdleWaitCancel = null;
    }
}

/** Store method alias — prefer awaiting {@link autoloadTreeAfterSignInAction} from finalize. */
export function _scheduleAutoloadTreeAfterSignInAction(username) {
    void autoloadTreeAfterSignInAction(username);
}

/** Store.prototype, explicit actions. */
export const storeIdentityAuthMethods = {
    isSignedIn: isSignedInAction,
    isSyncAccount: isSyncAccountAction,
    signOut: signOutAction,
    cancelAutoloadTreeAfterSignIn: cancelAutoloadTreeAfterSignInAction,
    autoloadTreeAfterSignIn: autoloadTreeAfterSignInAction,
    _restorePersistedAuthSession: _restorePersistedAuthSessionAction,
    publishIdentityClaimAfterSignIn: publishIdentityClaimAfterSignInAction,
    _schedulePublishIdentityClaimAfterSignIn: _schedulePublishIdentityClaimAfterSignInAction,
    _finalizeSyncLoginSession: _finalizeSyncLoginSessionAction,
    _scheduleAutoloadTreeAfterSignIn: _scheduleAutoloadTreeAfterSignInAction,
};
