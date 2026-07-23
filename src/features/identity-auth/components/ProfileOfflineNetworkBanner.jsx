import { useIdentityAuth } from '../hooks/useIdentityAuth.js';
import { hasGdprNetworkConsent } from '../../../shared/lib/connected-services/index.js';
import { Callout } from '../../../shared/ui/Callout.jsx';

/** Shown in Profile when network consent is off — one-tap path to Privacy. */
export function ProfileOfflineNetworkBanner() {
    const { ui, setModal } = useIdentityAuth();
    if (hasGdprNetworkConsent()) return null;

    const title = ui.profileOfflineNetworkTitle || 'Public network off';
    const body =
        ui.profileOfflineNetworkBody ||
        'Share codes, sync, forums, and the online catalog need network consent. Open Privacy & data.';
    const cta = ui.profileOfflineNetworkEnable || 'Open Privacy & data';

    return (
        <Callout tone="amber" layout="stack" extraClass="profile-offline-network-callout not-prose" title={title}>
            <p className="arborito-callout__body text-xs leading-relaxed m-0 mt-2">{body}</p>
            <button
                type="button"
                className="profile-offline-network-callout__cta mt-3"
                onClick={() => setModal({ type: 'privacy' })}
            >
                {cta}
            </button>
        </Callout>
    );
}
