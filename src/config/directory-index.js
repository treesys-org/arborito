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
 * Only `arborito/directoryIndex/{recent|top}/v1` snapshots signed by these SEA pubs are accepted.
 *
 * ## Production checklist (release)
 *
 * 1. Generate a SEA keypair dedicated to the aggregator (do not reuse a course author key).
 * 2. Copy the `pub` into this array (exact same string as in the keypair).
 * 3. Same pair as JSON in the `ARBORITO_INDEX_PAIR_JSON` env var for the job/cron
 *    that runs `npm run directory-index:build`.
 * 4. Rebuild Arborito and ship the binary/web; without this step clients may reject snapshots
 *    signed by an “unknown” signer.
 *
 * If the array is **empty**, any cryptographically valid SEA signature accepts the snapshot
 * (convenient in dev; weak on a public network against fake indexes).
 */
export const DIRECTORY_INDEX_TRUSTED_PUBLISHERS = [];
