# Network stack & security (consolidated map)

Arborito talks to the outside world through **a small set of entry points**. Feature code must use these, not ad-hoc fetches or duplicate clients.

## Architecture

```
UI (Forest, Forum, Publish, Profile sync)
        │
        ├─► store.ensureNostrReady()     lazy NostrUniverseService (one SimplePool)
        ├─► store.ensureNetworkUserPair() ephemeral/secrets keypair (never logged)
        ├─► runBibliotecaNetworkLoad()   Forest-only: Nostr init + paint before load
        └─► source-manager / mount-curriculum   curriculum HTTP, branch://, tree://, nostr://
```

| Layer | Location | Role |
|-------|----------|------|
| Nostr facade | `src/features/nostr/api/client/index.js` | Mixins: core, crypto, directory, bundles, forum, governance, accounts, deletion, progress |
| Relay config | `src/features/nostr/api/nostr-relays-runtime.js` | Normalise URLs; page/build overrides |
| URL parsing | `src/features/nostr/api/nostr-refs.js` | `nostr://` tree refs, share codes |
| Store wiring | `src/features/nostr/actions/` | Community sources, admin governance |
| P2P (optional) | `src/features/p2p-webtorrent/` | Separate from Nostr; consent-gated |
| Forest modal session | `src/features/sources/api/sources-session.js` | When modal closes vs stays open (`finishSourcesLoadSession`) |
| Forest network prep | `src/shared/lib/connected-services/runtime.js` | `runBibliotecaNetworkLoad()` |

## Security rules (mandatory)

1. **One Nostr pool per app**: constructed in `NostrUniverseService`; initialised via `ensureNostrReady()` only.
2. **Query concurrency**: the client gate (`_queryGate.max = 3`) prevents relay REQ storms; do not bypass with parallel `_query` loops in UI code.
3. **Secrets**: private keys (`pair.priv`, publisher keys, sync secrets) stay in memory or encrypted escrow; never `console.log`, never embed in DOM, never commit to repo.
4. **Consent**: network/social features check GDPR consent (`privacy-gdpr/`) before publish, vote, forum post, or ranking sync.
5. **Untrusted curriculum**: `loadData` may show security-warning modal for unknown Nostr/HTTP sources; do not skip trust prompts.
6. **CSP**: new remote origins require an explicit update to `index.html` Content-Security-Policy (documented in `MODAL_STANDARDS.md` §6).
7. **Rate limits**: client-side cooldowns on votes/reports/usage pings in Forest; keep them when adding new social actions.
8. **Proof-of-work, verified on read**: relays accept anything, so anti-bot enforcement lives in the readers. Every metric-bearing or listing event (directory rows, forum messages/threads, votes, reports, usage, urgent messages, legal notices, account registration) must carry a PoW bound to the actor key; verifiers take the required difficulty from `src/features/nostr/api/nostr-pow.js` (`APP_POW_BITS`) and **never** trust bits claimed in the payload. New network write surfaces MUST add a table entry and verify at read time. Aggregations dedupe per pubkey. See [`docs/DSA_COMPLIANCE.md`](DSA_COMPLIANCE.md).

## Connected services (online · cloud · AI)

| Layer | Tokens (`08-connected-services.css`) | Use |
|-------|----------------------------------------|-----|
| **Online** | `--arborito-theme-online-*` | Internet directory sort, Nostr-published rows, purple “network” chips |
| **Trees (composed)** | `--arborito-theme-trees-*` | Trees tab scope, cross-tab banners |
| **AI (Sage)** | `--arborito-theme-ai-*` | Expert mode, guide premium panels (detail in `03-learning-sage.css`) |
| **Cloud sync** | `--arborito-theme-cloud-*` | Language filter chips, sync hints |

Filter chips: **never** hand-roll `bg-purple-700` / `bg-emerald-700` in Forest, use `sources-filter-chrome.js`.

## Consent (single module)

All network/social consent APIs live in **`src/features/privacy-gdpr/api/network-consent.js`**:

- `hasGdprNetworkConsent()`, device gate before Nostr/WebTorrent/CDN/AI hosts
- `hasNetworkSocialConsent(store)`, forum + ranking after account creation

App code imports consent + runtime from [`src/shared/lib/connected-services/index.js`](../src/shared/lib/connected-services/index.js). Implementation lives in `network-consent.js` (privacy-gdpr only).

## Forest modal load behaviour

| Context | After successful load/plant/import |
|---------|----------------------------------|
| Normal use (`modal.fromOnboarding` absent) | Forest **stays open**; `updateContent()` refreshes the list |
| Onboarding / welcome (`fromOnboarding` set) | Modal **closes**; user lands on the canvas |

Implementation: `finishSourcesLoadSession(modal)` in `sources-session.js`.

Onboarding opens Forest with `fromOnboarding: { step: 2, view: 'choose' }` (`onboarding.js#_complete`). Back from Forest returns to the session step; load during onboarding dismisses Forest without bouncing back to the wizard.

## Terminology (post-refactor)

| User-facing (ES) | English | Code / URL |
|------------------|---------|------------|
| **Rama** | Branch | Single course; `branch://…`; `.arborito` branch archive |
| **Árbol** | Tree (composed) | Playlist of branches; `tree://…`; composed `.arborito` |
| **Bosque** | **Forest** | Modal `type: 'sources'`; folder `features/sources/` |

A **branch** holds lesson content. A **tree** only references branches, it is not a second kind of course body.

## Account authentication

Password-based online accounts, sync QR, sync key files, and recovery passphrases are documented in [`AUTH_AND_ACCOUNT.md`](AUTH_AND_ACCOUNT.md). UI lives in `src/features/identity-auth/`; store actions in `identity-sync-login-store-actions.js`.

## Related docs

- [`TREES_AND_BRANCHES.md`](TREES_AND_BRANCHES.md), product model
- [`NOSTR_BUNDLE_AND_PUBLISH.md`](NOSTR_BUNDLE_AND_PUBLISH.md), publish format
- [`NOSTR_RELAYS_CONFIGURATION.md`](NOSTR_RELAYS_CONFIGURATION.md), relay overrides
- [`MODAL_STANDARDS.md`](MODAL_STANDARDS.md), UI consolidation (hub headbar, `renderModalShell`)
