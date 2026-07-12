# Arborito at “millions” scale (Nostr + WebTorrent)

This document summarizes the **current architecture** that lets Arborito handle **very large read traffic** (many learners opening the same course) while keeping the UI simple (share-codes, one link).

It also spells out what is and is not realistic at **very large scale**, depending on whether you mean **read traffic** or **live social traffic**.

## The 2 traffic types (why this split matters)

- **Read-heavy (course bytes)**: tree children JSON, lesson bodies, assets. Many users fetch the same data.
- **Live state (writes)**: share-code resolution, presence, forum posts, moderation, per-user progress.

At scale, those must use different mechanisms.

## Control plane vs data plane

Arborito uses:

- **Nostr (control plane)**:
  - share-codes → resolve to `nostr://pub/universeId`
  - bundle “index” (small JSON) + pointers/metadata
  - relays/peers selection (including recommended relays in share-code)
  - presence and “live” features (progress, forum pointers, moderation)

- **WebTorrent (data plane)**:
  - distributes the heavy files (course bytes) as torrents
  - supports **lazy loading**: only download what the learner opens/expands
  - enables community “seeders” (always-on nodes) to keep courses fast and available

## WebTorrent buckets (incremental publish)

Instead of one huge torrent, Arborito publishes **deterministic buckets**:

- `meta.webtorrent.mode = "buckets-v1"`
- `meta.webtorrent.bucketCount = 64`
- `meta.webtorrent.nodesBuckets[bucketId] = magnet`
- `meta.webtorrent.contentBuckets[bucketId] = magnet`

Bucket choice is deterministic (hash of the requested path), so changes tend to affect only a subset of buckets.

### Lazy loading behavior

- Expanding a branch loads `nodes/<apiPath>.json` from the matching **nodes bucket**.
- Opening a lesson loads `content/<contentPath>` from the matching **content bucket**.
- If WebTorrent is unavailable (or magnets missing), Arborito falls back to HTTP/Nostr paths.

## Search indexing at scale

Arborito search is persisted locally (IndexedDB). For Nostr bundles v2, the app can load a prebuilt search pack from Nostr.

With WebTorrent, Arborito can also use an optional **prebuilt search pack** via torrent:

- `meta.webtorrent.searchMagnet`
- `meta.webtorrent.searchPackPath = "search-pack.json"`

This avoids needing to load every lesson body just to build search.

## Forum at scale (v3: pages + best-effort search)

The forum is designed so old content can “disappear” naturally if nobody seeds it.

- **Nostr stores pointers** (lightweight):
  - threads by place/category
  - per-thread page references by ISO week (`YYYY-Www`)
  - per-week search-pack references

- **WebTorrent stores pages** (heavy):
  - `forum-pages/<threadId>/<YYYY-Www>.json` (messages)
  - `forum-search/<YYYY-Www>.json` (search entries)

### UX behavior

- The UI loads the **current week** by default.
- “Load older” loads earlier weeks (if the pointer exists and the torrent is still seedable).
- Forum search is **best-effort**: it only searches weeks whose search packs still exist (seeded).

## Tree health (what to monitor)

In `Tree Info`, Arborito shows:

- **Nostr online health**:
  - approximate active peers (presence)
  - relay URLs + a simple ping status

- **WebTorrent content health**:
  - bucket count
  - approximate peers (sampled)
  - optional “Seeder mode” status

## Example capacity (numbers with explicit assumptions)

Assume:

- Course bytes per learner (nodes + lesson bodies + assets) ≈ **50 MB**
- Learners opening the course in a day: **1,000,000**

Total read traffic demanded:

\[
50\text{ MB} \times 1{,}000{,}000 \approx 50\text{ TB/day}
\]

### If you try to serve that via Nostr relays only

Most of that 50 TB/day concentrates into a small number of relays. That is expensive and fragile.

### If WebTorrent supplies course bytes

If the network achieves, on average, **80% P2P** and **20% seeder/bootstrap**:

\[
50\text{ TB/day} \times 0.20 = 10\text{ TB/day}
\]

So community seeders collectively would need to provide ~10 TB/day, and the remaining ~40 TB/day is peer-to-peer.

This is the core reason the Nostr+WebTorrent split makes “millions of readers” feasible.

## Very large scale: what is realistic

- **Millions reading the same course**: realistic with WebTorrent buckets + some always-on seeders.
- **Millions doing live social in the same course at once**: not realistic “for free” in any P2P system.
  - It requires rate limits, moderation, and still depends on always-on nodes (Nostr relays and/or other infra).

In other words: WebTorrent makes *read scale* tractable; the forum remains the hardest part of *live scale*, even with paging and best-effort retention.

## What is NOT scale-tested (and why)

These are explicit limits, not bugs to fix, but boundaries the architecture relies on:

- **Number of local gardens per profile.** Metadata and JSON live in IndexedDB
  (`arborito_catalog_v1`). Installed network trees (bookmarks) use the same DB.
  Limits are disk quota and RAM when opening a tree, not the ~5–10 MB
  `localStorage` ceiling.
- **Saved bookmarks (`communitySources`).** One row per installed tree in
  `arborito_catalog_v1`, comfortably scales to tens of thousands per device.
- **Sources modal display cap.** `SOURCES_UNIFIED_DISPLAY_CAP = 160` rows
  visible at any time (see `src/features/p2p-webtorrent/api/directory-index-config.js`). The full local +
  saved + directory result is sorted by relevance and **only the top 160 are
  rendered**. With a search query, the relay-side filter narrows the candidate
  pool before this cap kicks in, so even with millions of trees in the global
  directory the modal stays responsive.
- **Global directory index snapshot cap.** 800 entries per signed snapshot
  (`recent` and `top`), see [`PUBLIC_TREE_INDEX.md`](PUBLIC_TREE_INDEX.md) and
  [`DIRECTORY_INDEX_AGGREGATOR.md`](DIRECTORY_INDEX_AGGREGATOR.md). Snapshots
  are **fail-closed**: without a configured trusted publisher they are ignored.
  For **millions of catalog entries** the aggregator also emits **static
  trigram search shards** (`ARBORITO_INDEX_SEARCH_DIR` → host statically →
  `window.ARBORITO_GLOBAL_DIRECTORY_SEARCH_URL`); each shard row is re-verified
  client-side (signature + PoW), so no search server needs to be trusted or
  operated (see [SEARCH_AND_DIRECTORY_SCALE.md](SEARCH_AND_DIRECTORY_SCALE.md)).
- **No client-side virtualization in the modal.** Rendering builds an HTML
  string per row. The 160-row cap keeps that cheap; if a future deployment
  raises the cap, add row-level virtualization (e.g. windowing the inner
  scroll container) to keep keyboard search smooth.

See also [SEARCH_AND_DIRECTORY_SCALE.md](SEARCH_AND_DIRECTORY_SCALE.md) and [USER_DATA_LAYOUT.md](USER_DATA_LAYOUT.md).

## Resilience guarantees (what relay failures cannot do)

A core invariant of this architecture, restated explicitly because it has
historically been easy to violate from new code:

> **Relay errors must never destroy local data.** A flaky relay can prevent
> a *load* or *publish* from completing right now, but it can never remove a
> tree from the local catalog, drop a row from `communitySources`, or wipe the
> `arborito-active-source-meta` pointer that remembers what the user had open.

The pieces that enforce this:

- [`mountCurriculum`](../src/features/sources/api/mount-curriculum.js) snapshots the
  pre-load state and restores it on any network failure. The
  `arborito-active-source-*` pointers are preserved if the *attempted* source
  has an `id`, so a reload retries the same tree once relays come back.
- [`publishTreePublicInteractive`](../src/stores/publishing-publish-revoke-store-actions.js)
  no longer auto-switches the active source to the freshly published
  `nostr://…` and never eagerly removes community bookmarks. The local tree
  stays active, gets a `publishedNetworkUrl` marker, and the user explicitly
  navigates to the public mirror only when they want to.
- The unified sources renderer
  ([`sources-unified-render-mixin.js`](../src/features/sources/modals/sources-unified-render-mixin.js))
  always renders the local row even when `publishedNetworkUrl` is set. The
  published copy gets a "Publicado / Published" pill so users know it is also
  online, but the editable copy is always reachable, even if every relay in
  the user's list is currently blocked by their browser.
- [`NostrUniverseService._installRelayCircuitBreaker`](../src/features/nostr/api/client/index.js)
  mutes a relay that fails on an exponential ladder (30 s → 2 min → 10 min →
  1 h). This is what prevents a Firefox profile blocking one of the EU
  defaults from generating hundreds of reconnect attempts per session.

## Out-of-scope at this scale (today)

- Persistent **offline cache of public bundles**. Loading a `nostr://` tree
  fetches the bundle on demand; there is no IndexedDB mirror that survives
  relay outages. A user who has opened a public tree once cannot reopen it
  later if every relay is blocked. (The mitigation: the user can *fork* it
  into their local garden via `offerLocalCopyFromNetworkTreeForEditing`, and
  then they have a real copy.)
- A **global search across millions of trees**. The directory snapshot
  (≤800 entries, signed) plus relay-side filtering covers thousands, not
  millions. A dedicated HTTP search tier is required for planet-scale catalog
  browse (see [SEARCH_AND_DIRECTORY_SCALE.md](SEARCH_AND_DIRECTORY_SCALE.md)).
- **Real-time presence for very large audiences**. Presence pings ride on
  Nostr relays; they are best-effort and rate-limited.

