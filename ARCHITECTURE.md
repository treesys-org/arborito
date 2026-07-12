# Arborito: Architecture

**One feature = one folder.** Boot: `main.jsx` → `app/App.jsx` → shell.

## Folders

| Path | Contents |
|------|----------|
| `src/app/` | React shell (App, modals, `useArboritoStore`) |
| `src/features/<x>/components/` | UI `.jsx` |
| `src/features/<x>/hooks/` | React hooks |
| `src/features/<x>/api/` | Pure JS (no DOM) |
| `src/features/<x>/api/actions/` | Store methods for this domain |
| `src/stores/` | `shell-store`, Zustand, `attach-actions` |
| `src/shared/lib/` | Pure utilities |
| `src/core/store.js` | Singleton `store`, for imperative code |

## Where to change things

| Task | Folder |
|------|--------|
| Button / screen | `features/<x>/components/` or `modals/` |
| React UI state | `hooks/` + `useArboritoStore()` |
| Logic / Nostr / search | `features/<x>/api/` |
| Action that is still `store.foo()` | `features/<x>/api/actions/` |

## Example: Forum

```
features/forum/
  modals/ForumModal.jsx
  api/forum-store.js
  (forum logic: src/stores/forum-nostr-store-actions.js)
```

## Docs

- [`docs/dev-onboarding.md`](docs/dev-onboarding.md), repo map
- [`docs/AUTH_AND_ACCOUNT.md`](docs/AUTH_AND_ACCOUNT.md), password login, sync, recovery
- [`docs/react-architecture.md`](docs/react-architecture.md), panels, bridges, graph
- [`docs/jr-developer-guide.md`](docs/jr-developer-guide.md), rules for `.jsx`

## Do not

- Do not create `src/lib/` or `store-mixins/`
- Do not import `core/store.js` from `.jsx` (use feature hooks)
- Keep business logic out of `.jsx` when it can live in `api/`

## Store state

- **React:** `useArboritoStore()` (Zustand, synced on each `update()`)
- **Imperative:** `import { store } from '../core/store.js'`
- Domain actions in `features/*/api/actions/`, mounted at boot via `stores/attach-actions.js`
