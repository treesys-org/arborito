# Codebase conventions

Reference for contributors navigating the Arborito tree.

## Layout

**One folder per product domain** under `src/features/<name>/`. Cross-cutting code lives in `src/shared/` or `src/core/`. See [`dev-onboarding.md`](dev-onboarding.md) and [`file-hierarchy.md`](file-hierarchy.md) for the full map.

```
src/
├── main.jsx                           # Vite + React entry
├── app/                               # React shell (App, ModalHost, providers)
├── core/                              # store, i18n, user-store, bootstrap
├── stores/                            # Zustand slices + *-store-actions.js
├── shared/                            # ui helpers, lib, global styles
└── features/<domain>/
    ├── components/                    # React .jsx
    ├── modals/                        # React modal screens
    ├── hooks/                         # useFeature.js — UI orchestration
    ├── api/                           # pure JS (Nostr, crypto, services)
    ├── api/actions/                   # store prototype mixins (legacy)
    └── styles/                        # feature CSS
```

## Naming

| Prefer | Avoid in new code |
|--------|-------------------|
| `quiz-schema.js`, `quiz-player.js`, block type `quiz` | `quiz-v2-*`, `quizv2*` |
| `getQuizState().correct` | `v2Correct`, `v2ChipOrder` |
| `features/nostr/api/directory-trigram-index.js` | a lone `features/catalog/` folder |
| Descriptive feature folders (`garden-progress/`) | generic root-level `utils/` dumps |
| `useForum()` in `.jsx` | `import { store } from 'core/store.js'` in `.jsx` |

**CSS:** edit `main.entry.css` or feature `styles/`; `main.css` is generated (`npm run build:css`).

**Files:** keep hand-written `.js` / `.css` under **1000 lines** (`npm run check:max-lines`). Large CSS domains use a **folder + `index.css` barrel** (e.g. `modals/index.css`, `foundation/theme-surfaces/index.css`) — add a new partial instead of growing one file. Theme colors live in `foundation/theme-surfaces/` only; feature CSS uses `var(--arborito-theme-*)`.

## Keep one path per feature

Avoid duplicate entry points for the same concern (network init, modal sizes, consent). When you extend something, wire through the existing module and remove the old path in the same change. See [`MODAL_STANDARDS.md`](MODAL_STANDARDS.md) for modals.

| Concern | Module |
|--------|--------|
| **Branch** vs **composed tree** terminology | [`docs/TREES_AND_BRANCHES.md`](TREES_AND_BRANCHES.md) |
| Close Biblioteca after load? | [`src/features/sources/api/sources-session.js`](../src/features/sources/api/sources-session.js) — `finishSourcesLoadSession()` closes only when `modal.fromOnboarding` |
| **Consent + Nostr/AI runtime (app code)** | [`src/shared/lib/connected-services/index.js`](../src/shared/lib/connected-services/index.js) — `hasGdprNetworkConsent`, `ensureConnectedNostr`, `ensureConnectedAI`, `runConnectedNetworkLoad` |
| Nostr client (lazy, one pool) | `store.ensureNostrReady()` → [`src/features/nostr/api/client/index.js`](../src/features/nostr/api/client/index.js) — **store only**; features use `ensureConnectedNostr` |
| Network loads from Biblioteca | `runBibliotecaNetworkLoad()` in `connected-services/runtime.js` (wraps `runConnectedNetworkLoad`) |
| Hub modal size (all hub family) | `--arborito-dock-hub-width` / `MODAL_PANEL_SIZE.HUB` |
| Modal width tiers | `MODAL_PANEL_SIZE` + `--arborito-modal-width-*` in `arborito-foundation.css` |
| Dock modal assembly | `ModalShell.jsx` / `DockHubShell.jsx` in `app/components/` |
| Relay list / circuit breaker | [`src/features/nostr/api/nostr-relays-runtime.js`](../src/features/nostr/api/nostr-relays-runtime.js) |
| User network identity | `store.ensureNetworkUserPair()` in store mixins |
| Online / AI / cloud UI tokens | [`src/shared/styles/foundation/theme-surfaces/08-connected-services.css`](../src/shared/styles/foundation/theme-surfaces/08-connected-services.css) |
| Biblioteca filter chips | [`src/features/sources/modals/components/SourcesFilterChip.jsx`](../src/features/sources/modals/components/SourcesFilterChip.jsx) |
| Sage / expert AI UI | [`src/features/learning/modals/SageOverlay.jsx`](../src/features/learning/modals/SageOverlay.jsx) + hooks |
| Sage chrome when lesson open | [`src/shared/ui/lesson-reader-open.js`](../src/shared/ui/lesson-reader-open.js) — global FAB/dock hidden; only `LessonHeader` `btn-ask-sage` |
| Nested in-hub sheets | [`src/shared/ui/NestedSheetShell.jsx`](../src/shared/ui/NestedSheetShell.jsx) |
| Biblioteca network loads | [`runBibliotecaNetworkLoad()`](../src/shared/lib/connected-services/runtime.js) |

Do **not** add parallel Nostr pools, per-modal hub widths, ad-hoc `ensureNostrReady` + `yieldToPaint` in features, or legacy consent import paths — extend `connected-services` or nostr client mixins and delete the old path.

See [`docs/NETWORK_AND_SECURITY.md`](NETWORK_AND_SECURITY.md) for the full network map.

## State and mixins

- **One global store** (`core/store.js`) + Zustand mirror for React (`useArboritoStore`).
- Domain methods mount via `features/*/api/actions/` (`stores/attach-actions.js`) — **legacy**; new work goes in `stores/*-store-actions.js` + hooks.
- UI components use `hooks/useX.js`, not prototype mixins directly.

## Exports

- Export symbols other modules import; keep single-file helpers unexported.
- `npm run knip` reports unused exports; mixins and lazy CSS often need entries in `knip.config.js`.

## Build-only dependencies

Not imported from `src/` but required for release builds:

- `@capacitor/*` — Android APK (`npm run dist:android`)
- `@fontsource/noto-color-emoji`, `twemoji` — `npm run vendor:emoji`

## Checks before a PR

```bash
npm run build
npm run check:migration
npm run build:css
npm run check:max-lines
npm run knip
npm run locales:validate
npm run test:directory-trigram
```
