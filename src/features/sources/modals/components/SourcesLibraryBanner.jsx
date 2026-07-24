import { hasGdprNetworkConsent } from '../../../../shared/lib/connected-services/index.js';
import { isGuestSyncBannerDismissed } from '../../api/guest-sync-banner-prefs.js';
import { isLocalModeBannerDismissed } from '../../api/local-mode-banner-prefs.js';
import { GuestSyncWelcomeBanner } from './GuestSyncWelcomeBanner.jsx';
import { LocalModeWelcomeBanner } from './LocalModeWelcomeBanner.jsx';
import { useSources } from '../../hooks/useSources.js';
import { isBundledArboritoDemoBranch, DEMO_BRANCH_ID } from '../../../../core/demo/arborito-demo-ids.js';

function isActiveArboritoDemo(activeSource) {
    if (!activeSource) return false;
    if (isBundledArboritoDemoBranch(activeSource)) return true;
    const url = String(activeSource.url || '');
    return url === `branch://${DEMO_BRANCH_ID}` || url.startsWith(`branch://${DEMO_BRANCH_ID}/`);
}

/**
 * Top-of-Biblioteca callout: local-only mode takes precedence over guest sync hint.
 * Arborito demo never shows sync upsells in Bosque — it syncs like online when signed in.
 */
export function SourcesLibraryBanner({ ui, showGuestSyncHint, onOpenPrivacy, onOpenProfile, onDismissLocal, onDismissGuest }) {
    const { activeSource } = useSources();
    if (isActiveArboritoDemo(activeSource)) return null;

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
