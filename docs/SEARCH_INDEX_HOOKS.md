# Incremental search-index hooks

Places where the graph changes and the local index (IndexedDB) must be **rebuilt or updated**:

| Origin | Mechanism |
|--------|-----------|
| Loading / source change | [`DataProcessor.process`](../src/features/tree-graph/api/data-processor.js) → `queueMicrotask(scheduleSearchIndexRebuild)` |
| Construction mode (CRUD, save lesson, etc.) | [`afterConstructionModeMutation`](../src/features/editor/api/construction-sync.js) → `scheduleSearchIndexAfterConstructionMutation` (debounced) |
| `.arborito` import | [`importBranch`](../src/core/user-store/branches.js) → if the archive embeds a `searchIndex`, `hydrateSearchIndexFromArchive` reuses it; otherwise the index is rebuilt via the graph load like any other case |

Graph **fingerprint** deduplication (without `releaseSnapshots`) skips the work if the content didn't change.

After a real change, the service today does a **full rebuild** of the shard map with **debounce** (no per-node patch); see the header of [`search-index-service.js`](../src/features/search/api/search-index-service.js).
