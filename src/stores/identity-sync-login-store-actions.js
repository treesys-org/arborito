import { getArboritoStore } from '../core/store-singleton.js';
import { isNostrNetworkAvailable } from '../features/nostr/api/client/index.js';
import {
    generatePlainSyncSecret,
    formatSyncSecretForDisplay,
    normalizeSyncSecret,
    normalizeUsername,
    hashSyncSecret,
    syncSecretMatchesStored,
    deriveAccountSigningPair
} from '../features/identity-auth/api/sync-login-secret.js';
import { persistAuthSession } from '../features/identity-auth/api/auth-session-persist.js';
import { publishWithTimeout } from '../features/identity-auth/api/sync-login-publish-timeout.js';

function shell() {
    return getArboritoStore();
}

const SYNC_LOGIN_PUBLISH_TIMEOUT_MS = 25_000;

/** Sync-login flows: register / rotate / rename / delete / sign-in / file download. */

export async function _loadSyncLoginRecordReliableAction(username, signerPub) {
    const store = shell();
    if (!store) return undefined;

            const name = normalizeUsername(username);
            if (!name) return null;
            const delays = [0, 400, 900, 1600];
            for (let i = 0; i < delays.length; i++) {
                if (delays[i] > 0) {
                    await new Promise((r) => setTimeout(r, delays[i]));
                }
                try {
                    const rec = await store.nostr.loadSyncLoginRecordOnce(name, signerPub);
                    if (rec?.hash) return rec;
                } catch {
                    /* retry */
                }
            }
            return null;

}

export async function _putSyncLoginHashWithTimeoutAction(payload) {
    const store = shell();
    if (!store) return undefined;

            const ui = store.ui || {};
            await publishWithTimeout(
                store.nostr.putSyncLoginHash(payload),
                SYNC_LOGIN_PUBLISH_TIMEOUT_MS,
                ui.syncLoginRegisterPublishFailedBody ||
                    'No relay accepted your account in time. Your name was NOT reserved online.'
            );

}

export async function _commitAuthSessionAction(session) {
    const store = shell();
    if (!store) return undefined;

            store._authSession = session;
            persistAuthSession(session);
            store.update({});

}

export function _describeSyncLoginPublishFailureAction(err) {
    const store = shell();
    if (!store) return undefined;

            const ui = store.ui || {};
            const raw = String((err && err.message) || err || '').trim();
            const low = raw.toLowerCase();
            const looksForbidden =
                low.includes('blocked:') ||
                low.includes('blocked ') ||
                low.includes('restricted:') ||
                low.includes('auth-required') ||
                low.includes('not authorized') ||
                low.includes('not allowed') ||
                low.includes('does not have permission') ||
                low.includes('only notes signed by') ||
                low.includes('paid relay') ||
                low.includes('invalid pow');
            const tplKey = looksForbidden
                ? 'syncLoginRegisterForbiddenBody'
                : 'syncLoginRegisterPublishFailedBody';
            const tpl = String(ui[tplKey] || '').trim();
            const fallback = looksForbidden
                ? 'No relay accepted your account: every configured relay refused your key (blocked / restricted / not authorized). Your name was NOT reserved online. Change the relay list in About store tree → Network health and try again.'
                : 'No relay accepted your account in time. Your name was NOT reserved online. Check your connection or change the relay list in About store tree → Network health and try again.';
            const body = tpl || fallback;
            return body.includes('{detail}')
                ? body.replace(/\{detail\}/g, raw || '—')
                : (raw ? `${body}\n\n${raw}` : body);

}

export async function registerSyncLoginAccountAction(username) {
    const store = shell();
    if (!store) return undefined;

            const ui = store.ui;
            const name = normalizeUsername(username);
            if (!name) {
                throw new Error(ui.authUsernameRequired || 'Choose a username first.');
            }
            if (!isNostrNetworkAvailable()) {
                throw new Error(ui.nostrNotLoadedHint || 'Nostr relays unavailable. Online account needs Nostr relays.');
            }
            const existing = await store._loadSyncLoginRecordReliable(name);
            if (existing?.hash) {
                throw new Error(
                    ui.syncLoginUsernameTaken ||
                        'That username is already taken. Choose another or sign in with your code.'
                );
            }
            const plainRaw = generatePlainSyncSecret();
            const plain = formatSyncSecretForDisplay(normalizeSyncSecret(plainRaw));
            const hash = await hashSyncSecret(plain);
            const signer = deriveAccountSigningPair(name, plain);
            if (!signer) {
                throw new Error(ui.nostrIdentityUnavailable || 'Could not derive your account key.');
            }
            try {
                await store._putSyncLoginHashWithTimeout({ username: name, hash, signerPair: signer });
            } catch (e) {
                throw new Error(store._describeSyncLoginPublishFailure(e));
            }
            const published = await store._loadSyncLoginRecordReliable(name, signer.pub);
            if (!published?.hash || published.hash !== hash) {
                throw new Error(
                    store._describeSyncLoginPublishFailure(
                        new Error('Account publish could not be confirmed on relays.')
                    )
                );
            }
            store.userStore.settings.updateGamification({
                ...store.userStore.state.gamification,
                username: name
            });
            await store._commitAuthSession({
                v: 1,
                username: name,
                authMode: 'sync',
                authenticatedAt: new Date().toISOString(),
                syncSecretPlain: plain
            });
            try {
                await store._finalizeSyncLoginSession(name);
            } catch (e) {
                console.warn('[arborito] post-register finalize failed (account is live)', e);
            }
            store.notify(ui.syncLoginCreatedOk || 'Account ready. Save your code or download the file.', false);
            return { username: name, plainSecret: plain, qrDataUrl: store._authSession.syncQrDataUrl || '' };

}

export async function rotateSyncLoginSecretAction() {
    const store = shell();
    if (!store) return undefined;

            const ui = store.ui;
            const sess = store._authSession;
            const name = sess?.username ? normalizeUsername(sess.username) : '';
            if (!name) {
                throw new Error(ui.authUsernameRequired || 'Sign in first.');
            }
            if (!store.isSyncAccount()) {
                throw new Error(
                    ui.syncLoginRotateOnlySync || 'Only accounts that use a sync code can rotate it here.'
                );
            }
            if (!isNostrNetworkAvailable()) {
                throw new Error(ui.nostrNotLoadedHint || 'Nostr relays unavailable.');
            }
            const oldSecret = sess?.syncSecretPlain ? String(sess.syncSecretPlain) : '';
            const plainRaw = generatePlainSyncSecret();
            const plain = formatSyncSecretForDisplay(normalizeSyncSecret(plainRaw));
            const hash = await hashSyncSecret(plain);
            const signer = deriveAccountSigningPair(name, plain);
            if (!signer) {
                throw new Error(ui.nostrIdentityUnavailable || 'Could not derive your account key.');
            }
            try {
                await store._putSyncLoginHashWithTimeout({ username: name, hash, signerPair: signer });
            } catch (e) {
                throw new Error(store._describeSyncLoginPublishFailure(e));
            }
            /* Invalidate the previous code: its record is signed by a different
             * (old-secret-derived) key, so it survives as a separate replaceable
             * slot until we explicitly clear it. Best-effort — the new code already
             * works regardless. */
            const oldSigner = oldSecret ? deriveAccountSigningPair(name, oldSecret) : null;
            if (oldSigner && oldSigner.pub !== signer.pub) {
                try {
                    await store.nostr.clearSyncLoginRecord({ username: name, signerPair: oldSigner });
                } catch {
                    /* Relay may still serve the previous record until it expires. */
                }
            }
            store._authSession = {
                ...sess,
                syncSecretPlain: plain
            };
            persistAuthSession(store._authSession);
            // Re-encrypt the user pair under the new sync secret BEFORE the
            // generic finalize step (which would otherwise pull an escrow
            // encrypted under the OLD secret and fail to decrypt).
            await store._republishUserPairEscrowOnRotation(name);
            await store._finalizeSyncLoginSession(name);
            store.notify(
                ui.syncLoginRotatedOk || 'New secret generated. The old QR, code, and file no longer work.',
                false
            );
            return { username: name, plainSecret: plain, qrDataUrl: store._authSession.syncQrDataUrl || '' };

}

export async function renameSyncLoginUsernameAction(newUsernameRaw) {
    const store = shell();
    if (!store) return undefined;

            const ui = store.ui;
            const sess = store._authSession;
            const oldName = sess?.username ? normalizeUsername(sess.username) : '';
            const newName = normalizeUsername(newUsernameRaw);
            if (!oldName) {
                throw new Error(ui.authUsernameRequired || 'Sign in first.');
            }
            if (!store.isSyncAccount()) {
                throw new Error(ui.syncLoginRenameOnlySync || 'Only sync accounts can change the online username here.');
            }
            if (!newName) {
                throw new Error(ui.authUsernameRequired || 'Enter a username.');
            }
            if (newName === oldName) {
                throw new Error(ui.syncLoginRenameSame || 'That is already your online username.');
            }
            if (!isNostrNetworkAvailable()) {
                throw new Error(ui.nostrNotLoadedHint || 'Nostr relays unavailable.');
            }
            const secret = sess?.syncSecretPlain ? String(sess.syncSecretPlain).trim() : '';
            const oldSigner = deriveAccountSigningPair(oldName, secret);
            const newSigner = deriveAccountSigningPair(newName, secret);
            if (!oldSigner || !newSigner) {
                throw new Error(ui.nostrIdentityUnavailable || 'Could not derive your account key.');
            }
            const taken = await store.nostr.loadSyncLoginRecordOnce(newName);
            if (taken?.hash) {
                throw new Error(ui.syncLoginUsernameTaken || 'That name is already taken.');
            }
            const rec = await store.nostr.loadSyncLoginRecordOnce(oldName, oldSigner.pub);
            if (!rec?.hash) {
                throw new Error(ui.syncLoginNoAccount || 'Could not load your online account.');
            }
            try {
                await store._putSyncLoginHashWithTimeout({ username: newName, hash: rec.hash, signerPair: newSigner });
            } catch (e) {
                throw new Error(store._describeSyncLoginPublishFailure(e));
            }
            try {
                await store.nostr.clearSyncLoginRecord({ username: oldName, signerPair: oldSigner });
            } catch {
                /* Best-effort: the new name is already live; the old record will be
                 * cleared on the next rotation if store publish didn't land. */
            }
            const plain = secret;
            store._authSession = {
                ...sess,
                username: newName,
                ...(plain ? { syncSecretPlain: plain } : {})
            };
            store.userStore.settings.updateGamification({
                ...store.userStore.state.gamification,
                username: newName
            });
            persistAuthSession(store._authSession);
            await store._republishUserPairEscrowOnRotation(newName);
            void store.publishIdentityClaimAfterSignIn().catch(() => {});
            store.update({});
            store.notify(ui.syncLoginRenamedOk || 'Online username updated.', false);
            return newName;

}

export async function deleteSyncLoginOnlineAccountAction() {
    const store = shell();
    if (!store) return undefined;

            const ui = store.ui;
            const sess = store._authSession;
            const name = sess?.username ? normalizeUsername(sess.username) : '';
            if (!name) {
                throw new Error(ui.authUsernameRequired || 'Sign in first.');
            }
            if (!store.isSyncAccount()) {
                throw new Error(ui.syncLoginDeleteOnlySync || 'Only sync accounts can be removed here.');
            }
            if (!isNostrNetworkAvailable()) {
                throw new Error(ui.nostrNotLoadedHint || 'Nostr relays unavailable.');
            }
            const signer = deriveAccountSigningPair(name, sess?.syncSecretPlain || '');
            if (!signer) {
                throw new Error(ui.nostrIdentityUnavailable || 'Could not derive your account key.');
            }
            try {
                await store.nostr.clearSyncLoginRecord({ username: name, signerPair: signer });
            } catch (e) {
                throw new Error(store._describeSyncLoginPublishFailure(e));
            }
            store.userStore.state.cloudProgressSync = false;
            store.userStore.persist();
            store.signOut();
            store.notify(ui.syncLoginDeletedOk || 'Online account removed from store device.', false);

}

export async function signInWithSyncSecretAction(username, secretPlain) {
    const store = shell();
    if (!store) return undefined;

            const ui = store.ui;
            const name = normalizeUsername(username);
            if (!name) {
                throw new Error(ui.authUsernameRequired || 'Enter your username.');
            }
            if (!isNostrNetworkAvailable()) {
                throw new Error(ui.nostrNotLoadedHint || 'Nostr relays unavailable.');
            }
            const signer = deriveAccountSigningPair(name, secretPlain);
            const rec = signer ? await store._loadSyncLoginRecordReliable(name, signer.pub) : null;
            if (!rec?.hash) {
                /* No record signed by the key store secret derives. Either the name
                 * was never registered, or the secret is wrong (a record exists, but
                 * under a different secret-derived key). Distinguish the two with an
                 * unauthenticated existence probe so the message stays accurate. */
                const exists = await store.nostr.loadSyncLoginRecordOnce(name);
                if (exists?.hash) {
                    throw new Error(ui.syncLoginWrongSecret || 'Wrong username or secret code.');
                }
                throw new Error(
                    ui.syncLoginNoAccount ||
                        'No account found for that name. Check the spelling or create a new code.'
                );
            }
            const ok = await syncSecretMatchesStored(rec.hash, secretPlain);
            if (!ok) {
                throw new Error(ui.syncLoginWrongSecret || 'Wrong username or secret code.');
            }
            const plain = formatSyncSecretForDisplay(normalizeSyncSecret(secretPlain));
            store.userStore.settings.updateGamification({
                ...store.userStore.state.gamification,
                username: name
            });
            await store._commitAuthSession({
                v: 1,
                username: name,
                authMode: 'sync',
                authenticatedAt: new Date().toISOString(),
                syncSecretPlain: plain
            });
            try {
                await store._finalizeSyncLoginSession(name);
            } catch (e) {
                console.warn('[arborito] post-sign-in finalize failed', e);
            }
            store.notify(ui.syncLoginOk || 'Signed in.', false);
            return store._authSession;

}

export function downloadSyncSecretFileAction(username, plainSecret) {
    const store = shell();
    if (!store) return undefined;

            const u = String(username || '').trim();
            const body =
                `Arborito sync code\nUsername: ${u}\nSecret: ${String(plainSecret || '').trim()}\n\n` +
                `Keep store file private. Anyone with store secret can use your online account.\n`;
            const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `arborito-sync-${u.replace(/[^\w.-]+/g, '_')}.txt`;
            a.rel = 'noopener';
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 4000);

}

/** Store.prototype — explicit actions (no bindStoreContext). */
export const storeSyncLoginMethods = {
    _loadSyncLoginRecordReliable: _loadSyncLoginRecordReliableAction,
    _putSyncLoginHashWithTimeout: _putSyncLoginHashWithTimeoutAction,
    _commitAuthSession: _commitAuthSessionAction,
    _describeSyncLoginPublishFailure: _describeSyncLoginPublishFailureAction,
    registerSyncLoginAccount: registerSyncLoginAccountAction,
    rotateSyncLoginSecret: rotateSyncLoginSecretAction,
    renameSyncLoginUsername: renameSyncLoginUsernameAction,
    deleteSyncLoginOnlineAccount: deleteSyncLoginOnlineAccountAction,
    signInWithSyncSecret: signInWithSyncSecretAction,
    downloadSyncSecretFile: downloadSyncSecretFileAction,
};

