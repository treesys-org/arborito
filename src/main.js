import './app-entry.js';
import { ensureWebTorrentLoaded } from './features/p2p-webtorrent/boot-webtorrent.js';
import {
    hasGdprNetworkConsent,
    onGdprNetworkConsentGranted
} from './features/privacy-gdpr/gdpr-network-consent.js';

/* WebTorrent (`vendor/webtorrent/webtorrent.min.js`, ~218 KB) is only used by
 * opportunistic code paths (torrent-mirror catalog, optional bundle fetch).
 * Two-stage gate before we even fetch the bundle:
 *   1. GDPR network consent — joining the swarm exposes the IP to trackers /
 *      DHT / peers, so we need an explicit opt-in first. `ensureWebTorrentLoaded`
 *      double-checks this, but skipping the fetch entirely keeps the network
 *      tab clean for auditors who inspect a brand-new visitor.
 *   2. `requestIdleCallback` — every caller already checks
 *      `store.webtorrent.available()` and falls back to the non-torrent path
 *      when it's not loaded, so the fetch can wait until the app shell has
 *      painted. Fallback `setTimeout(1500)` keeps Safari behavior identical.
 */
const scheduleWebTorrentLoad = () => {
    const start = () => {
        ensureWebTorrentLoaded().catch((e) =>
            console.error('[Arborito] WebTorrent deferred load failed', e)
        );
    };
    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(start, { timeout: 4000 });
    } else {
        setTimeout(start, 1500);
    }
};

const armWebTorrentScheduling = () => {
    if (typeof document !== 'undefined' && document.readyState === 'complete') {
        scheduleWebTorrentLoad();
    } else if (typeof window !== 'undefined') {
        window.addEventListener('load', scheduleWebTorrentLoad, { once: true });
    } else {
        scheduleWebTorrentLoad();
    }
};

if (hasGdprNetworkConsent()) {
    armWebTorrentScheduling();
} else {
    onGdprNetworkConsentGranted(() => armWebTorrentScheduling());
}

