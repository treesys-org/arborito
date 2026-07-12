/**
 * Global Nostr indexes (`directoryIndex`) + bumps (`directoryBump`).
 * See `docs/DIRECTORY_INDEX_AGGREGATOR.md`.
 */

/** Max rows per snapshot (`recent` / `top`) written by the aggregator and read by clients. */
export const DIRECTORY_INDEX_SNAPSHOT_CAP = 800;

/**
 * Shared cap between:
 * - directory request (`listGlobalTreeDirectoryEntriesOnce` with UI `limit`), and
 * - trimming the unified list (local + saved + Internet).
 */
export const DIRECTORY_CLIENT_FETCH_LIMIT = 160;
export const SOURCES_UNIFIED_DISPLAY_CAP = DIRECTORY_CLIENT_FETCH_LIMIT;

/**
 * Max rows read from the optional global index via WebTorrent (aligned with Nostr list cap).
 */
export const GLOBAL_DIRECTORY_TORRENT_MAX_ENTRIES = DIRECTORY_CLIENT_FETCH_LIMIT;

/** Default JSON path inside the global directory torrent (metadata mirror). */
export const GLOBAL_DIRECTORY_TORRENT_DEFAULT_PATH = 'global-directory.json';

/**
 * Only directory-index snapshots signed by these Nostr pubs (hex) are accepted.
 *
 * ## Production checklist (release)
 *
 * 1. `npm run directory-index:keygen`, generates a dedicated aggregator keypair
 *    (do not reuse a course author key) and prints the exact lines to paste.
 * 2. Copy the `pub` into this array (or set `window.ARBORITO_DIRECTORY_INDEX_PUBLISHERS`
 *    in the deploy's `index.html`, no rebuild needed).
 * 3. Same pair as JSON in the `ARBORITO_INDEX_PAIR_JSON` env var for the job/cron
 *    that runs `npm run directory-index:build`.
 *
 * **Fail-closed:** with no publisher configured anywhere, snapshots are IGNORED
 * (never trusted). Browse still works via relay trigram search + the bounded
 * live crawl; only the pre-aggregated "recent/top" shortcut is skipped. This
 * means an unconfigured deploy cannot be fed a fake index by an attacker.
 */
export const DIRECTORY_INDEX_TRUSTED_PUBLISHERS = [];

/**
 * Effective trusted-publisher list: build-time constant + optional runtime
 * override (`window.ARBORITO_DIRECTORY_INDEX_PUBLISHERS = ['<hex pub>', …]`)
 * so operators can rotate the aggregator key without rebuilding the app.
 * @returns {string[]}
 */
export function getConfiguredDirectoryIndexPublishers() {
    const out = new Set(DIRECTORY_INDEX_TRUSTED_PUBLISHERS.map((p) => String(p || '').trim()).filter(Boolean));
    try {
        const w = globalThis.ARBORITO_DIRECTORY_INDEX_PUBLISHERS;
        if (Array.isArray(w)) {
            for (const p of w) {
                const s = String(p || '').trim().toLowerCase();
                if (/^[0-9a-f]{64}$/.test(s)) out.add(s);
            }
        }
    } catch {
        /* no window override */
    }
    return Array.from(out);
}
