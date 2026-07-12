# Developer onboarding: Arborito is organized by features

If the repo feels large, **that is normal** for a desktop + web UI with many screens. The structure follows **one rule**: each piece lives next to what it means, not next to what happens to share the same technical type.

## How to read the tree: three concepts only

```
arborito/src/
├── main.jsx                         ← Vite entry (React root)
├── boot-loader.js, shell-lazy-init.js
│
├── app/                             ← React shell (App, modals, providers)
│   ├── App.jsx
│   ├── components/                  HeavyShell, ModalHost, BootScreen…
│   └── hooks/                       useApp, useArboritoStore…
│
├── core/                            ← engine: central store, i18n, user data
│   ├── store.js                     singleton Store + boot orchestration
│   ├── bootstrap.js                 store init (imported from main.jsx)
│   ├── user-store/                  local user data (bookmarks, progress…)
│   ├── i18n.js / i18n-runtime.js    translation engine
│   └── version.js                   ARBORITO_BUILD_ID (cache bust)
│
├── stores/                          ← Zustand slices + store action bundles
│   ├── shell-store.js               UI shell state (modal, theme, language…)
│   └── *-store-actions.js           domain actions callable from hooks
│
├── shared/                          ← code used by >1 features
│   ├── ui/                          modal helpers, toast, breakpoints…
│   ├── lib/                         html-escape, lazy-stylesheet, emoji…
│   └── styles/                      tokens + Tailwind entry + generated main.css
│
└── features/                        ← one folder per functional domain
    ├── <feature>/
    │   ├── components/              React `.jsx` UI
    │   ├── modals/                  React modal screens
    │   ├── hooks/                   useFeature.js, UI state + orchestration
    │   ├── api/                     pure JS (Nostr, crypto, geometry…)
    │   ├── api/actions/             store prototype mixins (legacy, shrinking)
    │   ├── styles/                  feature CSS
    │   └── index.js                 public exports
    └── …
```

## Where do I find X?

| If you want to change… | Go to… |
|---|---|
| How the tree looks, node navigation | `src/features/tree-graph/` |
| A lesson, the quiz, the AI tutor | `src/features/learning/` |
| Construction mode / editor | `src/features/editor/` |
| Backpack 🎒 / streak / lumens / certificates | `src/features/garden-progress/` |
| Sidebar / header / mobile dock | `src/features/shell-chrome/` |
| Profile modal / login / onboarding | `src/features/identity-auth/` — see [`AUTH_AND_ACCOUNT.md`](AUTH_AND_ACCOUNT.md) |
| A new modal or screen | `src/features/<x>/modals/` or `components/` |
| A helper used by several features | `src/shared/ui/` or `src/shared/lib/` |
| Shared styles | `src/shared/styles/` |
| Feature-specific styles | `src/features/{feature}/styles/` |
| Global state / store actions | `src/core/store.js` + `src/stores/` + `features/*/api/actions/` |

## Mental model: React UI + central store

**UI is React.** Shell regions (`Sidebar`, `Graph`, `Content`, modals) are `.jsx` components mounted from `src/app/App.jsx`.

**State** still flows through the central `store` (`src/core/store.js`) for historical domains, mirrored into Zustand for React via `useArboritoStore()` / `useApp()`.

**For juniors:** in `components/` and `modals/*.jsx`, import **`useForum()`**, **`useLearning()`**, etc., **not** `core/store.js`. See [`jr-developer-guide.md`](jr-developer-guide.md) and [`react-architecture.md`](react-architecture.md).

Domain methods live in `features/<x>/api/actions/store-*-methods.js` and are mounted at boot via `stores/attach-actions.js`. New work should prefer `stores/<domain>-store-actions.js` + hooks.

## CSS

Tailwind compiles `src/shared/styles/main.entry.css` into `src/shared/styles/main.css`. Vite bundles CSS through `main.jsx` in dev/production.

`main.css` is generated output, **never edit it by hand**. Run `npm run build:css` after changing CSS sources (CI also runs this).

## Modals (React)

New modals use React components + shared shells (`ModalShell.jsx`, `DockHubShell.jsx`). Follow [`MODAL_STANDARDS.md`](MODAL_STANDARDS.md) and copy an existing modal (e.g. `SearchModal.jsx`, `PrivacyModal.jsx`).

Modal chrome is React-only (`ModalShell`, `ModalHero`, `Callout`). **New UI must be JSX.**

## Related docs

1. [`ARCHITECTURE.md`](../ARCHITECTURE.md), one-page map.
2. [`react-architecture.md`](react-architecture.md), panels, bridges, graph.
3. [`jr-developer-guide.md`](jr-developer-guide.md), rules for `.jsx` contributors.
4. [`docs/MODAL_STANDARDS.md`](MODAL_STANDARDS.md), required before touching modals.
5. [`CONTRIBUTING.md`](../CONTRIBUTING.md), PR workflow and checks.

## Entry points and loading

| Path | Role |
|------|------|
| `index.html` | Static shell: `#root`, boot spinner, import maps for Noble/nostr-tools |
| `src/main.jsx` | Vite entry: CSS imports, `bootstrap.js`, `createRoot`, `<App />` |
| `src/app/startup.js` | Theme, viewport, idle prefetch, WebTorrent after GDPR |
| `src/boot-loader.js` | Dismiss boot spinner after first paint |
| `src/shell-lazy-init.js` | Idle: Sage, tour, construction prefetch |
| `electron-main.js` | Electron main process (window, IPC, Sage voice) |
| `preload.js` | `window.arboritoElectron` bridge |
| `locales/` | i18n JSON (`en/`, `es/`) |
| `vendor/` | nostr-tools, Noble, emoji, WebTorrent |

Boot flow: `index.html` → `main.jsx` → `App.jsx` → `HeavyShell` + `OverlayShell` + `ModalHost`.

## Useful commands

```bash
npm run dev              # Vite dev server
npm run build            # Production bundle → www/
npm run check:migration  # architecture + jr rules (run before PR)
npm run build:css        # Tailwind: main.entry.css → main.css
npm run knip             # Dead exports
npm run locales:validate # i18n JSON consistency
```

## Arcade / games (`arborito-games`)

Browser cartridges use **`window.arborito`** (injected by the Arborito app). Source lives in the sibling repo **[`arborito-games`](../arborito-games/)** (`cartridges/`).

## Python SDK (`arborito-sdk`)

The **Python SDK** is in the sibling repo **[`arborito-sdk`](../arborito-sdk/)** (`arborito_sdk`, CLI **`arborito-sdk`**).

| Path | Purpose |
|------|---------|
| [`arborito-sdk/`](../arborito-sdk/) | `pip install -e .` → `arborito-sdk` CLI + `arborito_sdk` |
| [`arborito-sdk/examples/minimal_quiz.py`](../arborito-sdk/examples/minimal_quiz.py) | Minimal library demo (~60 lines) |
| [`arborito-games/cartridges/`](../arborito-games/cartridges/) | **Browser** Arcade games only (`window.arborito`) |

- Docs: [`PYTHON_SDK.md`](PYTHON_SDK.md), [`sdk-spec.md`](sdk-spec.md)

## If something looks wrong

Prefer **Tailwind classes in JSX** over new raw CSS. If Tailwind cannot express it, add rules in the feature's `styles/` folder.

All imports under `src/` are **relative** (no path aliases). When in doubt, ask, the structure above is the **intentional** way to work in Arborito.

## Publishing to GitHub (Treesys)

The public repos **`treesys-org/arborito`**, **`arborito-games`**, and **`arborito-sdk`** are updated with **GitSync** (`gitsync.py` in the parent dev folder), not with day-to-day `git push` from each clone.

| Topic | Detail |
|-------|--------|
| Source of truth | Your local working copy on disk |
| Remote | Force-pushed snapshot; one commit per sync |
| Commit author | `Treesys` + GitHub noreply email for `@treesys-org` |
| Cursor | GitSync bypasses git hooks so **`Co-authored-by: Cursor`** never lands on GitHub |

After doc or code changes in any of the three repos, run GitSync for that repo name. Games catalog: keep `arborito-games/cartridges/manifest.json` in sync with every cartridge folder.
