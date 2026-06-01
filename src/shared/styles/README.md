# Shared styles (`src/shared/styles/`)

This is the **cross-feature** CSS that every part of Arborito relies on. CSS that is **only** used by one feature lives next to that feature, in `src/features/{feature}/styles/`.

| File | Role |
|------|------|
| **`main.entry.css`** | **Edit this.** Imports tokens, shared modular CSS, every feature's `styles/`, then Tailwind layers. |
| **`main.css`** | **Do not edit by hand.** Generated output (`npm run build:css`). **Commit after style changes** so GitHub Pages serves current CSS. CI (`arborito-pages.yml`) also regenerates it. |
| `foundation/tokens.css` | Semantic tokens (`--bg-app`, `--color-surface`, spacing, radii). **Do not** duplicate palette hex: `tailwind.config.js` injects `--slate-*`, `--red-*`, etc. from the Tailwind theme. |
| `foundation/reset.css` | Minimal reset. |
| `foundation/scroll-readme.css` | Scrollbar (Firefox/WebKit) + README typography; not included in Tailwind core. |
| `layout/app-flex-and-pointer-hosts.css` | App-shell layout (web component hosts). |
| `utilities/` | Reusable utility classes used by **more than one feature** (CTA, callout, pill, forms, modal backdrop / footer, tab-bar, etc.). |
| `modals/` | Shared modal chrome (dock layout, mobile sheets, host, system root). |
| `runtime-overrides/` | Numbered CSS chain loaded by `boot.js` as a **separate `<link>`** after `main.css`. Patches at runtime without rebuilding Tailwind. |

## Feature-scoped CSS

Look under `src/features/{feature}/styles/`. Each feature owns the rules that target only its components:

| Feature | Examples |
|--------|---------|
| `tree-graph/styles/` | `mobile-node-chrome.css`, `mobile-tree-ui-extras.css`, `graph-knowledge-cards.css` |
| `learning/styles/` | `syllabus-reader.css`, `lesson-and-more-menu.css`, `lesson-toc-and-footer.css`, `arborito-sage-guide.css` |
| `editor/styles/` | `construction-dock.css`, `graph-construction-flow.css` |
| `garden-progress/styles/` | `mochila-v2.css`, `mochila-inline-search.css`, `garden-gamification.css` (+ background SVGs under `assets/`) |
| `identity-auth/styles/` | `profile-modal/`, `onboarding-modal/`, `arborito-username-suggest.css`, `profile-popover-mochila.css` |
| `forum/styles/` | `forum-modal.css` |
| `publishing/styles/` | `arborito-publishing-lock.css` |
| `privacy-gdpr/styles/` | `font-fingerprint-quiet.css` |
| `shell-chrome/styles/` | `forest-shell-header-graph.css`, `dock-versions-curriculum.css`, `more-menu-version-chip.css`, `executive.css`, `mobile-landscape-shell.css` |
| `tour/styles/` | `product-tour.css` |

`main.entry.css` `@import`s **both** the shared partials and every feature-specific partial — that's the chain Tailwind compiles into `main.css`.

Config at repo root: **`tailwind.config.js`** (plugin exposes palette as CSS variables), **`postcss.config.js`**.
