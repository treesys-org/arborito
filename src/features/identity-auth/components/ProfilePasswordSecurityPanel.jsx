import { useEffect, useState } from 'react';
import { useIdentityAuth } from '../hooks/useIdentityAuth.js';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';
import { ProfileQrSyncPanel } from './ProfileQrSyncPanel.jsx';
import { useViewportShell } from '../../../shared/ui/breakpoints.js';

/**
 * Signed-in password account: change password + unified account recovery (export key + passphrase).
 */
export function ProfilePasswordSecurityPanel({
    ui,
    disabled = false,
    qrDataUrl = '',
    qrRevealed = false,
    onToggleQr,
    onChangePassword,
    onDownloadRecoveryKit,
    onSetupRecovery,
}) {
    const { authSession, identityActions } = useIdentityAuth();
    const [hasRecovery, setHasRecovery] = useState(null);

    useEffect(() => {
        const name = String(authSession?.username || '').trim();
        if (!name) {
            setHasRecovery(null);
            return;
        }
        let cancelled = false;
        void identityActions
            .hasAccountRecovery(name)
            .then((ok) => {
                if (!cancelled) setHasRecovery(!!ok);
            })
            .catch(() => {
                if (!cancelled) setHasRecovery(false);
            });
        return () => {
            cancelled = true;
        };
    }, [authSession?.username, identityActions]);

    const { mobile } = useViewportShell();
    const changeLbl = ui.profileChangePasswordCta || 'Change password';
    const recoveryTitle = ui.profileAccountRecoveryTitle || ui.recoverySetupCta || 'Account recovery';
    const recoveryHint =
        ui.profileAccountRecoveryHint ||
        'Export a recovery key file or set a passphrase if you forget your password.';
    const exportLbl = ui.syncKeyExportCta || 'Export recovery key';
    const passphraseLbl = ui.profileAccountRecoveryPassphraseCta || 'Recovery passphrase';
    const recommendBadge = ui.profileRecoveryRecommendBadge || 'Recommended';
    const activeBadge = ui.profileRecoveryActiveBadge || 'Active';
    const btnClass = 'profile-password-security__btn';

    return (
        <section className="profile-password-security profile-password-security--compact" aria-label={recoveryTitle}>
            <div className="profile-password-security__row">
                {onChangePassword ? (
                    <button type="button" className={btnClass} disabled={disabled} onClick={onChangePassword}>
                        <ChromeEmoji emoji="🔑" size={16} className="profile-password-security__icon" />
                        <span className="profile-password-security__label">{changeLbl}</span>
                    </button>
                ) : null}
                {onToggleQr && qrDataUrl && !mobile ? (
                    <ProfileQrSyncPanel qrDataUrl={qrDataUrl} revealed={qrRevealed} onToggle={onToggleQr} />
                ) : null}
            </div>
            <div className="profile-account-recovery">
                <div className="profile-account-recovery__head">
                    <p className="profile-account-recovery__title">{recoveryTitle}</p>
                    {hasRecovery === false ? (
                        <span className="profile-password-security__badge profile-password-security__badge--recommend">
                            {recommendBadge}
                        </span>
                    ) : null}
                    {hasRecovery === true ? (
                        <span className="profile-password-security__badge profile-password-security__badge--active">
                            {activeBadge}
                        </span>
                    ) : null}
                </div>
                <p className="profile-account-recovery__hint">{recoveryHint}</p>
                <div className="profile-account-recovery__actions">
                    {onDownloadRecoveryKit ? (
                        <button type="button" className={btnClass} disabled={disabled} onClick={onDownloadRecoveryKit}>
                            <ChromeEmoji emoji="💾" size={16} className="profile-password-security__icon" />
                            <span className="profile-password-security__label">{exportLbl}</span>
                        </button>
                    ) : null}
                    {onSetupRecovery ? (
                        <button type="button" className={`${btnClass} profile-account-recovery__btn-secondary`} disabled={disabled} onClick={onSetupRecovery}>
                            <ChromeEmoji emoji="🛟" size={16} className="profile-password-security__icon" />
                            <span className="profile-password-security__label">{passphraseLbl}</span>
                        </button>
                    ) : null}
                </div>
            </div>
        </section>
    );
}
