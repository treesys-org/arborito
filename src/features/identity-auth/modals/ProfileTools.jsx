import { useIdentityAuth } from '../hooks/useIdentityAuth.js';
import { humanizeAuthError } from '../api/sync-login-error-humanize.js';

export function ProfileToolsFooter({ signedIn, embedded, onOpenBackup, onOpenPrivacy, onLocalWipe }) {
    const { ui, confirm } = useIdentityAuth();
    return (
        <div className="profile-sheet__footer">
            <div className="profile-footer-group profile-footer-group--legal">
                <button
                    type="button"
                    id="btn-open-backup"
                    className="profile-action-btn profile-action-btn--ghost"
                    onClick={onOpenBackup}
                >
                    <span className="profile-action-btn__icon" aria-hidden="true">
                        💾
                    </span>
                    <span className="profile-action-btn__text">
                        {ui.profileBackupGroupLabel || ui.backpackTitle || 'Backup'}
                    </span>
                </button>
                <button
                    type="button"
                    id="btn-open-privacy"
                    className="profile-action-btn profile-action-btn--ghost"
                    onClick={onOpenPrivacy}
                >
                    <span className="profile-action-btn__icon" aria-hidden="true">
                        📄
                    </span>
                    <span className="profile-action-btn__text">
                        {ui.profilePrivacyAndDataButton || ui.syncPrivacyNote || 'Privacy'}
                    </span>
                </button>
                {!signedIn ? (
                    <button
                        type="button"
                        id="profile-local-wipe-btn"
                        className="profile-action-btn profile-action-btn--ghost profile-action-btn--danger"
                        onClick={onLocalWipe}
                    >
                        <span className="profile-action-btn__icon" aria-hidden="true">
                            🗑️
                        </span>
                        <span className="profile-action-btn__text">
                            {ui.profileLocalWipeButton || 'Wipe local data'}
                        </span>
                    </button>
                ) : null}
            </div>
        </div>
    );
}

export function ProfileAdvancedBlock({ authBusy, onAuthError, onAuthBusyChange, onRevealReset }) {
    const {
        ui,
        confirm,
        isSyncAccount,
        authSession,
        identityActions,
    } = useIdentityAuth();
    const { rotateSyncLoginSecret, renameSyncLoginUsername, deleteSyncLoginOnlineAccount, prompt } =
        identityActions;
    const sync = isSyncAccount();
    if (!sync) return null;

    const busyCls = authBusy ? 'cursor-not-allowed opacity-50' : '';
    const busyAttr = authBusy ? { disabled: true } : {};

    return (
        <details className="profile-advanced">
            <summary>{ui.profileAdvancedSummary || 'More options'}</summary>
            <div className="profile-advanced__body">
                <button
                    type="button"
                    id="profile-sync-rotate"
                    className={`profile-advanced__btn ${busyCls}`}
                    {...busyAttr}
                    onClick={async () => {
                        if (authBusy) return;
                        if (
                            !(await confirm(
                                ui.syncLoginRotateWarnBody ||
                                    'Old QR, code, and backup file stop working. Other devices must sign in again with the new set.',
                                ui.syncLoginRotateWarnTitle || 'Generate new secret?',
                                true
                            ))
                        ) {
                            return;
                        }
                        onAuthBusyChange(true);
                        onAuthError('');
                        try {
                            await rotateSyncLoginSecret();
                            onRevealReset();
                        } catch (e) {
                            onAuthError(humanizeAuthError(e, ui));
                        } finally {
                            onAuthBusyChange(false);
                        }
                    }}
                >
                    {ui.syncLoginRotateCta || 'New QR, code & file'}
                </button>
                <button
                    type="button"
                    id="profile-sync-rename"
                    className={`profile-advanced__btn ${busyCls}`}
                    {...busyAttr}
                    onClick={async () => {
                        if (authBusy) return;
                        const sess = authSession || {};
                        const currentName = sess.username || '';
                        const newName = await prompt(
                            ui.syncLoginRenameFieldLabel || 'New username',
                            ui.syncLoginRenamePlaceholder || currentName,
                            ui.syncLoginRenameConfirmTitle || 'Change online username?'
                        );
                        if (newName === null || newName === undefined) return;
                        const trimmed = String(newName || '').trim();
                        if (!trimmed || trimmed === currentName) return;
                        if (
                            !(await confirm(
                                ui.syncLoginRenameConfirmBody ||
                                    'Only the username changes; your secret stays the same. Other devices use the new name to sign in.',
                                ui.syncLoginRenameConfirmTitle || 'Change online username?',
                                true
                            ))
                        ) {
                            return;
                        }
                        onAuthBusyChange(true);
                        onAuthError('');
                        try {
                            await renameSyncLoginUsername(trimmed);
                        } catch (e) {
                            onAuthError(humanizeAuthError(e, ui));
                        } finally {
                            onAuthBusyChange(false);
                        }
                    }}
                >
                    {ui.syncLoginRenameCta || 'Change online username'}
                </button>
                <button
                    type="button"
                    id="profile-sync-delete-account"
                    className={`profile-advanced__btn profile-advanced__btn--danger ${busyCls}`}
                    {...busyAttr}
                    onClick={async () => {
                        if (authBusy) return;
                        if (
                            !(await confirm(
                                ui.syncLoginDeleteConfirm ||
                                    'Removes online sign-in for this name. Local progress on this device stays.',
                                ui.syncLoginDeleteTitle || 'Delete online account?',
                                true
                            ))
                        ) {
                            return;
                        }
                        if (
                            !(await confirm(
                                ui.syncLoginDeleteConfirmFinal ||
                                    'This cannot be undone. Continue?',
                                ui.syncLoginDeleteTitle || 'Delete online account?',
                                true
                            ))
                        ) {
                            return;
                        }
                        onAuthBusyChange(true);
                        onAuthError('');
                        try {
                            await deleteSyncLoginOnlineAccount();
                            onRevealReset();
                        } catch (e) {
                            onAuthError(humanizeAuthError(e, ui));
                        } finally {
                            onAuthBusyChange(false);
                        }
                    }}
                >
                    {ui.syncLoginDeleteAccountButton || 'Delete online account'}
                </button>
            </div>
        </details>
    );
}
