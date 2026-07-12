# Search and directory scale

Global discovery uses a **Nostr-native trigram index**: see [NOSTR_DIRECTORY_SEARCH.md](NOSTR_DIRECTORY_SEARCH.md).

## Two different searches

| Search | What it indexes | Scales to millions? |
|--------|-----------------|---------------------|
| **Lesson search** (in a loaded tree) | Nodes + lesson bodies of the **active** course | **Per tree:** yes (worker + IndexedDB). Not global. |
| **Sources / directory** (Internet) | Metadata rows on Nostr (`tree_directory_v2` + `#t` tags) | **Global:** yes for publish volume; **per query** bounded by relay limits (~800 hits per `#t`). Intersection + substring refines results. |

## Sources directory (global)

Implementation:

- **Publish:** `directory.js` → `t` tags from [`directory-trigram-index.js`](../src/features/nostr/api/directory-trigram-index.js)
- **Query:** `searchGlobalDirectoryByTrigrams` → relay `#t` filter (on demand)
- **Merge:** `sources-global-directory-mixin.js`
- **Caps:** `DIRECTORY_CLIENT_FETCH_LIMIT` / `SOURCES_UNIFIED_DISPLAY_CAP` = 160 UI rows

Optional supplements (not required for launch):

- **Signed snapshots on Nostr** (`directoryIndex`): pre-aggregated `recent`/`top` browse.
  **Fail-closed**: clients ignore snapshots unless the aggregator pub is configured
  (`DIRECTORY_INDEX_TRUSTED_PUBLISHERS` or `window.ARBORITO_DIRECTORY_INDEX_PUBLISHERS`).
  Generate the key with `npm run directory-index:keygen`.
- **Torrent/JSON mirror hooks**: static copy of the browse list.
- **Static trigram search shards**: the search tier for catalogs beyond relay `#t`
  query limits. The aggregator (`ARBORITO_INDEX_SEARCH_DIR`) writes one JSON file per
  trigram; host the folder anywhere static (GitHub Pages / CDN, scales to millions of
  rows with no servers) and set `window.ARBORITO_GLOBAL_DIRECTORY_SEARCH_URL`. The host
  is untrusted: every row ships with its signed Nostr event and the client re-verifies
  signature + PoW per row (`directory-search-http.js`), so a hostile host can omit rows
  but never inject or tamper.

## Lesson search (inside one tree)

Implementation: `search-index-service.js` + Web Worker + `search-index-store.js` (IndexedDB).

- Rebuild in worker; debounced after edits (about 650 ms).
- Scales with **open tree** size, not network catalog size.
- Queries need at least **2 characters** (1 character uses a slower broad scan; desktop debounce 500 ms).
- Search uses **all curriculum languages** in the loaded tree, not only the app UI language.
- An **in-memory graph walk** runs on every query and merges with the IndexedDB index (works even before the index finishes building).
- Words of **2+ characters** are indexed; node titles are always indexed by their first two cleaned characters.
- Lesson body text is indexed up to 12,000 characters per node.
- For `branch://`, `nostr:`, and `indexeddb:` sources, results come from the local IndexedDB overlay (no HTTP shards until publish).

## Product tours

| Tour | Trigger | Storage key |
|------|---------|-------------|
| Shell (study) | First tree load | `arborito-ui-tour-done` |
| Sources picker | Boot without a tree | `arborito-ui-tour-sources-picker-v1-done` |
| Construction | Enter construction mode | `arborito-ui-tour-done-construction` |
| Lesson edit | Open a lesson in construction | `arborito-ui-tour-done-lesson-edit` |

Restart any tour from **Sage → Tour** (construction) or clear the matching `localStorage` key.

Step definitions: `locales/en/tour.json`. DOM anchors use `data-arbor-tour` attributes.

## Full scale reference

See [GLOBAL_CATALOG_SCALE.md](GLOBAL_CATALOG_SCALE.md).
