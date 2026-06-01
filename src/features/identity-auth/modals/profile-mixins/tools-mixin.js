import { store } from '../../../../core/store.js';
import { escHtml } from '../../../../shared/lib/html-escape.js';
import { humanizeAuthError } from '../../sync-login-error-humanize.js';

/** Data-and-account tools surfaced from the Profile sheet:
 *  - the close action that backs the modal's chrome and tap targets;
 *  - the footer row of ghost-style buttons (Backup, Privacy, "Wipe local
 *    data" for unsigned visitors) plus the wiring for each;
 *  - the "More options" advanced block when the user has a sync account
 *    (rotate secret, rename online username, delete online account);
 *  - the signed-in sign-out flow that wipes local data on this device. */
export const toolsMixin = {
    close() {
        this.state.syncAccessCodeVisible = false;
        this.state.syncAccessQrVisible = false;
        if (this.hasAttribute('embed')) {
            if (document.querySelector('arborito-sidebar') && document.querySelector('arborito-sidebar').closeMobileMenuIfOpen) document.querySelector('arborito-sidebar').closeMobileMenuIfOpen();
            return;
        }
        store.dismissModal();
    },

    _renderAdvancedBlockHtml(ui, isSyncAccount) {
        if (!isSyncAccount) return '';
        return `<details class="profile-advanced">
                <summary>${escHtml(ui.profileAdvancedSummary || 'More options')}</summary>
                <div class="profile-advanced__body">
                    <button type="button" id="profile-sync-rotate" class="profile-advanced__btn ${this.state.authBusy ? 'cursor-not-allowed opacity-50' : ''}" ${this.state.authBusy ? 'disabled' : ''}>${escHtml(ui.syncLoginRotateCta || 'New QR, code & file')}</button>
                    <button type="button" id="profile-sync-rename" class="profile-advanced__btn ${this.state.authBusy ? 'cursor-not-allowed opacity-50' : ''}" ${this.state.authBusy ? 'disabled' : ''}>${escHtml(ui.syncLoginRenameCta || 'Change online username')}</button>
                    <button type="button" id="profile-sync-delete-account" class="profile-advanced__btn profile-advanced__btn--danger ${this.state.authBusy ? 'cursor-not-allowed opacity-50' : ''}" ${this.state.authBusy ? 'disabled' : ''}>${escHtml(ui.syncLoginDeleteAccountButton || 'Delete online account')}</button>
                </div>
            </details>`;
    },

    /* "Sounds" / "Animations" and "Backup" used to live inline on the Profile sheet.
     * They were extracted into their own modals (`celebration-prefs` / `backup`) reachable
     * from the "More" menu so the Profile can stay focused on identity / session. */
    _renderToolsFooterHtml(ui, signedIn) {
        return `
            <div class="profile-sheet__footer">
                <div class="profile-footer-group profile-footer-group--legal">
                    <button type="button" id="btn-open-backup" class="profile-action-btn profile-action-btn--ghost">
                        <span class="profile-action-btn__icon" aria-hidden="true">💾</span>
                        <span class="profile-action-btn__text">${escHtml(ui.profileBackupGroupLabel || ui.backpackTitle || 'Backup')}</span>
                    </button>
                    <button type="button" id="btn-open-privacy" class="profile-action-btn profile-action-btn--ghost">
                        <span class="profile-action-btn__icon" aria-hidden="true">📄</span>
                        <span class="profile-action-btn__text">${escHtml(ui.profilePrivacyAndDataButton || ui.syncPrivacyNote || 'Privacy')}</span>
                    </button>
                    ${
                        !signedIn
                            ? `<button type="button" id="profile-local-wipe-btn" class="profile-action-btn profile-action-btn--ghost profile-action-btn--danger">
                        <span class="profile-action-btn__icon" aria-hidden="true">🗑️</span>
                        <span class="profile-action-btn__text">${escHtml(ui.profileLocalWipeButton || 'Wipe local data')}</span>
                    </button>`
                            : ''
                    }
                </div>
            </div>`;
    },

    _bindToolsEvents() {
        /* Sounds / Animations / Backup moved to dedicated `celebration-prefs` and
         * `backup` modals reachable from the "More" sheet — see `sidebar.js` and
         * `components/modals/celebration-prefs.js` / `components/modals/backup.js`. */

        const btnPrivacy = this.querySelector('#btn-open-privacy');
        if (btnPrivacy) {
            btnPrivacy.onclick = () => {
                const cur = store.value.modal;
                const fromSheet =
                    this.hasAttribute('embed') || !!(cur && typeof cur === 'object' && cur.fromMobileMore);
                store.setModal(fromSheet ? { type: 'privacy', fromMobileMore: true } : 'privacy');
            };
        }

        const btnBackup = this.querySelector('#btn-open-backup');
        if (btnBackup) {
            btnBackup.onclick = () => {
                const cur = store.value.modal;
                const fromSheet =
                    this.hasAttribute('embed') || !!(cur && typeof cur === 'object' && cur.fromMobileMore);
                store.setModal(fromSheet ? { type: 'backup', fromMobileMore: true } : 'backup');
            };
        }

        const rotBtn = this.querySelector('#profile-sync-rotate');
        if (rotBtn) {
            rotBtn.onclick = async () => {
                if (this.state.authBusy) return;
                const ui = store.ui;
                if (
                    !(await store.confirm(
                        ui.syncLoginRotateWarnBody ||
                            'Old QR, code, and backup file stop working. Other devices must sign in again with the new set.',
                        ui.syncLoginRotateWarnTitle || 'Generate new secret?',
                        true
                    ))
                ) {
                    return;
                }
                this.state.authBusy = true;
                this.state.authError = '';
                rotBtn.disabled = true;
                try {
                    await store.rotateSyncLoginSecret();
                    this.state.syncAccessCodeVisible = false;
                    this.state.syncAccessQrVisible = false;
                } catch (e) {
                    this.state.authError = humanizeAuthError(e, store.ui);
                } finally {
                    this.state.authBusy = false;
                }
                this.render();
            };
        }

        const renameBtn = this.querySelector('#profile-sync-rename');
        if (renameBtn) {
            renameBtn.onclick = async () => {
                if (this.state.authBusy) return;
                const ui = store.ui;
                const sess = store._authSession || {};
                const currentName = sess.username || '';
                const newName = await store.prompt(
                    ui.syncLoginRenameFieldLabel || 'New username',
                    ui.syncLoginRenamePlaceholder || currentName,
                    ui.syncLoginRenameConfirmTitle || 'Change online username?'
                );
                if (newName === null || newName === undefined) return;
                const trimmed = String(newName || '').trim();
                if (!trimmed || trimmed === currentName) return;
                if (
                    !(await store.confirm(
                        ui.syncLoginRenameConfirmBody || 'Only the username changes; your secret stays the same. Other devices use the new name to sign in.',
                        ui.syncLoginRenameConfirmTitle || 'Change online username?',
                        true
                    ))
                ) {
                    return;
                }
                this.state.authBusy = true;
                this.state.authError = '';
                renameBtn.disabled = true;
                try {
                    await store.renameSyncLoginUsername(trimmed);
                } catch (e) {
                    this.state.authError = humanizeAuthError(e, store.ui);
                } finally {
                    this.state.authBusy = false;
                }
                this.render();
            };
        }

        const delAcc = this.querySelector('#profile-sync-delete-account');
        if (delAcc) {
            delAcc.onclick = async () => {
                if (this.state.authBusy) return;
                const ui = store.ui;
                if (
                    !(await store.confirm(
                        ui.syncLoginDeleteConfirm ||
                            'Removes online sign-in for this name. Local progress on this device stays.',
                        ui.syncLoginDeleteTitle || 'Delete online account?',
                        true
                    ))
                ) {
                    return;
                }
                if (
                    !(await store.confirm(
                        ui.syncLoginDeleteConfirmFinal || 'This cannot be undone. Continue?',
                        ui.syncLoginDeleteTitle || 'Delete online account?',
                        true
                    ))
                ) {
                    return;
                }
                this.state.authBusy = true;
                this.state.authError = '';
                delAcc.disabled = true;
                try {
                    await store.deleteSyncLoginOnlineAccount();
                    this.state.syncAccessCodeVisible = false;
                    this.state.syncAccessQrVisible = false;
                } catch (e) {
                    this.state.authError = humanizeAuthError(e, store.ui);
                } finally {
                    this.state.authBusy = false;
                }
                this.render();
            };
        }

        const localWipe = this.querySelector('#profile-local-wipe-btn');
        if (localWipe) {
            localWipe.onclick = () => store.wipeAllLocalDataOnThisDeviceInteractive();
        }

        const signOutBtn = this.querySelector('#profile-session-signout');
        if (signOutBtn) {
            signOutBtn.onclick = async () => {
                if (this.state.authBusy) return;
                const ok = await store.confirm(
                    store.ui.profileLogoutClearsLocalConfirm ||
                        'Sign out and delete local Arborito data from this browser?',
                    store.ui.profileLogoutClearsLocalTitle || store.ui.authSignOut || 'Sign out',
                    true
                );
                if (!ok) return;
                this.state.authBusy = true;
                this.state.authError = '';
                this.render();
                await store.wipeAllLocalDataOnThisDevice();
            };
        }

        /* Export / Import progress lives in the dedicated `arborito-modal-backup`
         * accessible from the "More" menu — see `components/modals/backup.js`. */
    }
};
