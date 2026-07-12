# Global directory search: Nostr-native index

Arborito is a **static site** at [arborito.org](https://arborito.org). Global discovery is **native Nostr**: no search server, no background relay subscribe (CPU-safe).

## How it works

1. **Publish**: `KIND_TREE_DIRECTORY` with Nostr **`t` tags** (trigrams of title, description, author).
2. **Search**: User types ≥ 3 chars in Sources → on-demand relay `#t` query (cached 45s, max 200 events).
3. **Browse**: Optional signed Nostr snapshots (`recent` / `top`) + small crawl fallback.

```text
Author publishes  →  event 30100 + tags t:alg,lge,…
User searches     →  REQ kinds:30100 #t:alg  (on demand only)
```

## Code

| Piece | File |
|-------|------|
| Trigram helpers | `src/features/nostr/api/directory-trigram-index.js` |
| Publish + `#t` search | `src/features/nostr/api/client/directory.js` |
| Sources merge | `src/features/sources/modals/sources-global-directory-mixin.js` |

## CPU notes

- **No** long-lived Nostr SUB at boot (removed, it flooded relays and verified thousands of events).
- Bundle-header filter is **cached 10 min** (one relay query, not per keystroke).
- Trigram search: **1–2 sequential** relay queries, not 3×800 parallel.

See [GLOBAL_CATALOG_SCALE.md](GLOBAL_CATALOG_SCALE.md).
