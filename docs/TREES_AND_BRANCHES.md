# Trees and branches

Arborito separates **what you study** (a branch) from **how you combine courses** (a tree). Both appear in **Biblioteca** (Library / Sources).

## Quick comparison

| | **Branch** | **Tree** |
|---|------------|----------|
| **What it is** | One full course: lessons, quizzes, languages, README | A **playlist** of branches — a curriculum path |
| **File** | `.arborito` archive (single branch) | `.arborito` archive (manifest + embedded branches) |
| **Local URL** | `branch://branch-…` | `tree://tree-…` |
| **Biblioteca tab** | **Branches** | **Trees** |
| **Typical use** | Author or import one subject end-to-end | Remix several branches into one learning path |
| **Construction mode** | Edit lessons inside that branch | Pick **Tree** (playlist metadata) or **Branch** (lesson map) |

A branch is always the unit that holds **lesson content**. A tree never replaces branches — it **references** them (`branchRefs`).

## In the app

### Biblioteca (Sources)

- **Branches** — local garden: import `.arborito`, export, publish, open on the map.
- **Trees** — composed playlists: create, import, add/remove branch refs, open the composed map.
- **Internet / Nostr** — network catalogs (separate from local files).

Import flow: the app detects whether the file is a **branch** or **composed tree** and shows a confirmation summary before writing to IndexedDB (`arborito_catalog_v2`).

### Opening on the map

- Opening a **branch** loads one `universe` (languages, modules, lessons).
- Opening a **tree** loads the playlist root; each slot points at a branch (`branch://…` or network URL).
- **Biblioteca stays open** when you load a branch or tree during normal use (the list refreshes in place). The modal **closes only** during **onboarding/welcome** (`modal.fromOnboarding`) so first-run users land on the canvas. Logic: `src/features/sources/api/sources-session.js` (`finishSourcesLoadSession`).

Last opened source is remembered in `localStorage` (`arborito-active-source-id` / `arborito-active-source-meta`) so Electron and the browser resume where you left off.

### Construction mode

- **Standalone branch:** metadata editor targets that branch’s public description.
- **Local composed tree:** on enter, choose **Tree** (playlist info → Biblioteca → Trees) or **Branch** (edit lessons locked to one ref).

Mobile: branch/tree info is a compact chip → standard dock modal (same pattern as other modals).

## On disk (local)

| Store | Contents |
|-------|----------|
| IndexedDB `arborito_catalog_v2` | Branch bodies, tree manifests, installed network refs |
| `localStorage` `arborito-progress` | Progress, SRS, flags — not full course JSON |

See [`USER_DATA_LAYOUT.md`](USER_DATA_LAYOUT.md).

## Export / import / publish

| Action | Branch | Tree |
|--------|--------|------|
| Export | My Garden → branch → Export → `.arborito` | Trees tab → Export → `.arborito` (embeds local branches when present) |
| Import | Biblioteca → Import → Branches tab | Biblioteca → Import → Trees tab |
| Publish to Nostr | Branch publish flow | Tree publish bundles refs + metadata |

Technical bundle format: [`NOSTR_BUNDLE_AND_PUBLISH.md`](NOSTR_BUNDLE_AND_PUBLISH.md).

## For developers

| Code | Role |
|------|------|
| `src/core/user-store/branches.js` | Local branch CRUD, `importBranch` |
| `src/core/user-store/trees.js` | Composed tree entries |
| `src/features/trees/api/import-composed-tree-bundle.js` | Import composed `.arborito` |
| `src/features/sources/api/sources-session.js` | Biblioteca session: when to close vs refresh after load; Nostr prep before network loads |
| `src/features/sources/modals/sources-logic.js` | File import UI |
| `src/features/trees/api/mount-composed-tree.js` | Load `tree://` on the graph |
| `mount-curriculum.js` | Routes `branch://` vs network vs `tree://` |

Authoring without a terminal: [`AUTHORING_WITHOUT_CLI.md`](AUTHORING_WITHOUT_CLI.md).
