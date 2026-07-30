import { useIdentityAuth } from '../hooks/useIdentityAuth.js';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';

export function ProfileToolsFooter({
    signedIn,
    embedded: _embedded,
    onOpenBackup,
    onOpenPrivacy,
    onLocalWipe: _onLocalWipe,
    inline = false,
}) {
    const { ui } = useIdentityAuth();

    const btnClass = inline
        ? 'profile-action-btn profile-action-btn--footer profile-action-btn--inline'
        : 'profile-action-btn profile-action-btn--footer';

    /* Always use the legal tool grid so rows have gap (never stacked flush). */
    const rootClass = inline
        ? 'profile-tools-inline profile-footer-group profile-footer-group--legal'
        : 'arborito-modal-footer arborito-modal-footer--blend profile-tools-footer profile-footer-group profile-footer-group--legal';

    /* Guest register/login: privacy only — backup/wipe compete with the account form. */
    if (!signedIn) {
        return (
            <div className={rootClass}>
                <button type="button" id="btn-open-privacy" className={btnClass} onClick={onOpenPrivacy}>
                    <span className="profile-action-btn__icon" aria-hidden="true">
                        <ChromeEmoji emoji="📄" size={16} />
                    </span>
                    <span className="profile-action-btn__text">
                        {ui.profilePrivacyAndDataButton || ui.syncPrivacyNote || 'Privacy'}
                    </span>
                </button>
            </div>
        );
    }

    return (
        <div className={rootClass}>
            <button type="button" id="btn-open-backup" className={btnClass} onClick={onOpenBackup}>
                <span className="profile-action-btn__icon" aria-hidden="true">
                    <ChromeEmoji emoji="💾" size={16} />
                </span>
                <span className="profile-action-btn__text">
                    {ui.profileBackupGroupLabel || ui.backpackTitle || 'Backup'}
                </span>
            </button>
            <button type="button" id="btn-open-privacy" className={btnClass} onClick={onOpenPrivacy}>
                <span className="profile-action-btn__icon" aria-hidden="true">
                    <ChromeEmoji emoji="📄" size={16} />
                </span>
                <span className="profile-action-btn__text">
                    {ui.profilePrivacyAndDataButton || ui.syncPrivacyNote || 'Privacy'}
                </span>
            </button>
        </div>
    );
}
