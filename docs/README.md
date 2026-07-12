# Arborito docs: index

Contributor documentation for Arborito. For running the app see [`../README.md`](../README.md); for roadmap see [`../ROADMAP.md`](../ROADMAP.md).

## Ecosystem (four repos)

| Repo | Role | Docs entry |
|------|------|------------|
| **arborito** (this) | Web/desktop app | This index |
| **arborito-games** | Browser Arcade cartridges | [games README](https://github.com/treesys-org/arborito-games/blob/main/README.md), [games dev-onboarding](https://github.com/treesys-org/arborito-games/blob/main/docs/dev-onboarding.md) |
| **arborito-sdk** | Python SDK + CLI | [sdk README](https://github.com/treesys-org/arborito-sdk/blob/main/README.md) |
| **Public courses** | Published from the app | [`TREES_AND_BRANCHES.md`](TREES_AND_BRANCHES.md), Nostr docs below |

Treesys maintainers publish **arborito**, **arborito-games**, and **arborito-sdk** to GitHub with **GitSync** (local folder is source of truth; one commit per sync). See [`dev-onboarding.md`](dev-onboarding.md#publishing-to-github-treesys).

## Docs map (consolidated)

| Start here | Topic |
|------------|--------|
| [`dev-onboarding.md`](dev-onboarding.md) | Repo layout, GitSync |
| [`CODEBASE_CONVENTIONS.md`](CODEBASE_CONVENTIONS.md) | Naming, PR checks |
| [`MODAL_STANDARDS.md`](MODAL_STANDARDS.md) | Modals |
| [`AUTH_AND_ACCOUNT.md`](AUTH_AND_ACCOUNT.md) + [`NETWORK_AND_SECURITY.md`](NETWORK_AND_SECURITY.md) | Accounts, privacy, Nostr |
| [`TREES_AND_BRANCHES.md`](TREES_AND_BRANCHES.md) + [`FREEZE_VS_SNAPSHOTS.md`](FREEZE_VS_SNAPSHOTS.md) | Curriculum model |
| [`forest-picker.md`](forest-picker.md) | Forest modal (`sources`) — EN/ES UI names |
| [`HACKY_TERMINAL.md`](HACKY_TERMINAL.md) | Arcade shell cartridge (`hacky-terminal`) |
| [`PYTHON_SDK.md`](PYTHON_SDK.md) + [`sdk-spec.md`](sdk-spec.md) | Python SDK + browser Arcade contract |

Older deep-dive Nostr/scale docs remain below for contributors who need them; prefer the consolidated rows above for day-to-day work.

## Full index

| Doc | Topic |
|-----|--------|
| [`NETWORK_AND_SECURITY.md`](NETWORK_AND_SECURITY.md) | **Consolidated** client map, security rules, Forest modal load behaviour |
| [`NOSTR_DISCOVERY.md`](NOSTR_DISCOVERY.md) | How trees are found on the network |
| [`NOSTR_BUNDLE_AND_PUBLISH.md`](NOSTR_BUNDLE_AND_PUBLISH.md) | Publish format, chunking |
| [`NOSTR_DIRECTORY_SEARCH.md`](NOSTR_DIRECTORY_SEARCH.md) | Trigram `#t` tags for global search |
| [`NOSTR_RELAYS_CONFIGURATION.md`](NOSTR_RELAYS_CONFIGURATION.md) | Relay lists |
| [`NOSTR_STORAGE_NOTES.md`](NOSTR_STORAGE_NOTES.md) | Client storage boundaries |
| [`STATIC_ARBORITO_INDEX.md`](STATIC_ARBORITO_INDEX.md) | Optional HTTP `arborito-index.json` |
| [`PUBLIC_TREE_INDEX.md`](PUBLIC_TREE_INDEX.md) | Static opt-in public directory pattern |

## Scale & search (architecture)

| Doc | Topic |
|-----|--------|
| [`MILLIONS_SCALE_ARCHITECTURE.md`](MILLIONS_SCALE_ARCHITECTURE.md) | Nostr control plane + WebTorrent data plane |
| [`GLOBAL_CATALOG_SCALE.md`](GLOBAL_CATALOG_SCALE.md) | Catalog vs course bytes |
| [`SEARCH_AND_DIRECTORY_SCALE.md`](SEARCH_AND_DIRECTORY_SCALE.md) | Search index at scale |
| [`SEARCH_INDEX_WORKER_PROTOCOL.md`](SEARCH_INDEX_WORKER_PROTOCOL.md) | Worker ↔ main thread |
| [`SEARCH_INDEX_HOOKS.md`](SEARCH_INDEX_HOOKS.md) | When the index rebuilds |
| [`DIRECTORY_INDEX_AGGREGATOR.md`](DIRECTORY_INDEX_AGGREGATOR.md) | Optional `directory-index:build` |

## Authoring & data

| Doc | Topic |
|-----|--------|
| [`QUIZZES-AND-EXAMS.md`](QUIZZES-AND-EXAMS.md) | `@quiz` blocks vs exam nodes (`type: exam`) |
| [`AUTHOR-FORMAT.md`](AUTHOR-FORMAT.md) | `.arborito` folder layout and blocks |
| [`AUTHORING_WITHOUT_CLI.md`](AUTHORING_WITHOUT_CLI.md) | Construction mode workflow |
| [`USER_DATA_LAYOUT.md`](USER_DATA_LAYOUT.md) | Local progress / sources keys / auth session |
| [`FREEZE_VS_SNAPSHOTS.md`](FREEZE_VS_SNAPSHOTS.md) | Tree freeze semantics |
| [`sdk-spec.md`](sdk-spec.md) | In-app game SDK |
| [`PYTHON_SDK.md`](PYTHON_SDK.md) | Python SDK + CLI ([`arborito-sdk`](../../arborito-sdk/)) |
| [`editor-architecture.md`](editor-architecture.md) | contentEditable + React editor layers |
| [`editor-jr-guide.md`](editor-jr-guide.md) | Which editor hook to use |

## Ops & policy

| Doc | Topic |
|-----|--------|
| [`../NOTICE`](../NOTICE) | Third-party licenses bundled with the app (runtime + build) |
| [`DSA_COMPLIANCE.md`](DSA_COMPLIANCE.md) | EU DSA compliance map (engineering doc, not legal advice) |
| [`forking-and-branding.md`](forking-and-branding.md) | GPL forks, trade marks, unofficial builds |
| [`DEPLOY_GITHUB_PAGES.md`](DEPLOY_GITHUB_PAGES.md) | Vite build + static deploy |
| [`BIG_TREE_ACCEPTANCE.md`](BIG_TREE_ACCEPTANCE.md) | Large-tree QA checklist before tagging a version |

In-app legal copy (Impressum, DSA summaries, attributions): `locales/en/legal.json`, `locales/es/legal.json` → About → Legal.

## CSS loading

Boot-critical styles compile to `src/shared/styles/main.css` and load via Vite through `src/main.jsx`. Additional shell styles (profile popover, garden/backpack) may load on demand via `src/shared/lib/lazy-stylesheet.js`.

**Deferred** styles load on demand via `src/shared/lib/lazy-stylesheet.js`:

- Construction dock + graph flow, when entering construction mode or on idle
- Sage guide + product tour, on idle (`shell-lazy-init.js`)
- Sources styles, with sources panel or prefetch
- Backpack inline search, when opening search in backpack

The boot spinner is static HTML in `index.html` (logo SVG inline, paints before React). It dismisses after first shell paint (`boot-loader.js`).

After changing `main.entry.css`, run `npm run build:css:min`.

## Brand assets

| Asset | Path |
|-------|------|
| Root knot logo (sidebar) | `build/arborito-root-logo.svg` |
| Treesys logo (About modal) | `build/treesys-logo.png` |
| Electron icon + NSIS branding | `build/icon.png`, `installerSidebar.bmp`, `installerHeader.bmp` (generated by `npm run ensure:icon`) |

Replace the SVG/PNG in `build/` and commit; do not re-inline base64 into JS.
