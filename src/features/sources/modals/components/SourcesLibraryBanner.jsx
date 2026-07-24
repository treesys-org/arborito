import { hasGdprNetworkConsent } from '../../../../shared/lib/connected-services/index.js';
import { isGuestSyncBannerDismissed } from '../../api/guest-sync-banner-prefs.js';
import { isLocalModeBannerDismissed } from '../../api/local-mode-banner-prefs.js';
import { GuestSyncWelcomeBanner } from './GuestSyncWelcomeBanner.jsx';
import { LocalModeWelcomeBanner } from './LocalModeWelcomeBanner.jsx';
import { getArboritoStore } from '../../../../core/store-singleton.js';
import { isArboritoDemoTree } from '../../../publishing/api/demo-tree-guard.js';

/**
 * Top-of-Biblioteca callout: local-only mode takes precedence over guest sync hint.
 * Arborito demo never shows sync upsells in Bosque — it syncs like online when signed in.
 */
export function SourcesLibraryBanner({ ui, showGuestSyncHint, onOpenPrivacy, onOpenProfile, onDismissLocal, onDismissGuest }) {
    const store = getArboritoStore();
    if (isArboritoDemoTree(store)) return null;

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
