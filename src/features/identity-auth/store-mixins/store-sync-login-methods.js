import { isNostrNetworkAvailable } from '../../nostr/nostr-universe.js';
import {
    generatePlainSyncSecret,
    formatSyncSecretForDisplay,
    normalizeSyncSecret,
    normalizeUsername,
    hashSyncSecret,
    syncSecretMatchesStored
} from '../sync-login-secret.js';

/** Sync-login flows: register / rotate / rename / delete / sign-in / file download. */
export const storeSyncLoginMethods = {
    /**
     * Translate a raw relay-publish error into a user-facing message for the
     * sync-login / username flows. Distinguishes:
     *   • authorization rejections (NIP-20 «blocked», «restricted», «auth-required»,
     *     «public key does not have permission», «only notes signed by the owner»…) —
     *     the relay is reachable but refuses our key, so the user's name was NOT
     *     reserved on the network and someone else could still claim it.
     *   • connectivity / timeout failures — no relay accepted in time.
     * Falls back to the raw detail when nothing matches.
     * @param {unknown} err
     * @returns {string}
     */
    _describeSyncLoginPublishFailure(err) {
        const ui = this.ui || {};
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
            ? 'No relay accepted your account: every configured relay refused your key (blocked / restricted / not authorized). Your name was NOT reserved online. Change the relay list in About this tree → Network health and try again.'
            : 'No relay accepted your account in time. Your name was NOT reserved online. Check your connection or change the relay list in About this tree → Network health and try again.';
        const body = tpl || fallback;
        return body.includes('{detail}')
            ? body.replace(/\{detail\}/g, raw || '—')
            : (raw ? `${body}\n\n${raw}` : body);
    },

    /**
     * @returns {{ username: string, plainSecret: string, qrDataUrl: string }}
     */
    async registerSyncLoginAccount(username) {
        const ui = this.ui;
        const name = normalizeUsername(username);
        if (!name) {
            throw new Error(ui.authUsernameRequired || 'Choose a username first.');
        }
        if (!isNostrNetworkAvailable()) {
            throw new Error(ui.nostrNotLoadedHint || 'Nostr relays unavailable. Online account needs Nostr relays.');
        }
        const existing = await this.nostr.loadSyncLoginRecordOnce(name);
        if (existing?.hash) {
            throw new Error(
                ui.syncLoginUsernameTaken ||
                    'That username is already taken. Choose another or sign in with your code.'
            );
        }
        const plainRaw = generatePlainSyncSecret();
        const plain = formatSyncSecretForDisplay(normalizeSyncSecret(plainRaw));
        const hash = await hashSyncSecret(plain);
        // Await the publish so a silent reject ("blocked", "auth-required",
        // timeout, etc.) doesn't leave us pretending to be signed in while no
        // record was ever written to the network.
        try {
            await this.nostr.putSyncLoginHash({ username: name, hash });
        } catch (e) {
            throw new Error(this._describeSyncLoginPublishFailure(e));
        }
        this._authSession = {
            v: 1,
            username: name,
            authMode: 'sync',
            authenticatedAt: new Date().toISOString(),
            syncSecretPlain: plain
        };
        this.userStore.settings.updateGamification({
            ...this.userStore.state.gamification,
            username: name
        });
        await this._finalizeSyncLoginSession(name);
        this.notify(ui.syncLoginCreatedOk || 'Account ready. Save your code or download the file.', false);
        return { username: name, plainSecret: plain, qrDataUrl: this._authSession.syncQrDataUrl || '' };
    },

    /**
     * Replace sync secret on the network (invalidates previous QR/code/file). Must be signed in with sync account.
     * @returns {Promise<{ username: string, plainSecret: string, qrDataUrl: string }>}
     */
    async rotateSyncLoginSecret() {
        const ui = this.ui;
        const sess = this._authSession;
        const name = sess?.username ? normalizeUsername(sess.username) : '';
        if (!name) {
            throw new Error(ui.authUsernameRequired || 'Sign in first.');
        }
        if (!this.isSyncAccount()) {
            throw new Error(
                ui.syncLoginRotateOnlySync || 'Only accounts that use a sync code can rotate it here.'
            );
        }
        if (!isNostrNetworkAvailable()) {
            throw new Error(ui.nostrNotLoadedHint || 'Nostr relays unavailable.');
        }
        const plainRaw = generatePlainSyncSecret();
        const plain = formatSyncSecretForDisplay(normalizeSyncSecret(plainRaw));
        const hash = await hashSyncSecret(plain);
        try {
            await this.nostr.putSyncLoginHash({ username: name, hash });
        } catch (e) {
            throw new Error(this._describeSyncLoginPublishFailure(e));
        }
        this._authSession = {
            ...sess,
            syncSecretPlain: plain
        };
        // Re-encrypt the user pair under the new sync secret BEFORE the
        // generic finalize step (which would otherwise pull an escrow
        // encrypted under the OLD secret and fail to decrypt).
        await this._republishUserPairEscrowOnRotation(name);
        await this._finalizeSyncLoginSession(name);
        this.notify(
            ui.syncLoginRotatedOk || 'New secret generated. The old QR, code, and file no longer work.',
            false
        );
        return { username: name, plainSecret: plain, qrDataUrl: this._authSession.syncQrDataUrl || '' };
    },

    /**
     * Move sync-login hash to another username while keeping the same secret.
     * Other devices keep working until you rotate the secret. Atomic on the
     * happy path: publishes the new-name record before clearing the old, so a
     * silent publish failure can't strand the user without either record nor
     * let a stranger reclaim the old name before the new one is live.
     * @param {string} newUsernameRaw
     */
    async renameSyncLoginUsername(newUsernameRaw) {
        const ui = this.ui;
        const sess = this._authSession;
        const oldName = sess?.username ? normalizeUsername(sess.username) : '';
        const newName = normalizeUsername(newUsernameRaw);
        if (!oldName) {
            throw new Error(ui.authUsernameRequired || 'Sign in first.');
        }
        if (!this.isSyncAccount()) {
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
        const taken = await this.nostr.loadSyncLoginRecordOnce(newName);
        if (taken?.hash) {
            throw new Error(ui.syncLoginUsernameTaken || 'That name is already taken.');
        }
        const rec = await this.nostr.loadSyncLoginRecordOnce(oldName);
        if (!rec?.hash) {
            throw new Error(ui.syncLoginNoAccount || 'Could not load your online account.');
        }
        try {
            await this.nostr.putSyncLoginHash({ username: newName, hash: rec.hash });
        } catch (e) {
            throw new Error(this._describeSyncLoginPublishFailure(e));
        }
        try {
            await this.nostr.clearSyncLoginRecord(oldName);
        } catch {
            /* Best-effort: replaceable-record semantics will reclaim the old name
             * on the next rotation; the new name is already live. */
        }
        const plain = sess?.syncSecretPlain ? String(sess.syncSecretPlain).trim() : '';
        this._authSession = {
            ...sess,
            username: newName,
            ...(plain ? { syncSecretPlain: plain } : {})
        };
        this.userStore.settings.updateGamification({
            ...this.userStore.state.gamification,
            username: newName
        });
        await this._republishUserPairEscrowOnRotation(newName);
        void this.publishIdentityClaimAfterSignIn().catch(() => {});
        this.update({});
        this.notify(ui.syncLoginRenamedOk || 'Online username updated.', false);
        return newName;
    },

    /** Removes sync hash from the network and signs out (local progress stays). */
    async deleteSyncLoginOnlineAccount() {
        const ui = this.ui;
        const sess = this._authSession;
        const name = sess?.username ? normalizeUsername(sess.username) : '';
        if (!name) {
            throw new Error(ui.authUsernameRequired || 'Sign in first.');
        }
        if (!this.isSyncAccount()) {
            throw new Error(ui.syncLoginDeleteOnlySync || 'Only sync accounts can be removed here.');
        }
        if (!isNostrNetworkAvailable()) {
            throw new Error(ui.nostrNotLoadedHint || 'Nostr relays unavailable.');
        }
        try {
            await this.nostr.clearSyncLoginRecord(name);
        } catch (e) {
            throw new Error(this._describeSyncLoginPublishFailure(e));
        }
        this.userStore.state.cloudProgressSync = false;
        this.userStore.persist();
        this.signOut();
        this.notify(ui.syncLoginDeletedOk || 'Online account removed from this device.', false);
    },

    async signInWithSyncSecret(username, secretPlain) {
        const ui = this.ui;
        const name = normalizeUsername(username);
        if (!name) {
            throw new Error(ui.authUsernameRequired || 'Enter your username.');
        }
        if (!isNostrNetworkAvailable()) {
            throw new Error(ui.nostrNotLoadedHint || 'Nostr relays unavailable.');
        }
        const rec = await this.nostr.loadSyncLoginRecordOnce(name);
        if (!rec?.hash) {
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
        this._authSession = {
            v: 1,
            username: name,
            authMode: 'sync',
            authenticatedAt: new Date().toISOString(),
            syncSecretPlain: plain
        };
        this.userStore.settings.updateGamification({
            ...this.userStore.state.gamification,
            username: name
        });
        await this._finalizeSyncLoginSession(name);
        this.notify(ui.syncLoginOk || 'Signed in.', false);
        return this._authSession;
    },

    downloadSyncSecretFile(username, plainSecret) {
        const u = String(username || '').trim();
        const body =
            `Arborito sync code\nUsername: ${u}\nSecret: ${String(plainSecret || '').trim()}\n\n` +
            `Keep this file private. Anyone with this secret can use your online account.\n`;
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
};
