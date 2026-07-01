# Nostr relays configuration (deployment and development)

This guide is for **whoever packages or hosts** Arborito (it does **not** replace the privacy text the user sees in the app; that text lives in the language files under `locales/*.json`).

## What the client does

For public `nostr://` trees, the browser opens **secure WebSocket** (`wss://`) connections to one or more Nostr **relays**. Curriculum metadata, content chunks, forum data, and the rest flow through them as described in [`NOSTR_BUNDLE_AND_PUBLISH.md`](NOSTR_BUNDLE_AND_PUBLISH.md).

## Default list (availability-first; mixed EU + US)

Defined in [`src/features/nostr/api/nostr-relays-runtime.js`](../src/features/nostr/api/nostr-relays-runtime.js) (`DEFAULT_NOSTR_RELAYS`). In the current version:

| Relay | Jurisdiction | Notes |
|-------|--------------|-------|
| `wss://relay.tchncs.de` | Germany (EU) | strfry-based community relay. Historically the most stable EU public relay. |
| `wss://nostr.einundzwanzig.space` | Germany (EU) | Run by the einundzwanzig (21) community. |
| `wss://purplepag.es` | Multi-region | Profile-specialised relay (NIP-65 / kind 0/3) with broad reach. |
| `wss://nos.lol` | United States | High-uptime general relay. |
| `wss://relay.primal.net` | United States | Operated by Primal; high availability. |

This list moved away from a strict EU-only stance after the 2025–2026 outages on `relay.nostrich.de`, `free.relayted.de` and `snort.social` repeatedly left users on a single working survivor (the user-facing complaint was "los relays a veces andan y a veces no"). Availability is the primary driver here. The mixed jurisdiction is now disclosed up-front in the user-facing copy (`networkSocialConsentLead`, `privacyNostrRelaysBody`) so people opting into public Nostr features know their IP can reach EU/UK and US providers.

If your deployment targets EU-only audiences and you need to keep traffic away from US infrastructure, override the list via `window.ARBORITO_NOSTR_RELAYS` or `localStorage['arborito-nostr-relays-v1']` (see precedence below) and update the privacy copy accordingly — the logic in `src/features/nostr/api/client/index.js` does not depend on jurisdiction; it only calls whatever URL list you provide.

> Specific URLs can change between versions; don't duplicate them in user-facing legal text. The Privacy tab already describes the set generically ("each relay is run by an independent third party", "the actual list depends on the installation") precisely so that small operator changes between releases don't break the notice.

## How to override the list (priority order)

1. **`localStorage`** at the app origin, key `arborito-nostr-relays-v1`: a JSON value, an array of `wss://…` strings. If present and valid, it **replaces** the default list for that browser and that origin.
2. **`window.ARBORITO_NOSTR_RELAYS`**: array of `wss://…` URLs, assigned **before** the main module resolves relays (for instance in a `<script>` inside [`index.html`](../index.html)). Typical for self-hosted deployments.
3. If none of the above are set, `DEFAULT_NOSTR_RELAYS` from the runtime file is used.

The read-and-normalise logic lives in that same `nostr-relays-runtime.js` module and in [`src/features/nostr/api/client/index.js`](../src/features/nostr/api/client/index.js).

## Per-relay circuit breaker (resilience and network)

So that a downed or browser-blocked relay (Firefox ETP, DNS-over-HTTPS from Mullvad/Quad9, `privacy.resistFingerprinting`, corporate filters, …) does not trigger retry loops or flood the console log, `NostrUniverseService._installRelayCircuitBreaker` wraps `pool.ensureRelay` with exponential backoff **per URL**:

| Consecutive failures | Next attempt allowed after |
|----------------------|----------------------------|
| 1 | 15 s |
| 2 | 1 min |
| 3 | 5 min |
| 4 or more | 10 min |

Any successful connection resets the counter to zero. Reads and writes require **at least one** relay from the set to accept the event; with 5 relays in the default list the system still works even if 3 of them are momentarily blocked in the user's browser. As an extra safety net, when **every** relay is in cooldown at the same time (e.g. brief connectivity drop) the next call clears the breaker so the user gets one fresh attempt instead of an instant "all paused" failure (`_unpauseAllRelaysIfAllCoolingDown`).

In addition, a **background prober** (`_startRelayHealing`) ticks every ~3 minutes and re-tests one cooled-down relay at a time using the raw `ensureRelay` (bypassing the circuit-breaker short-circuit). If the relay answers, its health entry is cleared and the next user-initiated publish/query reaches it again. This addresses the "every so often try sending equally to the other relays in an intelligent way that doesn't hurt performance" requirement: a transient outage no longer means the relay is silenced for the full ladder window — it heals as soon as it's actually back, redundancy is restored without any user action, and the prober runs out-of-band (publish/query latency is unaffected).

Operational consequence: **no network failure destroys local data**. A tree saved in the local catalog or a bookmark in `communitySources` is not deleted because a relay does not answer; relays sync, they do not destroy. That guarantee is implemented by `mountCurriculum` (`src/features/sources/api/mount-curriculum.js`) and `publishTreePublicInteractive` (`src/stores/publishing-publish-revoke-store-actions.js`).

## EU-only deployments

The default list is mixed jurisdiction (see above). If a specific deployment needs to keep all traffic inside EU/UK infrastructure for policy reasons:

1. Set `window.ARBORITO_NOSTR_RELAYS` in your `index.html` to an EU/UK-only set (for example `wss://relay.tchncs.de`, `wss://nostr.einundzwanzig.space`, plus any other operators you've vetted).
2. **Update the privacy text** in `locales/*.json` (`networkSocialConsentLead`, `privacyNostrRelaysBody`) to remove the "mixed EU + US" disclosure since that's no longer true for your build.
3. Be ready to rotate the list: EU public relays go offline more often than the US ones we now include in the default set; an EU-only deployment should monitor uptime and keep the list current.

## Related documentation

- [`DEPLOY_GITHUB_PAGES.md`](DEPLOY_GITHUB_PAGES.md) — static deployment.
- [`NOSTR_STORAGE_NOTES.md`](NOSTR_STORAGE_NOTES.md) — deletion limits on the network.
- [`MILLIONS_SCALE_ARCHITECTURE.md`](MILLIONS_SCALE_ARCHITECTURE.md) — what is and isn't realistic at scale.
- [`PUBLIC_TREE_INDEX.md`](PUBLIC_TREE_INDEX.md) — public directory with GDPR criteria.
- [`README.md`](../README.md) — overview and links into the code.
