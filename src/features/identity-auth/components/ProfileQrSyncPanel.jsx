import { useIdentityAuth } from '../hooks/useIdentityAuth.js';
import { useViewportShell } from '../../../shared/ui/breakpoints.js';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';

/** Display sync QR on signed-in device (desktop shows code, mobile scans from elsewhere). */
export function ProfileQrSyncPanel({ qrDataUrl, revealed, onToggle }) {
    const { ui } = useIdentityAuth();
    const { mobile } = useViewportShell();
    const showLbl = ui.qrSyncShowCta || ui.recoveryKeyShowQrCta || 'Sync with QR';
    const hideLbl = ui.qrSyncHideCta || ui.recoveryKeyHideQrCta || 'Hide QR';
    const hint = mobile
        ? ui.qrSyncShowHintMobile ||
          ui.recoveryKeyQrHint ||
          'On your other device choose “Scan sync QR” and point the camera here.'
        : ui.qrSyncShowHintDesktop ||
          'Open Arborito on your phone and scan this code to sign in without typing your password.';

    if (!qrDataUrl) return null;

    return (
        <div className="profile-recovery-qr">
            {revealed ? (
                <div className="profile-recovery-qr__panel">
                    <p className="profile-recovery-qr__title">{showLbl}</p>
                    <img src={qrDataUrl} alt="" className="profile-recovery-qr__img" />
                    <p className="profile-recovery-qr__hint">{hint}</p>
                    <button type="button" className="profile-recovery-qr__toggle" onClick={onToggle}>
                        {hideLbl}
                    </button>
                </div>
            ) : (
                <button type="button" className="profile-password-security__btn" onClick={onToggle}>
                    <ChromeEmoji emoji="📱" size={16} className="profile-password-security__icon" />
                    <span className="profile-password-security__label">{showLbl}</span>
                </button>
            )}
        </div>
    );
}
