import { useIdentityAuth } from '../hooks/useIdentityAuth.js';

export { profileAfterSignedIn, profileEnableCloudSync } from '../api/profile-prefs-flow.js';

/** Session status row: local / online / cloud on / cloud off. */
export function ProfileUnifiedStatusRow({ signedIn, isSyncAccount, accountUsername, cloudProgressOn }) {
    const { ui } = useIdentityAuth();
    let statusDotClass = 'bg-slate-400 dark:bg-slate-500';
    let statusLine = ui.profileModeLocal || 'Local only';

    if (signedIn) {
        if (isSyncAccount && cloudProgressOn) {
            statusDotClass = 'bg-emerald-500';
            statusLine = String(ui.profileModeOnlineSyncOn || '{user} · cloud on').replace(
                /\{user\}/g,
                accountUsername
            );
        } else if (isSyncAccount && !cloudProgressOn) {
            statusDotClass = 'bg-amber-500';
            statusLine = String(ui.profileModeOnlineSyncOff || '{user} · cloud off').replace(
                /\{user\}/g,
                accountUsername
            );
        } else {
            statusDotClass = 'bg-sky-500';
            statusLine = String(ui.profileModeOnline || '{user} · online').replace(
                /\{user\}/g,
                accountUsername
            );
        }
    }

    const risk = !signedIn && (ui.profileModeLocalRisk || '').trim();

    return (
        <div className="profile-session-status-wrap">
            <p className="profile-session-status" role="status">
                <span className={`profile-session-status__dot ${statusDotClass}`} aria-hidden="true" />
                <span className="profile-session-status__label">{statusLine}</span>
            </p>
            {risk ? (
                <p className="profile-session-risk" role="note">
                    {risk}
                </p>
            ) : null}
        </div>
    );
}
