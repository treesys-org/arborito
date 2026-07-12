# Global catalog scale: arborito.org (serverless)

The live site is **static** (Vite build → `www/`, hosted at [arborito.org](https://arborito.org)). Scale comes from **Nostr + WebTorrent + client-side stores**, not from a central database.

## Scale table

| Data / feature | Mechanism | Scales to | Notes |
|----------------|-----------|-----------|-------|
| **Course bytes** (lessons, nodes) | WebTorrent buckets + lazy load | Millions of **readers** on same tree | Data plane; see [MILLIONS_SCALE_ARCHITECTURE.md](MILLIONS_SCALE_ARCHITECTURE.md) |
| **Publish tree** | Nostr bundle v2 + directory event | Unlimited publishers over time | Control plane |
| **Global tree search** | Nostr `#t` trigram tags on `30100` + relay REQ | Millions of **indexed rows** on relays; **per-query** result cap | [NOSTR_DIRECTORY_SEARCH.md](NOSTR_DIRECTORY_SEARCH.md) |
| **Search freshness** | Publish updates replaceable directory event | Seconds (relay latency) | On-demand `#t` query only |
| **Recents / local cache** | Nostr snapshots + small crawl | ~800 rows | No background subscribe |
| **Optional recent/top window** | Signed Nostr snapshots (`directory-index:build`) | 800 rows × 2 slots | Nice-to-have browse; not full catalog |
| **Installed trees on device** | IndexedDB `arborito_catalog_v1` | Tens of thousands | Local catalog |
| **Search inside one tree** | Worker + IndexedDB shards | Very large single courses | Not global search |
| **Share code lookup** | Nostr `KIND_TREE_CODE` | Global | Direct `#code` in search box |

## Architecture

```text
                    arborito.org (static JS)
                            │
         ┌──────────────────┼──────────────────┐
         ▼                  ▼                  ▼
   Nostr relays        WebTorrent          IndexedDB
   #t directory        course bytes        local mirror
   publish/search      read scale          + installed trees
```

## What we deliberately do **not** use

- GitHub Actions catalog rebuild
- Static `/catalog/` shard files on the host
- Dedicated search API subdomain
- Central Postgres / Meilisearch for the public app

## Operator optional

`npm run directory-index:build`, publishes **recent/top** snapshots to Nostr for a fresher default list. Authors and search do not depend on it.

See [SEARCH_AND_DIRECTORY_SCALE.md](SEARCH_AND_DIRECTORY_SCALE.md) for worker/index details.
