import { useIdentityAuth } from '../hooks/useIdentityAuth.js';
import { ChromeEmoji } from '../../../app/components/ChromeEmoji.jsx';

/** Guest sign-in: replaces avatar when network is off — large warning + enable-online CTA. */
export function ProfileLimitedModeHero() {
    const { ui, setModal } = useIdentityAuth();
    const title = ui.profileLimitedModeTitle || ui.profileOfflineNetworkTitle || 'Device-only mode';
    const body =
        ui.profileLimitedModeBody ||
        ui.profileOfflineNetworkBody ||
        'You are in limited mode: no share codes, sync, forums, or online catalog.';
    const cta = ui.profileLimitedModeEnable || ui.profileOfflineNetworkEnable || 'Open Privacy & data';

    return (
        <div className="profile-limited-mode-hero" role="status">
            <span className="profile-limited-mode-hero__icon" aria-hidden="true">
                <ChromeEmoji emoji="⚠️" size={56} />
            </span>
            <p className="profile-limited-mode-hero__title">{title}</p>
            <p className="profile-limited-mode-hero__body">{body}</p>
            <button
                type="button"
                className="profile-limited-mode-hero__cta"
                onClick={() => setModal({ type: 'privacy', fromProfile: true })}
            >
                {cta}
            </button>
        </div>
    );
}
