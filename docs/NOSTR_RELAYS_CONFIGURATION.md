# Nostr relays configuration (deployment and development)

This guide is for **whoever packages or hosts** Arborito (it does **not** replace the privacy text the user sees in the app; that text lives in the language files under `locales/*.json`).

## What the client does

For public `nostr://` trees, the browser opens **secure WebSocket** (`wss://`) connections to one or more Nostr **relays**. Curriculum metadata, content chunks, forum data, and the rest flow through them as described in [`NOSTR_BUNDLE_AND_PUBLISH.md`](NOSTR_BUNDLE_AND_PUBLISH.md).

**Stock build:** `DEFAULT_NOSTR_RELAYS` is **empty**: no implicit connections until the user accepts the network in onboarding or configures relays in **Privacy & data**.

**Suggested bundle:** `SUGGESTED_NOSTR_RELAYS` in [`src/features/nostr/api/nostr-relays-runtime.js`](../src/features/nostr/api/nostr-relays-runtime.js) is offered in onboarding (one-click accept) and via “Restore recommended bundle” in Privacy & data. Mixed EU + US operators for availability; disclosed when the user opts in.

| Relay | Jurisdiction | Notes |
|-------|--------------|-------|
| `wss://relay.tchncs.de` | Germany (EU) | strfry-based community relay |
| `wss://nostr.einundzwanzig.space` | Germany (EU) | einundzwanzig (21) community |
| `wss://purplepag.es` | Multi-region | Profile-specialised relay |
| `wss://nos.lol` | United States | High-uptime general relay |
| `wss://relay.primal.net` | United States | High availability |

When loading a course by share code or `nostr://` URL, the client **merges** the publisher’s `recommendedRelays` with the user’s configured set (union, deduplicated) so teachers and learners are more likely to read the same bundle.

## How relay URLs are resolved (priority order)

1. **`localStorage`** key `arborito-nostr-relays-v1`: JSON array of `wss://…` strings set when the user accepts onboarding or changes relays in Privacy & data.
2. **`window.ARBORITO_NOSTR_RELAYS`**: deploy-time override in `index.html` (typical for schools / self-hosted).
3. Otherwise **no relays** until the user opts in (no silent fallback in `core.js`).

Helpers: `loadUserNostrRelays`, `persistUserNostrRelays`, `mergeNostrRelayUrls`, `applyMergedRelaysToService` in `nostr-relays-runtime.js`.

**Relay backfill:** if network consent is on but the relay list is empty, `SUGGESTED_NOSTR_RELAYS` is written once (`arborito-relays-backfill-v1` in `store-connected-services.js`).

## Per-relay circuit breaker (resilience)

`NostrUniverseService._installRelayCircuitBreaker` wraps `pool.ensureRelay` with exponential backoff per URL (15 s → 1 min → 5 min → 10 min). A background prober re-tests cooled-down relays every ~3 minutes.

Reads and writes require **at least one** configured relay. **No network failure destroys local data**: see `mount-curriculum.js` and publish flows.

## EU-only deployments

1. Set `window.ARBORITO_NOSTR_RELAYS` to an EU/UK-only set in `index.html`.
2. Update privacy copy in `locales/*.json` accordingly.
3. Monitor relay uptime and rotate the list as needed.

## Related documentation

- [`DEPLOY_GITHUB_PAGES.md`](DEPLOY_GITHUB_PAGES.md)
- [`NOSTR_STORAGE_NOTES.md`](NOSTR_STORAGE_NOTES.md)
- [`PUBLIC_TREE_INDEX.md`](PUBLIC_TREE_INDEX.md)
- [`DSA_COMPLIANCE.md`](DSA_COMPLIANCE.md)
