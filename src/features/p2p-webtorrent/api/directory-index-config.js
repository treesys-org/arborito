/**
 * Global Nostr indexes (`directoryIndex`) + bumps (`directoryBump`).
 * Caps and client limits for Courses / Discover; see `docs/NETWORK.md`.
 */

/** Max rows per snapshot (`recent` / `top`) written by the aggregator and read by clients. */
export const DIRECTORY_INDEX_SNAPSHOT_CAP = 800;

/**
 * First Discover fetch size, and how many more rows each “Show more” catalog
 * bump requests. The list UI pages locally (12/24); this is the network page.
 */
export const DIRECTORY_CLIENT_FETCH_PAGE = 48;

/**
 * Absolute ceiling for progressive Discover fetches (Show more → bump limit).
 * Below this, every “Show more” widens the client crawl/search instead of a
 * dead “list shortened” wall.
 */
export const DIRECTORY_CLIENT_FETCH_MAX = 2000;

/**
 * @deprecated Prefer DIRECTORY_CLIENT_FETCH_PAGE + progressive bumps up to MAX.
 * Kept as the initial/default request size alias used by a few call sites.
 */
export const DIRECTORY_CLIENT_FETCH_LIMIT = DIRECTORY_CLIENT_FETCH_PAGE;

/**
 * Live Discover crawl budget (events, not unique courses).
 * Kind 30100 is replaceable: each publish/delist/republish is a new event, so a
 * single `limit:200` window is mostly churn and can drop live rows that are only
 * days old. The client pages backwards with `until` up to this many events.
 * Do not raise this into “scan the whole network” territory — deep reach is
 * search + share code + optional snapshots (`docs/NETWORK.md`).
 */
export const DIRECTORY_CLIENT_CRAWL_MAX_EVENTS = 3000;

/** Per-REQ page size while paging the live directory crawl. */
export const DIRECTORY_CLIENT_CRAWL_PAGE_SIZE = 200;

/**
 * Do not page the live crawl older than this (seconds). Older listings remain
 * reachable via trigram `#t` search and optional HTTP/torrent mirrors.
 */
export const DIRECTORY_CLIENT_CRAWL_MAX_AGE_SEC = 180 * 86400;

/**
 * Max rows read from the optional global index via WebTorrent.
 * Align with progressive Discover max so “load more” is not stuck at the first page.
 */
export const GLOBAL_DIRECTORY_TORRENT_MAX_ENTRIES = DIRECTORY_CLIENT_FETCH_MAX;

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
