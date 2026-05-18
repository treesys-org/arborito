# Directory index aggregator (Nostr)

Arborito runs **mostly in the browser** without your own app server. Global discovery still uses **Nostr relays**; this document describes the **optional Node job** that writes capped, signed **index snapshots** so clients can load a stable slice of trees before falling back to a partial directory crawl.

## What gets written

| Path | Purpose |
|------|---------|
| `arborito/directoryBump/{ownerPub}/{universeId}` | Written by the **author client** when publishing/republishing directory meta (`directory_bump_v1`). Gives “recent” signal without waiting for the aggregator. |
| `arborito/directoryIndex/recent/v1` | Snapshot of up to `DIRECTORY_INDEX_SNAPSHOT_CAP` trees, ordered by activity (meta `updatedAt` and bumps). |
| `arborito/directoryIndex/top/v1` | Snapshot ordered by a simple popularity score (votes + rough 7-day usage), same cap. |

Clients read snapshots first in `NostrUniverseService.listGlobalTreeDirectoryEntriesOnce` (see `src/services/nostr-universe.js`).

## Production checklist

1. **Aggregator SEA pair** — Generate a dedicated keypair for the indexer (not an author course key).
2. **`src/config/directory-index.js`** — Set `DIRECTORY_INDEX_TRUSTED_PUBLISHERS` to the aggregator’s **`pub`** string (exact match). Rebuild the app you ship.
3. **Environment on the job host** — Same pair as JSON for signing:
   - `ARBORITO_INDEX_PAIR_JSON='{"pub":"...","priv":"..."}'`
   - `ARBORITO_INDEX_PEERS='wss://relay1.example/nostr,wss://relay2.example/nostr'` (at least one relay)
4. **Schedule** — Run every 5–15 minutes (cron, systemd timer, or CI on a schedule). Example cron:

```cron
*/10 * * * * cd /path/to/arborito && ARBORITO_INDEX_PEERS="wss://relay.example/nostr" ARBORITO_INDEX_PAIR_JSON='{"pub":"…","priv":"…"}' npm run directory-index:build >> /var/log/arborito-index.log 2>&1
```

5. **Exit codes** (script `scripts/directory-index-aggregator.mjs`):
   - `0` — Snapshots written.
   - `1` — Bad arguments, missing pair, missing peers, or failed to load Nostr.
   - `2` — No directory metadata collected (check relays / network / timing).
   - `3` — Failed to write one or both snapshots.

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
3. Open **Trees / Sources**, scope **Internet** or **All**, search by title — the tree should appear even if raw directory crawl is thin.
4. In Nostr tools, confirm nodes under `arborito/directoryIndex/recent/v1` and `top/v1` update `updatedAt` after each run.

## “Premiere” expectations (capacity)

- **App**: still **local-first + P2P**; there is no single Arborito datacenter that defines “max users”.
- **This index**: caps at `DIRECTORY_INDEX_SNAPSHOT_CAP` (800) entries **per snapshot**; it **stabilizes visibility** for that window, not unlimited global search.
- **Heavy read traffic** for course bytes is a separate concern (WebTorrent buckets, seeders); see `docs/MILLIONS_SCALE_ARCHITECTURE.md`.

For Wikipedia-scale **directory queries**, you would still add a dedicated HTTP search service later; the Nostr snapshots are a practical middle step.
