# Shared styles (`src/shared/styles/`)

Cross-feature CSS. Feature-only rules live in `src/features/{feature}/styles/`.

**Rule:** every hand-written `.css` file ≤ **1000 lines** (`npm run check:max-lines`). Large domains use a folder + `index.css` barrel, edit the partial, not a monolith.

| Path | Role |
|------|------|
| **`main.entry.css`** | **Edit imports here.** Tokens → shared modules → feature barrels → Tailwind. |
| **`main.css`** | **Generated** (`npm run build:css`). Commit after style changes. |
| `foundation/arborito-foundation.css` | tokens + reset + emoji-glyphs + scroll-readme |
| `foundation/theme-surfaces/` | **All theme tokens** (`:root` + `html.dark` overrides). Split partials; never duplicate `html.dark` in feature CSS. |
| `utilities/index.css` | Primitives (eyebrow, pill, icon-btn…) + CTA/forms/callout/busy-banner |
| `modals/index.css` | Modal system: backdrop, hosts, system-root, mobile sheets, forum/download |
| `runtime-overrides/index.css` | Runtime patches bundled via Vite after `main.css` (tree switcher, sage, a11y, boot spinner) |
| `components/arborito-sage-shell.css` | Sage host layout (desktop/mobile/construction) |
| `layout/app-flex-and-pointer-hosts.css` | App shell flex + pointer-events on hosts |

## Feature-scoped CSS (barrel pattern)

Each feature uses `styles/index.css` that `@import`s ordered partials. `main.entry.css` imports **one** barrel per feature.

| Feature | Barrel | What's inside |
|---------|--------|---------------|
| `identity-auth/styles/` | `index.css` | onboarding, profile, popover, username suggest |
| `learning/styles/learning/` | `index.css` | lesson menu, toc, construct, quiz, syllabus |
| `learning/styles/` | `sage-guide.css` | Sage guide hub/screens (boot `<link>`) |
| `editor/styles/` | `index.css` | construction-dock, graph-construction-flow (boot `<link>`) |
| `garden-progress/styles/` | `index.css` | mochila, gamification, progress-scope |
| `shell-chrome/styles/` | `index.css` | header graph, dock, More menu, landscape |
| `tree-graph/styles/` | `index.css` | mobile node chrome, tree UI extras, knowledge cards |
| `sources/styles/` | `sources.css` | sources modal (lazy chunk) |
| `tour/styles/` | `product-tour.css` | product tour (lazy) |

Forum + download-app modal rules: `modals/forum-download-app.css` (in main bundle).

Lazy / boot sheets: `src/shared/lib/lazy-stylesheet.js`.

## UI contracts (don't reinvent)

- **Modals:** `ModalShell` / `DockHubShell`, see `docs/MODAL_STANDARDS.md`
- **Buttons:** `arborito-cta-{tone}`, not `bg-emerald-600`
- **Callouts:** `Callout` component, not ad hoc `bg-amber-50 dark:bg-…`
- **Checks:** `npm run check:modal-compliance`, `npm run check:css-debt`

Config: `tailwind.config.js`, `postcss.config.js`.
