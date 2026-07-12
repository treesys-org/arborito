# Forest picker (sources modal)

Modal for picking and managing local branches and composed trees. Opened from the dock or **More → Forest**.

## Code map

| UI | Code path | Store / modal type |
|----|-----------|-------------------|
| Forest modal | `src/features/sources/` | `modal: { type: 'sources' }` |
| Trees tab (composed trees) | `src/features/forest/` | `sourcesTabTrees` strings |
| Branch catalog rows | `userStore.state.branches` | `branch://…` URLs |

The folder is still named `features/sources/` for import stability. Internal helpers may still use the `Biblioteca` prefix (e.g. `runBibliotecaNetworkLoad()`).

## User-facing names (i18n)

| Language | Modal title | ES tab labels |
|----------|-------------|---------------|
| English | **Forest** (`sourceManagerTitle` in `locales/en/core.json`) | Branches / Trees |
| Spanish | **Bosque** (`locales/es/core.json`) | Ramas / Árboles |

English contributor docs use **Forest**. When documenting Spanish UI strings, use **Bosque**.

## Boot behaviour

The picker does **not** auto-open on cold start. The user opens it from navigation or onboarding.

## Related

- [`TREES_AND_BRANCHES.md`](TREES_AND_BRANCHES.md) — branch vs composed tree
- [`NETWORK_AND_SECURITY.md`](NETWORK_AND_SECURITY.md) — `runBibliotecaNetworkLoad()`, consent gates
