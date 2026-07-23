import { hasGdprNetworkConsent } from '../../../shared/lib/connected-services/index.js';
import { scheduleIdle } from '../../../shared/lib/yield-to-paint.js';
import { runThrottledBackgroundTask } from '../../../shared/lib/background-task-gate.js';
import { ensureWebTorrentServiceModule } from '../../../core/store-lazy-modules.js';
import { startRotatingWebTorrentSeeder } from './webtorrent-seeder-rotate.js';

function shouldSkipAutoSeedForConnection() {
    try {
        const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (conn?.saveData) return true;
        const eff = String(conn?.effectiveType || '');
        if (eff === 'slow-2g' || eff === '2g') return true;
    } catch {
        /* ignore */
    }
    return false;
}

/**
 * Start seeding WebTorrent buckets for the active tree when metadata is present.
 * Runs automatically after a successful curriculum load (community read path).
 * Skips when seeder already running, WebTorrent unavailable, or save-data / 2G.
 * @param {import('../../../core/store-singleton.js').ArboritoStore} store
 */
export async function maybeAutoStartWebTorrentSeeder(store) {
    if (!store || !hasGdprNetworkConsent()) return false;
    if (store.state.webtorrentSeeder?.running) return true;
    try {
        await ensureWebTorrentServiceModule();
    } catch (e) {
        console.warn('[Arborito] WebTorrent module load failed', e);
        return false;
    }
    if (!store.webtorrent?.available?.()) return false;
    if (shouldSkipAutoSeedForConnection()) return false;

    const wt = store.state.rawGraphData?.meta?.webtorrent;
    if (!wt || typeof wt !== 'object' || wt.mode !== 'buckets-v1') return false;

    try {
        return await startRotatingWebTorrentSeeder(store);
    } catch (e) {
        console.warn('[Arborito] auto WebTorrent seeder', e);
        return false;
    }
}

/** Defer auto-seed so first paint and lesson open stay smooth. */
export function scheduleAutoWebTorrentSeeder(store) {
    if (!store || !hasGdprNetworkConsent()) return;
    const key = `webtorrent-seed:${store.state.activeSource?.id || 'tree'}`;
    scheduleIdle(() => {
        void runThrottledBackgroundTask(
            key,
            () => maybeAutoStartWebTorrentSeeder(store),
            { oncePerSession: true, minIntervalMs: 15000 }
        );
    }, 5000);
}
