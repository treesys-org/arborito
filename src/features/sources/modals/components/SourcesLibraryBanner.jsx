import { hasGdprNetworkConsent } from '../../../../shared/lib/connected-services/index.js';
import { isLocalModeBannerDismissed } from '../../api/local-mode-banner-prefs.js';
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
 * Top-of-Biblioteca callout: local-only mode only.
 * Guest sync upsell moved to post-progress offer + Profile spotlight (not Bosque).
 */
export function SourcesLibraryBanner({ ui, onOpenPrivacy, onDismissLocal }) {
    const { activeSource } = useSources();
    if (isActiveArboritoDemo(activeSource)) return null;

    const showLocal = !hasGdprNetworkConsent() && !isLocalModeBannerDismissed();
    if (showLocal) {
        return <LocalModeWelcomeBanner ui={ui} onOpenPrivacy={onOpenPrivacy} onDismiss={onDismissLocal} />;
    }
    return null;
}
