# Arborito React architecture

> **Status:** Mobile graph tree is **React-only** (`store.graphUi` + `useMobileTreeModel` + `useGraphPanel`). No `createGraphEngine`. Run `npm run check:migration` and `npm run test:graph-smoke` locally.

## Entry

```
main.jsx → App.jsx → HeavyShell + OverlayShell + BootScreen
```

All primary shell regions are React (`.jsx`): **Sidebar**, **Graph**, **Sage**, **Sources**, **Content**, modals via `ModalHost.jsx`.

## Panel pattern (junior-friendly)

Reference: [`LanguageModal.jsx`](../src/features/shell-chrome/modals/LanguageModal.jsx)

```text
features/<area>/
  Foo.jsx              # root export
  hooks/useFoo.jsx     # state + effects (no DOM bridge bindings)
  api/                 # pure JS, logic, services, store actions
  components/          # presentational (≤ ~800 lines/file)
  styles/              # feature CSS
```

```jsx
export function ModalLanguage() {
  const { lang } = useArboritoStore();
  return (
    <DockModalShell onBackdropClick={close}>
      {/* JSX composition only, no innerHTML */}
    </DockModalShell>
  );
}
```

### Imperative APIs (bridges)

Some flows (store actions, `startup.js`, cross-panel navigation) cannot wait for a React re-render. Those use **panel refs**: a small imperative registry of APIs (`close`, `scrollToLesson`, etc.).

**Jr rule:** in `components/` and `modals/*.jsx` **do not** call `getPanelRef`. Register or consume refs only from feature **hooks** or from `stores/*-store-actions.js` / `api/`.

#### Register (from a hook or root panel)

```jsx
import { useRegisterPanel } from '../../../app/hooks/useRegisterPanel.js';

export function useSidebar() {
  const panelApi = useMemo(() => ({
    closeMobileMenuIfOpen,
    openMobileMoreMenu,
  }), [/* stable deps */]);

  useRegisterPanel('sidebar', () => panelApi);
}
```

`useRegisterPanel` re-registers on each commit with the latest API and unregisters on unmount.

The graph uses the same mechanism in [`useGraphPanel.jsx`](../src/features/tree-graph/hooks/useGraphPanel.jsx) (`registerPanelRef('graph', …)` directly).

#### Consume (from store / imperative api)

```js
import { getPanelRef } from '../app/panel-refs.js';

const sb = getPanelRef('sidebar');
sb?.closeMobileMenuIfOpen?.();
```

`queryPanelRef('arborito-sidebar')` still exists for code using legacy selectors; prefer the short key (`'sidebar'`).

#### Registered keys today

| Key | Panel | Typical API |
|-----|-------|-------------|
| `sidebar` | Sidebar | mobile menu, navigation |
| `graph` | Mobile graph | scroll, focus, `graph-panel-api` |
| `content` | Lesson / preview | scroll, enter lesson |
| `sage` | Sage overlay | open/close chat, settings |
| `construction-panel` | Construction editor | sync from store |
| `tree-presentation` | Tree presentation | presentation mode |
| `progress-widget` | Garden widget | XP animations |
| `modal-sources` | Sources | `close`, panel actions |
| `modal-profile` / `modal-forum` | Hub modals | `close()` |
| `product-tour` | Product tour | guided steps |

If you add a new key: document it here and in [`panel-refs.js`](../src/app/panel-refs.js) (`TAG_TO_REF` if applicable).

#### When **not** to use bridges

- Shared state → `useApp()` / Zustand slices / `*-store-actions.js`
- Parent ↔ child props → normal React
- Sage AI / voice → `useSageAi()` + `useSageVoice()` runtime (see jr guide)

### Embedded panels

```jsx
<PanelEmbedHost component={ModalSources} embed />
```

### Graph (mobile tree)

Single React tree in [`Graph.jsx`](../src/features/tree-graph/Graph.jsx):

```
store.graphUi + store.data  →  useMobileTreeModel()  →  inline knots + panel + TreePathChrome
                              useMobileTrunkScroll()  →  scroll after commit
```

- **State:** `store.graphUi` (`mobilePath`, selection, curriculum flags, `constructionOverlay`), [`tree-graph-store-actions.js`](../src/stores/tree-graph-store-actions.js) (`storeGraphUiMethods`)
- **Panel lifecycle:** [`useGraphPanel.jsx`](../src/features/tree-graph/hooks/useGraphPanel.jsx), listeners, keyboard, resize, scroll clamp; registers [`graph-panel-api.js`](../src/features/tree-graph/api/graph-panel-api.js) on `getPanelRef('graph')`
- **Model:** [`useMobileTreeModel.jsx`](../src/features/tree-graph/hooks/useMobileTreeModel.jsx) + [`planMobileTreeModelFromState`](../src/features/tree-graph/api/logic/mobile-tree-model.js)
- **Geometry:** [`TreePathChrome.jsx`](../src/features/tree-graph/components/path/TreePathChrome.jsx) + [`path-geometry.js`](../src/features/tree-graph/api/logic/path-geometry.js)
- **Long child lists:** [`useVirtualChildWindow.jsx`](../src/features/tree-graph/hooks/useVirtualChildWindow.jsx) (windowing when >30 children; optional upgrade to `@tanstack/react-virtual`)

Navigate: `store.navigateMobilePath(ids)` / `store.navigateIntoChild(id)`. Re-render: `store.bumpGraphUiRevision()`.

## Store (jr-friendly)

**For React components:** see [`jr-developer-guide.md`](./jr-developer-guide.md).

- State: Zustand slices + `useArboritoStore()` / `useApp()`
- Actions: `stores/<domain>-store-actions.js` → `useX.js` hooks
- Store singleton: `getArboritoStore()` only in `api/` and `stores/` (never in `.jsx`)
- Boot: `core/bootstrap.js` → `core/store.js` (~34 lines)

## Cross-panel lookups

See **Imperative APIs (bridges)** above. Implementation: [`panel-refs.js`](../src/app/panel-refs.js), [`useRegisterPanel.js`](../src/app/hooks/useRegisterPanel.js).

## Modals

`ModalHost.jsx` routes `store.value.modal` to eager `.jsx` modals (all bundled with the shell).

## Shared UI helpers

| Component | Use |
|-----------|-----|
| `Callout` | Inline notices |
| `LocaleRichText` | Parsed locale HTML → JSX |
| `ChromeEmoji` | Emoji glyphs (offline twemoji) |
| `LoadingBrand` / `LoadingRow` | Boot / panel spinners |

## Editor (documented exception)

`features/editor/**` **does not** follow the “pure JSX everywhere” rule. Details: [`editor-architecture.md`](./editor-architecture.md).

Summary:

- **contentEditable** for lesson body (markdown ↔ DOM without massive `dangerouslySetInnerHTML`).
- **React chrome:** toolbars, TOC, quiz wizard, construction panel, edit modals.
- **Logic:** `features/editor/api/` (serialization, undo, enter-flow).
- **CI:** `innerHTML` in `editor/**` and `useQuizWizard.jsx` are allowlisted; do not copy that pattern outside the editor.

Do not force the contentEditable host into React, cost/benefit does not work for juniors.

## CI gates

`npm run check:migration` runs `check-react-migration.mjs`, `check-react-ui-scope.mjs`, and `check-migration-metrics.mjs --fail`.

```bash
npm run build
npm run check:migration
npm run check:max-lines
node scripts/test-graph-smoke.mjs
```

### JSX ratio (`check-migration-metrics.mjs`)

| Measures | Does not measure |
|----------|------------------|
| `.jsx` vs `.js` lines in UI | Hook quality |
| % “hybrid debt” (JS with mixed JSX) | Singletons in `hooks/` |
| File count in `features/` | `getPanelRef` bridges in stores |
| Target ≥75% render in JSX | - |

**100% on metrics** does not mean perfect jr architecture, that is why the jr rules below exist.

### Jr rules (`check-react-migration.mjs`: UI layer)

Applies to `src/features/**/components/*.jsx` and `**/modals/*.jsx` (not `hooks/`, not `editor/**`).

| Rule | Detects |
|------|---------|
| Jr singletons | `store-singleton`, `aiService`, `sageVoice`, `useXStore()`, `wireArboritoSwitch`, `bindMobileTap` |
| No `core/store.js` | direct imports in `.jsx` |
| No imperative HTML | `innerHTML`, `build*Html`, template `` return `< `` in `features/*.js` |
| No unsafe JSX | `dangerouslySetInnerHTML` outside `ModalHtml` |
| Feature structure | `.js` only in `api/`, `hooks/`, `index.js` |
| Store actions | no `store-*-methods.js` in `features/`; actions in `stores/*-store-actions.js` |

### Structural rules (all `src/`)

| Rule | Detects |
|------|---------|
| React panels | `ArboritoGraph`, `customElements`, `engine.mount` |
| Graph | `createGraphEngine`, `renderMobilePrototypeTree` |
| UI imports | feature `.jsx` not from `src/lib/` |
| Store boot | `core/store.js` only via `bootstrap.js` |
| Binding debt | `querySelectorAll` / `bindMobileTap` in listed hooks |

### Documented exceptions

| Zone | Why |
|------|-----|
| `features/editor/**` | contentEditable, see [`editor-architecture.md`](./editor-architecture.md) |
| `features/**/hooks/**` | May use `useXStore()`, `useSageAi()`, `sageVoice` (single entry) |
| `stores/`, `api/`, `startup.js` | `getPanelRef` / `getArboritoStore` allowed |

**Forbidden in new feature code:** HTML string builders and `.innerHTML` in `.js` outside `editor/**`.
