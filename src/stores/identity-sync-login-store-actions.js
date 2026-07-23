import { getArboritoStore } from '../core/store-singleton.js';
import { notifyIdentityChanged } from './store-notify.js';
import {
    getConnectedNostr,
    requireConnectedNostr,
} from '../shared/lib/connected-services/index.js';
import {
    formatSyncSecretForDisplay,
    normalizeSyncSecret,
    normalizeUsername,
    normalizeUserPassword,
    hashSyncSecret,
    syncSecretMatchesStored,
    deriveAccountSigningPair,
    CREDENTIAL_KIND_PASSWORD,
    CREDENTIAL_KIND_SYNC_CODE,
    resolveCredentialKind,
    resolveSessionCredentialKind,
} from '../features/identity-auth/api/sync-login-secret.js';
import { checkLoginPasswordStrength, looksLikeSyncSecretCode } from '../features/identity-auth/api/login-password-strength.js';
import { saveExportFile, EXPORT_FILTERS, sanitizeExportFileName } from '../features/backup-export/api/export/save-export-file.js';
import { notifyExportSaved } from '../features/backup-export/api/export/export-result-ui.js';
import { persistAuthSession } from '../features/identity-auth/api/auth-session-persist.js';
import { publishWithTimeout } from '../features/identity-auth/api/sync-login-publish-timeout.js';
import {
    encryptRecoveryBlob,
    decryptRecoveryBlob,
    isUsableRecoveryBlob,
    checkRecoveryPassphraseStrength,
} from '../features/identity-auth/api/account-recovery.js';
import {
    generateRecoveryKey,
    serializeRecoveryKitFile,
    parseRecoveryKitFromExportFile,
    ensureRecoveryKeyInSession,
} from '../features/identity-auth/api/recovery-kit.js';

function shell() {
    return getArboritoStore();
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, Math.max(0, Number(ms) || 0)));
}

/** Keep probing relays this long before surfacing a network error. */
const SYNC_LOGIN_NETWORK_BUDGET_MS = 30_000;
const SYNC_LOGIN_CONNECT_TIMEOUT_MS = 8_000;
/** Per-attempt auth relay budget — short probes; the outer loop spends the 30s. */
const SYNC_LOGIN_AUTH_QUERY_MS = 2_500;
const SYNC_LOGIN_RETRY_GAP_MS = 350;

/** Sync-login flows: register / rotate / rename / delete / sign-in / file download. */

export async function _loadSyncLoginRecordReliableAction(username, signerPub, opts = {}) {
    const store = shell();
    if (!store) return undefined;

            const name = normalizeUsername(username);
            if (!name) return null;
            let net;
            try {
                net = await requireConnectedNostr(store);
            } catch {
                return null;
            }
            const queryMs = Math.max(800, Number(opts.queryMs) || SYNC_LOGIN_AUTH_QUERY_MS);
            const firstHit = opts.firstHit !== false;
            const raceOpts = firstHit ? { firstHit: true } : {};
            const loadOnce = (ms) => net.loadSyncLoginRecordOnce(name, signerPub, ms, raceOpts);

            /*
             * Single short probe when caller asks for `quick` without a budget
             * (pre-register taken check). Sign-in / confirm pass budgetMs and retry.
             */
            if (opts.quick && opts.budgetMs == null && !opts.confirm) {
                try {
                    const rec = await loadOnce(queryMs);
                    return rec?.hash ? rec : null;
                } catch {
                    return null;
                }
            }

            const budgetMs = Math.max(
                queryMs,
                Number(opts.budgetMs) || SYNC_LOGIN_NETWORK_BUDGET_MS
            );
            const started = Date.now();
            while (Date.now() - started < budgetMs) {
                const remaining = budgetMs - (Date.now() - started);
                const ms = Math.min(queryMs, Math.max(500, remaining));
                try {
                    const rec = await loadOnce(ms);
                    if (rec?.hash) return rec;
                } catch {
                    /* retry until budget */
                }
                const gap = Math.min(SYNC_LOGIN_RETRY_GAP_MS, budgetMs - (Date.now() - started));
                if (gap <= 0) break;
                await sleep(gap);
            }
            return null;

}

export async function _putSyncLoginHashWithTimeoutAction(payload) {
    const store = shell();
    if (!store) return undefined;

            const ui = store.ui || {};
            const net = await requireConnectedNostr(store);
            const failMsg =
                ui.syncLoginRegisterPublishFailedBody ||
                'No relay accepted your account in time. Your name was NOT reserved online.';
            const started = Date.now();
            let lastErr = null;
            while (Date.now() - started < SYNC_LOGIN_NETWORK_BUDGET_MS) {
                const remaining = SYNC_LOGIN_NETWORK_BUDGET_MS - (Date.now() - started);
                try {
                    await publishWithTimeout(
                        net.putSyncLoginHash(payload),
                        Math.max(2_500, Math.min(12_000, remaining)),
                        failMsg
                    );
                    return;
                } catch (e) {
                    lastErr = e;
                    const gap = Math.min(
                        SYNC_LOGIN_RETRY_GAP_MS,
                        SYNC_LOGIN_NETWORK_BUDGET_MS - (Date.now() - started)
                    );
                    if (gap <= 0) break;
                    await sleep(gap);
                }
            }
            throw lastErr || new Error(failMsg);

}

export async function _commitAuthSessionAction(session) {
    const store = shell();
    if (!store) return undefined;

            const credentialKind = resolveSessionCredentialKind(session);
            let next = { ...session, credentialKind };
            if (credentialKind === CREDENTIAL_KIND_PASSWORD) {
                next = ensureRecoveryKeyInSession(next);
            }
            store._authSession = next;
            persistAuthSession(store._authSession);
            notifyIdentityChanged(store);

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
                ? 'No relay accepted your account: every configured relay refused your key (blocked / restricted / not authorized). Your name was NOT reserved online. Change servers in Privacy & data and try again.'
                : 'No relay accepted your account in time. Your name was NOT reserved online. Check your connection or change servers in Privacy & data and try again.';
            const body = tpl || fallback;
            return body.includes('{detail}')
                ? body.replace(/\{detail\}/g, raw || ': ')
                : (raw ? `${body}\n\n${raw}` : body);

}

export async function registerSyncLoginAccountAction(username, options = {}) {
    const store = shell();
    if (!store) return undefined;

            const ui = store.ui;
            const name = normalizeUsername(username);
            if (!name) {
                throw new Error(ui.authUsernameRequired || 'Choose a username first.');
            }
            const credentialKind = CREDENTIAL_KIND_PASSWORD;
            const passwordRaw = String(options.password || '').trim();
            if (!passwordRaw) {
                throw new Error(ui.loginPasswordRequired || 'Choose a password first.');
            }
            if (passwordRaw !== String(options.passwordConfirm || '').trim()) {
                throw new Error(ui.loginPasswordMismatch || 'Passwords do not match.');
            }
            const strength = checkLoginPasswordStrength(passwordRaw);
            if (!strength.ok) {
                throw new Error(
                    ui.loginPasswordTooWeak ||
                        'Password is too weak. Use at least 10 characters with letters and numbers.'
                );
            }
            await requireConnectedNostr(store);
            /* UI already probed availability — one short first-hit check, not 4×6s. */
            const existing = await store._loadSyncLoginRecordReliable(name, undefined, {
                quick: true,
                queryMs: 1_800,
            });
            if (existing?.hash) {
                throw new Error(
                    ui.syncLoginUsernameTaken ||
                        'That username is already taken. Choose another or sign in with your password.'
                );
            }
            const plain = normalizeUserPassword(passwordRaw);
            const recoveryKeyPlain = generateRecoveryKey();
            const hash = await hashSyncSecret(plain, credentialKind);
            const signer = deriveAccountSigningPair(name, plain, { credentialKind });
            if (!signer) {
                throw new Error(ui.nostrIdentityUnavailable || 'Could not derive your account key.');
            }
            try {
                await store._putSyncLoginHashWithTimeout({
                    username: name,
                    hash,
                    signerPair: signer,
                    credential: credentialKind
                });
            } catch (e) {
                throw new Error(store._describeSyncLoginPublishFailure(e));
            }
            const published = await store._loadSyncLoginRecordReliable(name, signer.pub, {
                confirm: true,
                budgetMs: SYNC_LOGIN_NETWORK_BUDGET_MS,
            });
            if (!published?.hash || published.hash !== hash) {
                throw new Error(
                    store._describeSyncLoginPublishFailure(
                        new Error('Account publish could not be confirmed on relays.')
                    )
                );
            }
            store.userStore.settings.updateGamification({
                username: name,
                profileUpdatedAt: store.userStore.state.gamification?.profileUpdatedAt ?? null,
            });
            await store._commitAuthSession({
                v: 1,
                username: name,
                authMode: 'sync',
                credentialKind,
                authenticatedAt: new Date().toISOString(),
                syncSecretPlain: plain,
                ...(recoveryKeyPlain ? { recoveryKeyPlain } : {}),
            });
            /* QR + local session first; relay pulls must not block the "account created" UI. */
            try {
                await store._finalizeSyncLoginSession(name, { deferNetwork: true });
            } catch (e) {
                console.warn('[arborito] post-register finalize failed (account is live)', e);
            }
            const createdMsg =
                ui.loginPasswordCreatedOk || 'Account ready. Sign in with your password on other devices.';
            store.notify(createdMsg, false);
            return {
                username: name,
                plainSecret: plain,
                qrDataUrl: store._authSession.syncQrDataUrl || '',
                credentialKind,
                recoveryKeyPlain,
            };

}

export async function changeSyncLoginPasswordAction({
    currentPassword,
    newPassword,
    newPasswordConfirm,
} = {}) {
    const store = shell();
    if (!store) return undefined;

            const ui = store.ui;
            const sess = store._authSession;
            const name = sess?.username ? normalizeUsername(sess.username) : '';
            if (!name) {
                throw new Error(ui.authUsernameRequired || 'Sign in first.');
            }
            if (!store.isSyncAccount()) {
                throw new Error(ui.changePasswordOnlyPassword || 'Only password accounts can change the password here.');
            }
            if (resolveSessionCredentialKind(sess) !== CREDENTIAL_KIND_PASSWORD) {
                throw new Error(ui.changePasswordOnlyPassword || 'Only password accounts can change the password here.');
            }
            const current = normalizeUserPassword(currentPassword);
            const next = normalizeUserPassword(newPassword);
            const confirm = normalizeUserPassword(newPasswordConfirm);
            if (!current) {
                throw new Error(ui.changePasswordCurrentRequired || 'Enter your current password.');
            }
            if (!next) {
                throw new Error(ui.loginPasswordRequired || 'Choose a password first.');
            }
            if (next !== confirm) {
                throw new Error(ui.loginPasswordMismatch || 'Passwords do not match.');
            }
            const strength = checkLoginPasswordStrength(next);
            if (!strength.ok) {
                throw new Error(
                    ui.loginPasswordTooWeak ||
                        'Password is too weak. Use at least 10 characters with letters and numbers.'
                );
            }
            const stored = sess?.syncSecretPlain ? normalizeUserPassword(sess.syncSecretPlain) : '';
            if (!stored || current !== stored) {
                throw new Error(ui.changePasswordWrongCurrent || 'Current password is incorrect.');
            }
            if (next === stored) {
                throw new Error(ui.changePasswordSameAsOld || 'New password must be different from the current one.');
            }
            await requireConnectedNostr(store);
            const oldSigner = deriveAccountSigningPair(name, stored, { credentialKind: CREDENTIAL_KIND_PASSWORD });
            const newSigner = deriveAccountSigningPair(name, next, { credentialKind: CREDENTIAL_KIND_PASSWORD });
            if (!oldSigner || !newSigner) {
                throw new Error(ui.nostrIdentityUnavailable || 'Could not derive your account key.');
            }
            const hash = await hashSyncSecret(next, CREDENTIAL_KIND_PASSWORD);
            try {
                await store._putSyncLoginHashWithTimeout({
                    username: name,
                    hash,
                    signerPair: newSigner,
                    credential: CREDENTIAL_KIND_PASSWORD,
                });
            } catch (e) {
                throw new Error(store._describeSyncLoginPublishFailure(e));
            }
            if (oldSigner.pub !== newSigner.pub) {
                const net = await getConnectedNostr(store);
                try {
                    await net?.clearSyncLoginRecord({ username: name, signerPair: oldSigner });
                } catch {
                    /* Best-effort: the new password is already live. */
                }
            }
            store._authSession = {
                ...sess,
                syncSecretPlain: next,
            };
            persistAuthSession(store._authSession);
            await store._republishUserPairEscrowOnRotation(name);
            try {
                const net = await getConnectedNostr(store);
                const blob = await net?.loadAccountRecoveryBlobOnce(name);
                if (isUsableRecoveryBlob(blob)) {
                    await net?.clearAccountRecoveryBlob({ username: name });
                }
            } catch {
                /* Recovery clear is best-effort. */
            }
            try {
                await store._finalizeSyncLoginSession(name);
            } catch (e) {
                console.warn('[arborito] post-password-change finalize failed', e);
            }
            notifyIdentityChanged(store);
            store.notify(ui.changePasswordOk || 'Password updated.', false);
            return { username: name };

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
            const net = await requireConnectedNostr(store);
            const secret = sess?.syncSecretPlain ? String(sess.syncSecretPlain).trim() : '';
            const oldSigner = deriveAccountSigningPair(oldName, secret);
            const newSigner = deriveAccountSigningPair(newName, secret);
            if (!oldSigner || !newSigner) {
                throw new Error(ui.nostrIdentityUnavailable || 'Could not derive your account key.');
            }
            const taken = await net.loadSyncLoginRecordOnce(newName);
            if (taken?.hash) {
                throw new Error(ui.syncLoginUsernameTaken || 'That name is already taken.');
            }
            const rec = await net.loadSyncLoginRecordOnce(oldName, oldSigner.pub);
            if (!rec?.hash) {
                throw new Error(ui.syncLoginNoAccount || 'Could not load your online account.');
            }
            try {
                await store._putSyncLoginHashWithTimeout({
                    username: newName,
                    hash: rec.hash,
                    signerPair: newSigner,
                    credential: rec.credential || CREDENTIAL_KIND_SYNC_CODE,
                });
            } catch (e) {
                throw new Error(store._describeSyncLoginPublishFailure(e));
            }
            try {
                await net.clearSyncLoginRecord({ username: oldName, signerPair: oldSigner });
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
            notifyIdentityChanged(store);
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
            const net = await requireConnectedNostr(store);
            const signer = deriveAccountSigningPair(name, sess?.syncSecretPlain || '');
            if (!signer) {
                throw new Error(ui.nostrIdentityUnavailable || 'Could not derive your account key.');
            }
            try {
                await net.clearSyncLoginRecord({ username: name, signerPair: signer });
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
            const secret = String(secretPlain || '').trim();
            if (!secret) {
                throw new Error(ui.syncLoginNeedUserSecret || 'Enter username and password.');
            }
            await requireConnectedNostr(store, { timeoutMs: SYNC_LOGIN_CONNECT_TIMEOUT_MS });

            const networkErr =
                ui.syncLoginConnectionSlow ||
                'Your connection looks slow. Check your internet and try again.';
            const tryOrder = looksLikeSyncSecretCode(secret)
                ? [CREDENTIAL_KIND_SYNC_CODE, CREDENTIAL_KIND_PASSWORD]
                : [CREDENTIAL_KIND_PASSWORD, CREDENTIAL_KIND_SYNC_CODE];

            const started = Date.now();
            let rec = null;
            let matchedKind = CREDENTIAL_KIND_SYNC_CODE;

            while (Date.now() - started < SYNC_LOGIN_NETWORK_BUDGET_MS) {
                const probes = await Promise.all(
                    tryOrder.map(async (kind) => {
                        const signer = deriveAccountSigningPair(name, secret, { credentialKind: kind });
                        if (!signer) return null;
                        const row = await store._loadSyncLoginRecordReliable(name, signer.pub, {
                            quick: true,
                            firstHit: true,
                        });
                        if (!row?.hash) return null;
                        if (!(await syncSecretMatchesStored(row.hash, secret, row.credential || kind))) {
                            return null;
                        }
                        return {
                            row,
                            kind: resolveCredentialKind(row.credential || kind),
                        };
                    })
                );
                const matched = probes.find(Boolean) || null;
                if (matched?.row?.hash) {
                    rec = matched.row;
                    matchedKind = matched.kind;
                    break;
                }

                /* Account visible but secret wrong → fail immediately (do not burn 30s). */
                const net = await getConnectedNostr(store);
                const exists = net
                    ? await net.loadSyncLoginRecordOnce(name, undefined, SYNC_LOGIN_AUTH_QUERY_MS, {
                          firstHit: true,
                      })
                    : null;
                if (exists?.hash) {
                    throw new Error(ui.syncLoginWrongSecret || 'Wrong username or password.');
                }

                const gap = Math.min(
                    SYNC_LOGIN_RETRY_GAP_MS,
                    SYNC_LOGIN_NETWORK_BUDGET_MS - (Date.now() - started)
                );
                if (gap <= 0) break;
                await sleep(gap);
            }

            if (!rec?.hash) {
                throw new Error(networkErr);
            }

            const plain =
                matchedKind === CREDENTIAL_KIND_PASSWORD
                    ? normalizeUserPassword(secret)
                    : formatSyncSecretForDisplay(normalizeSyncSecret(secret));
            /* Set display name without bumping profileUpdatedAt — that stamp
             * must not win over a newer remote emoji pulled in finalize. */
            const gPrev = store.userStore.state.gamification || {};
            store.userStore.settings.updateGamification({
                username: name,
                profileUpdatedAt: gPrev.profileUpdatedAt ?? null,
            });
            await store._commitAuthSession({
                v: 1,
                username: name,
                authMode: 'sync',
                credentialKind: matchedKind,
                authenticatedAt: new Date().toISOString(),
                syncSecretPlain: plain
            });
            try {
                await store._finalizeSyncLoginSession(name, { deferNetwork: true });
            } catch (e) {
                console.warn('[arborito] post-sign-in finalize failed', e);
            }
            store.notify(ui.syncLoginOk || 'Signed in.', false);
            return store._authSession;

}

/**
 * Set up (or replace) the recovery passphrase for the signed-in sync account.
 * Encrypts the current sync secret under the passphrase (scrypt) and publishes
 * the PII-free blob.
 * @param {{ passphrase: string }} args
 */
export async function setAccountRecoveryAction({ passphrase } = {}) {
    const store = shell();
    if (!store) return undefined;

            const ui = store.ui;
            const sess = store._authSession;
            const name = sess?.username ? normalizeUsername(sess.username) : '';
            const secret = sess?.syncSecretPlain ? String(sess.syncSecretPlain).trim() : '';
            if (!name || !secret) {
                throw new Error(ui.authUsernameRequired || 'Sign in first.');
            }
            if (!store.isSyncAccount()) {
                throw new Error(ui.recoverySetupSignInFirst || 'Sign in to your online account first.');
            }
            const net = await requireConnectedNostr(store);
            const strength = checkRecoveryPassphraseStrength(passphrase);
            if (!strength.ok) {
                throw new Error(ui.recoveryPassphraseTooWeak || 'Passphrase too weak. Use at least 12 characters (4+ words recommended).');
            }
            const blob = await encryptRecoveryBlob({ username: name, syncSecret: secret, passphrase });
            const ok = net.putAccountRecoveryBlob({ username: name, blob });
            if (!ok) {
                throw new Error(ui.recoverySaveFailed || 'Could not save your recovery setup. Try again.');
            }
            store.notify(ui.recoverySavedOk || 'Recovery passphrase saved.', false);
            return true;

}

/** Remove the recovery passphrase for the signed-in account. */
export async function clearAccountRecoveryAction() {
    const store = shell();
    if (!store) return undefined;

            const sess = store._authSession;
            const name = sess?.username ? normalizeUsername(sess.username) : '';
            if (!name || !store.isSyncAccount()) return false;
            const net = await getConnectedNostr(store);
            if (!net) return false;
            net.clearAccountRecoveryBlob({ username: name });
            store.notify(store.ui.recoveryClearedOk || 'Recovery passphrase removed.', false);
            return true;

}

/**
 * True when the username has a usable recovery blob published.
 * @param {string} username
 * @returns {Promise<boolean>}
 */
export async function hasAccountRecoveryAction(username) {
    const store = shell();
    if (!store) return undefined;

            const name = normalizeUsername(username);
            if (!name) return false;
            const net = await getConnectedNostr(store);
            if (!net) return false;
            const blob =
                typeof net.listAccountRecoveryBlobs === 'function'
                    ? (await net.listAccountRecoveryBlobs(name)).find((b) => isUsableRecoveryBlob(b))
                    : await net.loadAccountRecoveryBlobOnce(name);
            return isUsableRecoveryBlob(blob);

}

/**
 * Recover an account: decrypt the sync secret from the recovery blob using the
 * user's passphrase, then sign in with it.
 * @param {{ username: string, passphrase: string }} args
 */
export async function recoverAccountWithPassphraseAction({ username, passphrase } = {}) {
    const store = shell();
    if (!store) return undefined;

            const ui = store.ui;
            const name = normalizeUsername(username);
            if (!name) {
                throw new Error(ui.authUsernameRequired || 'Enter your username.');
            }
            const net = await requireConnectedNostr(store);
            const blobs =
                typeof net.listAccountRecoveryBlobs === 'function'
                    ? await net.listAccountRecoveryBlobs(name)
                    : [await net.loadAccountRecoveryBlobOnce(name)].filter(Boolean);
            let syncSecret = null;
            let lastErr = null;
            for (const blob of blobs) {
                if (!isUsableRecoveryBlob(blob)) continue;
                try {
                    const out = await decryptRecoveryBlob(blob, passphrase);
                    syncSecret = out.syncSecret;
                    break;
                } catch (e) {
                    lastErr = e;
                }
            }
            if (!syncSecret) {
                if (lastErr) throw lastErr;
                throw new Error(ui.recoveryNotConfigured || 'No recovery passphrase set for that account.');
            }
            return store.signInWithSyncSecret(name, syncSecret);

}

export async function downloadRecoveryKitFileAction(username, password, recoveryKey) {
    const store = shell();
    if (!store) return undefined;

            const u = String(username || '').trim();
            const body = await serializeRecoveryKitFile({
                username: u,
                password: String(password || '').trim(),
                recoveryKey: String(recoveryKey || '').trim(),
            });
            const result = await saveExportFile({
                data: body,
                filename: sanitizeExportFileName(
                    `arborito-recovery-${u.replace(/[^\w.-]+/g, '_')}.txt`,
                    'arborito-recovery.txt'
                ),
                mimeType: 'text/plain;charset=utf-8',
                filters: EXPORT_FILTERS.text,
            });
            if (result?.ok) notifyExportSaved(result, store.ui);
}

/** Store.prototype, explicit actions (no bindStoreContext). */
export const storeSyncLoginMethods = {
    _loadSyncLoginRecordReliable: _loadSyncLoginRecordReliableAction,
    _putSyncLoginHashWithTimeout: _putSyncLoginHashWithTimeoutAction,
    _commitAuthSession: _commitAuthSessionAction,
    _describeSyncLoginPublishFailure: _describeSyncLoginPublishFailureAction,
    registerSyncLoginAccount: registerSyncLoginAccountAction,
    changeSyncLoginPassword: changeSyncLoginPasswordAction,
    renameSyncLoginUsername: renameSyncLoginUsernameAction,
    deleteSyncLoginOnlineAccount: deleteSyncLoginOnlineAccountAction,
    signInWithSyncSecret: signInWithSyncSecretAction,
    downloadRecoveryKitFile: downloadRecoveryKitFileAction,
    setAccountRecovery: setAccountRecoveryAction,
    clearAccountRecovery: clearAccountRecoveryAction,
    hasAccountRecovery: hasAccountRecoveryAction,
    recoverAccountWithPassphrase: recoverAccountWithPassphraseAction,
};
