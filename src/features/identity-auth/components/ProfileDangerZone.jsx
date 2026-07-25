import { useIdentityAuth } from '../hooks/useIdentityAuth.js';
import { humanizeAuthError } from '../api/sync-login-error-humanize.js';

/** Irreversible online-account actions — always visible, not buried in "More options". */
export function ProfileDangerZone({ authBusy, onAuthError, onAuthBusyChange, onRevealReset }) {
    const { ui, confirm, isSyncAccount, identityActions } = useIdentityAuth();
    const { deleteSyncLoginOnlineAccount } = identityActions;

    if (!isSyncAccount()) return null;

    const busyCls = authBusy ? 'cursor-not-allowed opacity-50' : '';
    const busyAttr = authBusy ? { disabled: true } : {};

    const title = ui.profileDangerZoneTitle || 'Danger zone';

    return (
        <section className="profile-danger-zone" aria-label={title}>
            <div className="profile-danger-zone__head">
                <p className="profile-danger-zone__title">{title}</p>
            </div>
            <button
                type="button"
                id="profile-sync-delete-account"
                className={`profile-danger-zone__btn ${busyCls}`}
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
                            ui.syncLoginDeleteConfirmFinal || 'This cannot be undone. Continue?',
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
                        onRevealReset?.();
                    } catch (e) {
                        onAuthError(humanizeAuthError(e, ui));
                    } finally {
                        onAuthBusyChange(false);
                    }
                }}
            >
                {ui.syncLoginDeleteAccountButton || 'Delete online account'}
            </button>
        </section>
    );
}
