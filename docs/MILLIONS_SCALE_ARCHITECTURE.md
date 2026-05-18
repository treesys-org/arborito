# Arborito at “millions” scale (Nostr + WebTorrent)

This document summarizes the **current architecture** that lets Arborito handle **very large read traffic** (many learners opening the same course) while keeping the UI simple (share-codes, one link).

It also spells out what is and is not realistic for “Duolingo-scale”, depending on whether you mean **read traffic** or **live social traffic**.

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

## “Duolingo-scale”: what is realistic

- **Millions reading the same course**: realistic with WebTorrent buckets + some always-on seeders.
- **Millions doing live social in the same course at once**: not realistic “for free” in any P2P system.
  - It requires rate limits, moderation, and still depends on always-on nodes (Nostr relays and/or other infra).

In other words: WebTorrent makes *read scale* tractable; the forum remains the hardest part of *live scale*, even with paging and best-effort retention.

