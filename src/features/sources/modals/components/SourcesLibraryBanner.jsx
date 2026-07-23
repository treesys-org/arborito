import { hasGdprNetworkConsent } from '../../../../shared/lib/connected-services/index.js';
import { isGuestSyncBannerDismissed } from '../../api/guest-sync-banner-prefs.js';
import { isLocalModeBannerDismissed } from '../../api/local-mode-banner-prefs.js';
import { GuestSyncWelcomeBanner } from './GuestSyncWelcomeBanner.jsx';
import { LocalModeWelcomeBanner } from './LocalModeWelcomeBanner.jsx';

/**
 * Top-of-Biblioteca callout: local-only mode takes precedence over guest sync hint.
 */
export function SourcesLibraryBanner({ ui, showGuestSyncHint, onOpenPrivacy, onOpenProfile, onDismissLocal, onDismissGuest }) {
    const showLocal = !hasGdprNetworkConsent() && !isLocalModeBannerDismissed();
    const showGuest = !showLocal && !!showGuestSyncHint && !isGuestSyncBannerDismissed();

    if (showLocal) {
        return <LocalModeWelcomeBanner ui={ui} onOpenPrivacy={onOpenPrivacy} onDismiss={onDismissLocal} />;
    }
    if (showGuest) {
        return <GuestSyncWelcomeBanner ui={ui} onOpenProfile={onOpenProfile} onDismiss={onDismissGuest} />;
    }
    return null;
}
