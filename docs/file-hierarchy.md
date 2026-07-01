# File hierarchy — Arborito

Map of **what each layer is for** and how loading flows. Complements [`dev-onboarding.md`](dev-onboarding.md) (practical guide) with a full tree view.

## Boot flow (actual order)

```
index.html
  ├── inline CSS (spinner + anti-FOUC)
  ├── importmap (Noble / nostr-tools)
  └── src/main.jsx  (Vite)
        ├── shared/styles (main.entry.css + runtime-overrides)
        ├── core/bootstrap.js  → store + attach-actions
        ├── app/startup.js
        └── createRoot(#root).render(<App />)
              └── App.jsx
                    ├── HeavyShell (sidebar, graph, content…)
                    ├── OverlayShell (Sage, construction…)
                    ├── ModalHost (lazy modals)
                    └── BootScreen → hideInitialLoader()
```

| File | Role |
|------|------|
| [`index.html`](../index.html) | Static HTML shell: `#root`, boot spinner, error handlers |
| [`src/main.jsx`](../src/main.jsx) | Vite entry — CSS, bootstrap, React root |
| [`src/boot-loader.js`](../src/boot-loader.js) | Dismiss spinner after first paint / onboarding |
| [`src/app/startup.js`](../src/app/startup.js) | Theme, viewport classes, idle prefetch |
| [`src/shell-lazy-init.js`](../src/shell-lazy-init.js) | Sage, tour, construction modal prefetch (idle) |
| [`electron-main.js`](../electron-main.js) | Electron **main** process (not the renderer) |
| [`preload.js`](../preload.js) | IPC bridge → `window.arboritoElectron` |

---

## `src/` tree by layer

```
src/
├── main.jsx, boot-loader.js, shell-lazy-init.js
│
├── app/                           React application shell
│   ├── App.jsx
│   ├── components/                HeavyShell, ModalHost, BootScreen…
│   ├── hooks/                     useApp, useArboritoStore, useRegisterPanel
│   └── modal-chunk-loaders.js     lazy modal imports
│
├── core/                          State engine
│   ├── store.js                   Singleton Store
│   ├── bootstrap.js               Boot wiring (store + mixins)
│   ├── user-store/                Local data (progress, SRS, inventory…)
│   ├── i18n.js, i18n-runtime.js   Translations
│   └── version.js                 ARBORITO_BUILD_ID
│
├── stores/                        Zustand + action bundles
│   ├── shell-store.js             Shell UI slice
│   └── *-store-actions.js         Domain actions for hooks
│
├── shared/                        Cross-cutting code (>1 feature)
│   ├── ui/                        Modal shells, toast, breakpoints…
│   ├── lib/                       lazy-stylesheet, emoji-display…
│   └── styles/
│       ├── main.entry.css         Tailwind source (@import chain)
│       ├── main.css               **GENERATED — do not edit**
│       └── runtime-overrides/     CSS patches without Tailwind rebuild
│
└── features/                      One domain = one folder
    ├── shell-chrome/              Sidebar, header, mobile dock, about
    ├── tree-graph/                Graph, presentation, path geometry
    ├── learning/                  Lessons, quiz, Sage
    ├── editor/                    Construction mode, panel, sync
    ├── garden-progress/           Backpack, garden, certificates
    ├── sources/                   Biblioteca (library), catalog
    ├── identity-auth/             Profile, login, onboarding
    ├── forum/                     Nostr / local forum
    ├── publishing/                Publish, revoke, import/export
    ├── nostr/                     Relay client, bundles, directory
    ├── p2p-webtorrent/            WebTorrent, global directory
    ├── backup-export/             filesystem, backup, PDF
    ├── search/                    Index + worker + search modal
    ├── privacy-gdpr/              Network consent, boot gates
    ├── arcade/                    Arcade + game catalog
    ├── tour/                      Product tour
    └── version-updates/           Version chip, releases
```

---

## Pattern inside each `features/<name>/`

| Subfolder / file | Typical contents |
|------------------|------------------|
| `components/` | React `.jsx` screens and widgets |
| `modals/` | React modal components |
| `hooks/` | `useFeature.js` — state + effects for UI |
| `api/` | Pure JS: Nostr, crypto, geometry, services |
| `api/actions/` | Store prototype mixins (legacy, shrinking) |
| `styles/` | Feature CSS (lazy or in `main.entry.css`) |
| `index.js` | Public exports for other features |

Forum example:

```
features/forum/
  modals/ForumModal.jsx
  hooks/useForum.jsx
  api/forum-store.js
  (prototype: src/stores/forum-nostr-store-actions.js)
```

---

## CSS: three load tiers

| Tier | Where | When |
|------|--------|--------|
| **Inline** | `index.html` `#arborito-boot-critical-css` | Spinner + anti-FOUC before Vite bundle |
| **Vite bundle** | `main.entry.css` → `main.css` via `main.jsx` | First module graph parse |
| **Lazy runtime** | `lazy-stylesheet.js` | Construction, forum, profile, sources… on demand |

Central helper: [`src/shared/lib/lazy-stylesheet.js`](../src/shared/lib/lazy-stylesheet.js).

---

## JS: eager vs idle vs on-demand

| Category | Examples | When |
|----------|----------|------|
| **Boot sync** | `main.jsx`, `App.jsx`, `HeavyShell`, eager modals | First Vite module graph |
| **Boot idle** | Sage, tour, construction prefetch | `shell-lazy-init.js` / `requestIdleCallback` |
| **Modal chunk** | Sources, forum, profile, publishing… | `modal-chunk-loaders.js` + `ModalHost` Suspense |
| **Store mixin defer** | forum, publish, admin | `attach-actions.js` on first use |

---

## Repo root (outside `src/`)

| Path | Purpose |
|------|---------|
| `locales/` | i18n JSON (`en/`, `es/`) |
| `vendor/` | nostr-tools, Noble, emoji fonts, WebTorrent bundle |
| `build/` | Logos, Electron icon |
| `scripts/` | CI checks, release, vendor copy |
| `docs/` | Contributor documentation (this file) |
| `.github/workflows/` | CI Pages / release |
| `knip.config.js` | Dead code + lazy CSS entries |
| `www/` | **Generated** by `npm run build` — gitignored |

---

## Architecture notes

**What works well**

- **Feature folders** — product code under `features/<domain>/` with UI, hooks, and API together.
- **`shared/`** — truly shared helpers separated from domain code.
- **`app/` + hooks** — React shell with a clear junior rule: components use `useX()`, not `store` directly.
- **Clear entry** — `index.html → main.jsx → App.jsx` is predictable.

**Common sources of confusion**

1. **`shell-chrome` vs `garden-progress`** — backpack is chrome visually but garden in code. Intentional; you may need to jump folders.

2. **Three places for CSS** — Vite bundle, `lazy-stylesheet.js`, and inline rules in `index.html`.

3. **`store.js` vs `user-store/` vs `stores/*-store-actions.js`** — orchestration in `store.js`; bulk local data in `user-store/`; new domain actions in `stores/` + hooks.

4. **Panel refs** — some flows still call `getPanelRef('sidebar')` from store actions. See [`react-architecture.md`](react-architecture.md).

5. **`electron-main.js` vs `src/main.jsx`** — different processes. Say "renderer `main.jsx`" vs "Electron main process".

6. **Docs hub** — [`docs/README.md`](README.md) indexes contributor docs; [`ARCHITECTURE.md`](../ARCHITECTURE.md) is the one-pager.

**Summary:** the hierarchy is **sound for a large app** (domain over technical type). New contributors: read this doc, then `dev-onboarding.md`, then `MODAL_STANDARDS.md`.

---

## After changing styles

```bash
npm run build:css:min   # main.entry.css → main.css
```

Do not edit `src/shared/styles/main.css` by hand.
