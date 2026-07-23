import { SwitchRow } from '../../../shared/ui/SwitchRow.jsx';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';

/**
 * Optional recovery setup — switch reveals backup / passphrase actions (post-register or Profile).
 */
export function LoginRecoverySetupCard({
    ui,
    enabled,
    onEnabledChange,
    disabled = false,
    onDownloadBackup,
    onSetupRecovery,
    onForgotPassword,
    showSkip,
    onSkip,
}) {
    const title = ui.loginRecoveryNoticeTitle || "Don't lose access to your account";
    const hint =
        ui.loginRecoveryCardHint ||
        'Export a recovery key file or set a recovery passphrase if you forget your password.';
    const switchLabel = ui.loginRecoverySetupSwitchLabel || 'Back up this account';
    const switchHint =
        ui.loginRecoverySetupSwitchHint ||
        'Optional. Export a sync key or save a recovery passphrase.';
    const exportLbl = ui.syncKeyExportCta || 'Export recovery key';
    const recoveryLbl = ui.profileAccountRecoveryPassphraseCta || ui.recoverySetupCta || 'Recovery passphrase';
    const recoveryTitle = ui.profileAccountRecoveryTitle || 'Account recovery';
    const forgotLbl = ui.loginForgotPassword || 'Forgot your password?';
    const skipLbl = ui.loginRecoverySkipCta || 'Continue without backup';

    return (
        <div className="login-recovery-card" role="region" aria-label={title}>
            <div className="login-recovery-card__banner">
                <span className="login-recovery-card__icon" aria-hidden="true">
                    ⚠
                </span>
                <div className="login-recovery-card__copy">
                    <p className="login-recovery-card__title">{title}</p>
                    <p className="login-recovery-card__hint">{hint}</p>
                </div>
            </div>
            <SwitchRow
                id="login-recovery-setup-switch"
                className="login-recovery-card__switch"
                label={switchLabel}
                hint={switchHint}
                checked={enabled}
                disabled={disabled}
                onChange={onEnabledChange}
                onAria={ui.loginRecoverySetupSwitchOnAria || 'Enable recovery setup'}
                offAria={ui.loginRecoverySetupSwitchOffAria || 'Disable recovery setup'}
            />
            {enabled ? (
                <div className="login-recovery-card__actions">
                    <p className="login-recovery-card__section-title">{recoveryTitle}</p>
                    {onDownloadBackup ? (
                        <button
                            type="button"
                            className="arborito-onb-chip arborito-onb-chip--recovery"
                            disabled={disabled}
                            onClick={onDownloadBackup}
                        >
                            <ChromeEmoji emoji="💾" size={16} className="login-recovery-card__chip-ic" />
                            <span>{exportLbl}</span>
                        </button>
                    ) : null}
                    {onSetupRecovery ? (
                        <button
                            type="button"
                            className="arborito-onb-chip arborito-onb-chip--recovery"
                            disabled={disabled}
                            onClick={onSetupRecovery}
                        >
                            <ChromeEmoji emoji="🛟" size={16} className="login-recovery-card__chip-ic" />
                            <span>{recoveryLbl}</span>
                        </button>
                    ) : null}
                    {onForgotPassword ? (
                        <button type="button" className="login-extras__link" disabled={disabled} onClick={onForgotPassword}>
                            {forgotLbl}
                        </button>
                    ) : null}
                </div>
            ) : null}
            {showSkip && onSkip ? (
                <button type="button" className="login-recovery-card__skip" disabled={disabled} onClick={onSkip}>
                    {skipLbl}
                </button>
            ) : null}
        </div>
    );
}
