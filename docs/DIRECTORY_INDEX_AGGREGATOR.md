# Directory index aggregator (Nostr)

Arborito runs **mostly in the browser** without your own app server. Global discovery still uses **Nostr relays**; this document describes the **optional Node job** that writes capped, signed **index snapshots** so clients can load a stable slice of trees before falling back to a partial directory crawl.

## What gets written

| Path | Purpose |
|------|---------|
| `arborito/directoryBump/{ownerPub}/{universeId}` | Written by the **author client** when publishing/republishing directory meta (`directory_bump_v1`). Gives “recent” signal without waiting for the aggregator. |
| `arborito/directoryIndex/recent/v1` | Snapshot of up to `DIRECTORY_INDEX_SNAPSHOT_CAP` trees, ordered by activity (meta `updatedAt` and bumps). |
| `arborito/directoryIndex/top/v1` | Snapshot ordered by a simple popularity score (votes + rough 7-day usage), same cap. |

Clients read snapshots first in `NostrUniverseService.listGlobalTreeDirectoryEntriesOnce` (see `src/features/nostr/api/client/index.js`).

## Trust model (fail-closed)

Clients **ignore all snapshots** unless the aggregator's pub is configured, either
baked into `DIRECTORY_INDEX_TRUSTED_PUBLISHERS` at build time, or injected at deploy
time via `window.ARBORITO_DIRECTORY_INDEX_PUBLISHERS = ['<hex pub>']` in `index.html`
(no rebuild). An unconfigured deploy cannot be fed a fake index; browse falls back to
relay trigram search + the bounded live crawl, which verify every row individually.

## Production checklist

1. **Aggregator keypair**: `npm run directory-index:keygen` prints a fresh pair and
   the exact config lines (never reuse a course author key).
2. **Client trust**: paste the `pub` into `DIRECTORY_INDEX_TRUSTED_PUBLISHERS`
   (rebuild) or set `window.ARBORITO_DIRECTORY_INDEX_PUBLISHERS` in the deployed HTML.
3. **Environment on the job host**: Same pair as JSON for signing:
   - `ARBORITO_INDEX_PAIR_JSON='{"pub":"...","priv":"..."}'`
   - `ARBORITO_INDEX_PEERS='wss://relay1.example/nostr,wss://relay2.example/nostr'` (at least one relay)
   - `ARBORITO_INDEX_MAX_EVENTS` (optional, default 20000), cursor-paginated crawl
     budget; the job walks relay pages backwards with `until` cursors, so it can see
     far more of the catalog than one relay-capped query.
   - `ARBORITO_INDEX_SEARCH_DIR` (optional), also write **static trigram search
     shards** (one JSON per trigram, rows carry their signed events). Host that folder
     on any static host/CDN and set `window.ARBORITO_GLOBAL_DIRECTORY_SEARCH_URL` in
     the deploy; this is the serverless search tier for very large catalogs.
4. **Schedule**: Run every 5–15 minutes (cron, systemd timer, or CI on a schedule). Example cron:

```cron
*/10 * * * * cd /path/to/arborito && ARBORITO_INDEX_PEERS="wss://relay.example/nostr" ARBORITO_INDEX_PAIR_JSON='{"pub":"…","priv":"…"}' ARBORITO_INDEX_SEARCH_DIR=/srv/www/search npm run directory-index:build >> /var/log/arborito-index.log 2>&1
```

5. **Exit codes** (script `scripts/directory-index-aggregator.mjs`):
   - `0`, Snapshots written.
   - `1`, Bad arguments, missing pair, missing peers, or failed to load Nostr.
   - `2`, No directory metadata collected (check relays / network / timing).
   - `3`, Failed to write one or both snapshots.

## Install for the job host

```bash
cd arborito
npm ci
# Uses Node + `nostr-tools` (see `scripts/directory-index-aggregator.mjs`).
npm run directory-index:build
```

## Manual smoke test

1. Publish a test tree from Arborito (author flow) so `directory` meta and `directoryBump` exist.
2. Run the aggregator once with valid `ARBORITO_INDEX_PEERS` and `ARBORITO_INDEX_PAIR_JSON`.
3. Open **Trees / Sources**, scope **Internet** or **All**, search by title, the tree should appear even if raw directory crawl is thin.
4. In Nostr tools, confirm nodes under `arborito/directoryIndex/recent/v1` and `top/v1` update `updatedAt` after each run.

## “Premiere” expectations (capacity)

- **App**: still **local-first + P2P**; there is no single Arborito datacenter that defines “max users”.
- **This index**: caps at `DIRECTORY_INDEX_SNAPSHOT_CAP` (800) entries **per snapshot**; it **stabilizes visibility** for that window, not unlimited global search.
- **Heavy read traffic** for course bytes is a separate concern (WebTorrent buckets, seeders); see `docs/MILLIONS_SCALE_ARCHITECTURE.md`.

For a fresher **recent/top** browse window (optional, 800 rows per slot), run **`npm run directory-index:build`** on a schedule. **Global search** does not depend on it, see [NOSTR_DIRECTORY_SEARCH.md](NOSTR_DIRECTORY_SEARCH.md).
