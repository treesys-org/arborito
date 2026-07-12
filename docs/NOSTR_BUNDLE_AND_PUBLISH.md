# Nostr publishing: format v2 (chunked)

**Relays (`wss://`):** whoever packages the app decides the default list and the overrides; see [`NOSTR_RELAYS_CONFIGURATION.md`](NOSTR_RELAYS_CONFIGURATION.md).

Arborito **does not** keep readers for old monolithic bundles. If `bundle.meta.nostrBundleFormat !== 2`, the load fails with a message asking to **republish** with the current app.

## Scale (millions of users)

This spec explains the **format** (how data is published and loaded). For the **why** of the at-scale design (Nostr as control plane + WebTorrent as data plane, lazy loading, buckets, forum v3), see:

- [`docs/MILLIONS_SCALE_ARCHITECTURE.md`](MILLIONS_SCALE_ARCHITECTURE.md)

## What goes where

| Piece | Where it lives | When it's loaded |
|-------|----------------|------------------|
| Metadata + "index" tree (without lesson bodies) | `…bundle` | First `once` of the bundle |
| Lesson / exam bodies | `…chunks.lessons.{key}` | When the lesson is opened (`loadNostrLessonChunk`) |
| Version graphs (`releaseSnapshots`) | `…chunks.snapshots.{snap__id}` | On demand (`materializeNetworkReleaseSnapshot`) |
| Search (nodes + lesson-body snippet, ~12k chars/node) | `…chunks.search` `{ version, entries }` | After loading the bundle: local IndexedDB index (`loadNostrSearchPack` → worker) |
| Forum snapshot at publish time | `…chunks.forum.meta`, `threads`, `modlog`, `msg0`…`msgN` (chunked lists) | When the forum modal opens: `loadNostrForumPack` (lazy; ~12s per node) |
| Live forum (P2P) | `…forum.threads`, `…forum.messages`, signed deletions, etc. | Hydrated incrementally per place/thread when the forum modal opens (`hydrateTreeForumIfNeeded`) |
| Student progress | `…progress.users.{userPub}` | `loadNetworkProgressIntoUserStore` (encrypted; pre-existing) |

The forum **does not** go inside the `bundle` JSON (empty stub). The published history lives in **`chunks.forum.*`** in pieces; the live state stays in **`forum.*`**. Loading the tree **does not** pull the forum: it hydrates when the forum is opened (`hydrateTreeForumIfNeeded` → pack + live + `ForumStore`).

The **`bundle.forum`** and **`bundle.progress`** written in the put are **empty** (stubs). The forum and the aggregated progress are not duplicated inside the bundle JSON.

## Publish (`publishBundle`)

1. [`prepareNostrSplitBundleV2`](../src/features/nostr/api/nostr-bundle-chunks.js) clones the bundle and:
   - removes `searchIndex` and `forum` from `tree` if they were attached;
   - empties `forum` / `progress` in the package;
   - moves lesson bodies into `lessonChunks` (current curriculum + each `releaseSnapshots[…].languages`);
   - moves each full snapshot into `snapshotChunks` and leaves only `{ treeSnapshotRef: 'snap__…' }` in `tree.releaseSnapshots`;
   - sets `meta.nostrBundleFormat = 2` and the chunk counters.
2. `put` of the reduced bundle + one `put` per key in `chunks.lessons` and `chunks.snapshots`.
3. `chunks.forum`: `meta`, `threads`/`modlog` as `{ list }`, messages in `msg0`…`msgN` (~200 messages per node).
4. `chunks.meta`: `{ format: 2, lessonCount, snapshotCount, searchEntryCount, forumMessageParts, updatedAt }`.

## Read

- [`source-manager`](../src/features/sources/api/source-manager.js): requires `nostrBundleFormat === 2`; leaves the `bundle.forum` stub as-is (no forced forum load in the first `once`).
- Forum modal + [`store.hydrateTreeForumIfNeeded`](../src/core/store.js): `loadNostrForumPack` for the published snapshot, lazy live hydration per place/thread, then merge into `ForumStore` (`mergeNostrForumSnapshots` / `mergeNostrForumOverlayLive`). `applyBundlePayload` does **not** replace the local forum when `finalSource.origin === 'nostr'`.
- Lessons: [`GraphLogic.loadNodeContent`](../src/features/tree-graph/api/graph-logic.js) + `treeLazyContent` / `treeContentKey`.
- Snapshots for the versions flow: [`store.materializeNetworkReleaseSnapshot`](../src/core/store.js) (e.g. the versions modal).
