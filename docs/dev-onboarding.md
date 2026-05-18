# Developer onboarding — Arborito is intentional, not chaos

If this repository feels big, that is **normal** for a full desktop + web UI with many screens. The layout follows **clear rules**. Nothing here is accidental “spaghetti” — it grew with **vanilla ES modules**, **web components**, and a **single Tailwind CSS build** for the whole app.

## What to read first

1. [`README.md`](../README.md) — **Repository layout** table (entry points, folders).
2. [`src/styles/README.md`](../src/styles/README.md) — how CSS is built (`main.entry.css` → `main.css`).
3. [`CONTRIBUTING.md`](../CONTRIBUTING.md) — patterns for components and styles.
4. [`docs/NOSTR_RELAYS_CONFIGURATION.md`](NOSTR_RELAYS_CONFIGURATION.md) — default `wss://` relays and how deployments override them (only if you work on `nostr://` publish/load).

## Games, Arcade, and Tailwind

**There is no separate “games” app or second CSS stack.**

- **Arcade** (`src/components/modals/arcade.js`, `arcade-ui.js`) and the **game player** (`src/components/modals/game-player.js`) are part of the **same** Electron / browser app as the graph and modals.
- They load the **same** stylesheet: [`index.html`](../index.html) links `./src/styles/main.css`, which is produced by **Tailwind** from `main.entry.css` (see `npm run build:css`).
- UI in those files is built with **Tailwind utility classes** (`flex`, `bg-slate-*`, `dark:`, etc.) like the rest of Arborito. Extra layout for games (fullscreen, dock, toolbars) lives in **scoped CSS** under `src/styles/modals/` and uses the **same design tokens** (`tailwind.config.js` → CSS variables).

So: **Arborito Games uses Tailwind** — the same pipeline as the sidebar, graph, and modals.

## Why `main.css` is huge

`main.css` is **generated**. It contains one CSS rule per Tailwind utility the app uses (plus `dark:` / `md:` variants). **Line count is not a quality score** — it is compiler output. For smaller **on-disk** bundles, use `npm run build:css:min`.

## What `node_modules` is

After `npm install`, dependencies (Electron, Tailwind, PostCSS, …) sit in **`node_modules/`**. That is **third-party code**, not Arborito source. Do not edit it; it is gitignored and recreated with `npm install`.

## Mental model (junior-friendly)

| Piece | Role |
|-------|------|
| `src/store.js` | Global app state. |
| `src/components/` | Web components (`<arborito-*>`). |
| `src/styles/main.entry.css` | **You edit this chain** (and modular CSS), then build. |
| `src/styles/main.css` | **Generated** — do not edit by hand. |
| `tailwind.config.js` | Tailwind + palette variables for `var(--slate-*)` in custom CSS. |

## If something looks wrong

Prefer **adding Tailwind classes in templates** over new raw CSS. If Tailwind cannot express it (e.g. scrollbars), use a small rule in `foundation/scroll-readme.css` or the relevant module under `src/styles/`.

When in doubt, ask — the structure above is the **intended** way to work on Arborito.
