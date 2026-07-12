# Terminology: branch, tree, module

## UI names (contributor docs)

| Concept | English UI | Spanish UI | Code |
|---------|------------|------------|------|
| Source picker | **Forest** | **Bosque** | `modal: { type: 'sources' }`, `features/sources/` |
| Progress panel | **Backpack** | **Mochila** | `features/garden-progress/` |
| Privacy settings | **Privacy & data** | **Privacidad y datos** | `modal: { type: 'privacy' }` |

## Branch

A **branch** is the unit you load from **Forest**: a full curriculum stored as a `branch://…` entry in the local catalog (`userStore.state.branches`).

- Examples: “Linux”, “Math”, a Nostr-published branch you installed.
- **Not** a folder/module inside the curriculum map (`type: 'branch'` in the graph).
- In a **composed tree**, each library branch appears as a child of the tree root (`…::wrapper`).

## Tree (composed tree)

A **tree** groups several library **branches** (`userStore.state.trees`, URL `tree://…`).

## Module / folder

A folder inside a branch map (`type: 'branch'` in the graph). Organizes lessons; **does not** count as a branch achievement in the backpack.

## Default achievements

| View | Branch trophies | Tree trophy |
|------|-----------------|-------------|
| Composed tree (root + 2 library branches) | 1 per imported branch (2) | 1 for the full tree |
| Single branch (one curriculum open) | 1 for that branch's curriculum | — (branch trophy represents the course) |

**Optional achievements** (`isCertifiable` / “Enable achievement” on a folder) are extra author diplomas on a specific module, on top of branch/tree trophies.

## Online account (optional)

User-facing strings use **password**, **sync QR**, **sync key file**, and **recovery passphrase**. Technical map: [`AUTH_AND_ACCOUNT.md`](AUTH_AND_ACCOUNT.md).
