# Search and directory scale

Global discovery uses a **Nostr-native trigram index** — see [NOSTR_DIRECTORY_SEARCH.md](NOSTR_DIRECTORY_SEARCH.md).

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

Optional: signed snapshots on Nostr (`directoryIndex`), torrent/JSON mirror hooks — supplements, not required.

## Lesson search (inside one tree)

Implementation: `search-index-service.js` + Web Worker + `search-index-store.js` (IndexedDB).

- Rebuild in worker; debounced after edits.
- Scales with **open tree** size, not network catalog size.

## Full scale reference

See [GLOBAL_CATALOG_SCALE.md](GLOBAL_CATALOG_SCALE.md).
