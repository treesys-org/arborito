# Styles (`src/styles/`)

| File | Role |
|------|------|
| **`main.entry.css`** | **Edit this.** Imports tokens, modular CSS, then Tailwind layers. |
| **`main.css`** | **Do not edit.** Generated output (`npm run build:css`). |
| `foundation/tokens.css` | Semantic tokens (`--bg-app`, `--color-surface`, spacing, radii). **No** duplica hex de la paleta: `tailwind.config.js` inyecta `--slate-*`, `--red-*`, etc. desde el theme de Tailwind. |
| `foundation/reset.css` | Reset mínimo. |
| `foundation/scroll-readme.css` | Scrollbar (Firefox/WebKit) + tipografía README; Tailwind no lo incluye. |
| `utilities/arborito-animations-prose.css` | Keyframes y `.prose` que no vienen del core de Tailwind. |
| `desktop/`, `mobile/`, `modals/`, `layout/` | CSS por área (web components, modales). |

Config at repo root: **`tailwind.config.js`** (incluye plugin que expone la paleta como variables CSS), **`postcss.config.js`**.
