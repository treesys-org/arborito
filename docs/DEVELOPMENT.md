# Development (single entry point)

Code map, React rules, and conventions. Product concepts in plain language: [`PRODUCT_GUIDE.md`](PRODUCT_GUIDE.md).

## Commands

```bash
npm run dev # Vite (port 5173)
npm run dev:electron # Electron + Vite
npm run build # Production → www/
npm run check:quality # CI gates (required before PR)
npm run build:css # Tailwind → main.css
npm run locales:pack # after editing locales/en|es/*.json
npm run knip # dead exports
```

CI: `check:quality` → `build` → `knip` → `locales:validate`.

## Root directory

| Path | Role |
|------|------|
| `src/` | Application source (React, stores, features) |
| `docs/` | Contributor documentation |
| `scripts/` | Build, CI, release tooling (`npm run` hooks) |
| `locales/` | i18n source JSON |
| `vendor/` | Vendored runtime deps (Nostr, emoji, PDF, etc.) |
| `build/` | App icons, Flatpak metainfo, installer assets |
| `demo/` | Bundled read-only demo tree |
| `electron-*.js`, `electron-*.cjs`, `preload.js` | Desktop (Electron) shell |
| `index.html`, `vite.config.mjs`, `tailwind.config.js` | Web entry + bundler |
| `favicon.png` | Web favicon (generated from `build/icon.png` via `ensure:icon`) |
| `www/` | **Generated** by `npm run build`: gitignored; delete and rebuild after branding changes |
| `node_modules/` | Dependencies; gitignored |

Do not edit `www/` by hand. If it still shows an old favicon or assets, run `rm -rf www && npm run build`.

## Repo layout

One rule: **each piece lives next to what it means** (`src/features/<domain>/`).

```
src/
├── main.jsx, app/ # React shell (App, ModalHost)
├── core/ # store singleton, bootstrap, user-store, i18n
├── stores/ # *-store-actions.js + Zustand
├── shared/ # ui, lib, styles (main.entry.css → main.css)
└── features/<domain>/ # components/, modals/, hooks/, api/, styles/
```

| Domain | What it covers |
|--------|----------------|
| `tree-graph` | Lesson map |
| `learning` | Reader, quiz, Sage |
| `editor` | Construction mode |
| `garden-progress` | Backpack |
| `sources` | Forest |
| `nostr` + `p2p-webtorrent` | Public network |
| `arcade` | Games (`window.arborito`) |

Boot: `index.html` → `main.jsx` → `bootstrap.js` → `App.jsx` → `HeavyShell` + `ModalHost`.

## Golden rule (React)

In `components/` and `modals/*.jsx`:

1. Import the feature hook: `useForum()`, `useLearning()`, etc.
2. You may import **pure** helpers from `api/`.
3. **Do not** import `core/store.js`, `store-singleton`, `aiService`, `sageVoice`, or `useXStore()`.

```jsx
const { forumActions, confirm } = useForum();
await forumActions.addForumMessage(sourceId, { threadId, body });
```

New actions → `stores/<domain>-store-actions.js` → expose in `useX.js`. Do not add `api/actions/` folders under features.

## Editor (documented exception)

Lesson body is `contentEditable` (not React). Hooks: `useEditor()`, `useConstructionAbout()`, `useLessonEditor()`. See [`editor-architecture.md`](editor-architecture.md).

## Modals

Read [`MODAL_STANDARDS.md`](MODAL_STANDARDS.md) before changing modal UI.

Open via `modal-open.js`. `construction-about` is **eager**; `sources`, `forum`, `arcade` are **lazy** (chunk).

## Conventions

| Prefer | Avoid |
|--------|-------|
| `useForum()` in `.jsx` | `import { store } from 'core/store.js'` |
| `quiz-schema.js` | versioned filenames (`quiz-v2-*`, etc.) |
| CSS in `main.entry.css` or `features/*/styles/` | editing `main.css` by hand |
| Files ≤ 1000 lines | monoliths |

**Single network path:** Nostr via `ensureConnectedNostr` / `runBibliotecaNetworkLoad` in `connected-services/`. No parallel pools.

**Local data (dev):**

| Store | Contents |
|-------|----------|
| IndexedDB `arborito_catalog_v2` | Branches, trees, network refs |
| `localStorage` `arborito-progress` | Progress, SRS, freeze flags |
| `localStorage` auth | Online session; see [`AUTH_AND_ACCOUNT.md`](AUTH_AND_ACCOUNT.md) |

## CI and PR

```bash
npm run check:quality && npm run build
```

Checklist: only `useX` in `.jsx`? New action in `*-store-actions.js`? Ran `locales:pack` after i18n edits?

## Ecosystem

| Repo | Role |
|------|------|
| **arborito** | This app |
| **arborito-sdk** | Python CLI (**0.2.2**), [`PYTHON_SDK.md`](PYTHON_SDK.md) |
| **arborito-games** | Arcade cartridges |

See also: [`MODAL_STANDARDS.md`](MODAL_STANDARDS.md) · [`NETWORK.md`](NETWORK.md) · [`scripts/README.md`](./scripts/README.md) · [`CONTRIBUTING.md`](./CONTRIBUTING.md)
