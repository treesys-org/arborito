import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';

/** Password / QR switch for Profile sign-in. Sync key file lives under forgot-password links. */
export function ProfileLoginMethodTabs({ ui, value, onChange, disabled = false }) {
    const aria = ui.loginMethodTabsAria || ui.syncLoginModeLabel || 'Sign-in method';
    const tabs = [
        {
            id: 'password',
            label: ui.loginPasswordLabel || 'Password',
            emoji: '🔑',
        },
        {
            id: 'qr',
            label: ui.loginMethodQrShort || ui.qrSyncScanCta || 'QR',
            emoji: '📷',
        },
    ];

    return (
        <div className="profile-login-method-tabs profile-login-method-tabs--dual" role="tablist" aria-label={aria}>
            {tabs.map((tab) => {
                const active = value === tab.id;
                return (
                    <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={active ? 'true' : 'false'}
                        className={`profile-login-method-tabs__btn${active ? ' is-active' : ''}`}
                        disabled={disabled}
                        onClick={() => onChange(tab.id)}
                    >
                        <ChromeEmoji emoji={tab.emoji} size={16} className="profile-login-method-tabs__ic" />
                        <span>{tab.label}</span>
                    </button>
                );
            })}
        </div>
    );
}
