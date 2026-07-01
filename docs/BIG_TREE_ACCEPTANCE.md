# Acceptance: big tree (manual QA)

Template for the manual validation **before tagging a public version**, once you have a reference course or fixture (decide on N nodes / M MB). Arborito has no production deployment to regress against — the goal here is to know that the **first** public version performs reasonably.

## Suggested measurements

1. **First visit (HTTP source with `data/`):** time until the graph is usable; size of the first `fetch` of `data.json` (compare against a fixed target or a reference commit).
2. **Nostr:** time until the loading message resolves or the tree renders for the first time; perceived sync size (DevTools → Network).
3. **Search:** time to reach the `ready` state (banner disappears) and a query returning expected results.
4. **Second visit:** open the same HTTP lesson again — it must be served from **IndexedDB** ([`lesson-content-cache.js`](../src/features/learning/api/lesson-content-cache.js)) after the first load.
5. **Memory:** a quick check in DevTools → Memory (no automation here).

Record the result and the Arborito version/commit in the ticket or release notes.
