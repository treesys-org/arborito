# `scripts/`: build, CI, and release tooling

Required for development and release. **Nothing here ships** inside the Electron/Flatpak app.

## Layout

| Location | Role |
|----------|------|
| **Root** (`scripts/*.mjs`) | `npm run` entry points |
| **`lib/check/`** | CI quality gates |
| **`lib/vendor/`** | Copy npm deps into `vendor/` |
| **`lib/flatpak/`** | Flatpak release helpers |

## npm commands

| Command | Purpose |
|---------|---------|
| `vendor:deps` | Emoji + PDF vendoring (runs on `prebuild`) |
| `check:quality` | Architecture, modals, file size, CSS, directory index |
| `flatpak:sync` | Screenshots + AppStream metainfo |
| `flatpak -- <cmd>` | `setup`, `rebundle`, `verify`, `diagnose`, `test-launcher` |

Run one gate: `npm run check:quality -- --only max-lines`
