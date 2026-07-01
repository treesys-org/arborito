# Jr-ready checklist

> Living gates for Arborito UI contributors. Legend: ✅ done · ⬜ optional polish · ⏸ documented exception

**Start here:** [`jr-developer-guide.md`](./jr-developer-guide.md) · **CI gates:** [`react-architecture.md`](./react-architecture.md#ci-gates)

---

## Golden rule (must hold)

```text
features/<domain>/modals/*.jsx  →  hooks/useX.js  →  stores/*-store-actions.js
```

Never `store-singleton` / `stores/` in `.jsx` under `components/` or `modals/`.

---

## CI gates ✅

| Gate | Command | What it catches |
|------|---------|-----------------|
| Architecture rules | `npm run check:migration` | singletons in UI, hybrid debt, store structure |
| Store bundle bindings | `node scripts/test-store-bundle-bindings.mjs` | `undefined` in `*Methods` at load time |
| Production bundle | `npm run build` | missing exports, duplicate imports, Rollup errors |
| File size | `npm run check:max-lines` | files > 1000 lines |
| Modals | `npm run check:modal-compliance` | modal standards |

```bash
cd arborito
npm run check:migration
node scripts/test-store-bundle-bindings.mjs
npm run build
```

---

## Structure ✅

| Item | Status |
|------|--------|
| One `hooks/useX.js` per feature with UI | ✅ |
| `features/<domain>/index.js` public API | ✅ (api-only features excepted: `trees/`, `p2p-webtorrent/`) |
| `.js` in features only under `api/`, `hooks/`, `index.js` | ✅ enforced by CI |
| Store actions in `stores/*-store-actions.js` | ✅ |
| No `store-*-methods.js` in `features/` | ✅ |
| Hooks expose `*Actions` namespace (no `...actions` spread) | ✅ |
| Zustand slices: `useXSlice` naming | ✅ (`useSearchSlice`, `useLearningSlice`, …) |

---

## Hook API shape ✅

```jsx
const { ui, data, forumActions } = useForum();
// Heavy modal logic:
const m = useForumModal(embed);
await forumActions.addForumMessage(sourceId, { threadId, body });
```

| Do | Don't |
|----|-------|
| `identityActions.signInWithSyncSecret(...)` | `import from '../../../stores/...'` in `.jsx` |
| `gardenProgressActions.getAvailableCertificates()` | `...gardenProgressActions` spread in hook return |
| `useConstructionAbout()` / `useForumModal()` / `useGamePlayerModal()` / `useSourcesModal()` for heavy modals | open `features/editor/api/` for common tasks |

---

## Documented exceptions ⏸

| Zone | Why |
|------|-----|
| `features/editor/**` | contentEditable host — [`editor-jr-guide.md`](./editor-jr-guide.md) |
| `components/sidebar/` under shell-chrome | ✅ (was top-level `sidebar/`) |
| `stores/`, `api/`, `startup.js` | `getArboritoStore()` / `getPanelRef` allowed |
| `features/**/hooks/**` | may use `useXStore()`, `useSageAi()`, `getArboritoStore()` |

---

## Optional polish ✅

| Item | Notes |
|------|-------|
| Split mega-modals | `ForumModal` ✅ → `useForumModal` + ~110-line JSX; `GamePlayerModal` ✅ → `useGamePlayerModal` + ~100-line JSX; `SourcesModal` ✅ → `useSourcesModal` + subcomponents |
| Sub-hooks | `useForumModal` ✅, `useGamePlayerModal` ✅, `useSourcesModal` ✅ (+ existing `useSourcesState` / `Actions` / `Lifecycle`) |
| Move `sidebar/` under `components/` | ✅ |
| Trim `useShell` `...app` spread | ✅ |

---

## PR self-check

1. `.jsx` imports only `useX` (or sub-hook) from the feature?
2. Domain writes go through `*Actions` or explicit hook callbacks?
3. New behavior in `stores/<domain>-store-actions.js`?
4. `npm run check:migration && node scripts/test-store-bundle-bindings.mjs && npm run build`?
