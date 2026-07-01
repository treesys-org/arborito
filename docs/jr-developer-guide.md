# Junior developer guide — Arborito React

## Golden rule

**In `components/` and `modals/` (`.jsx`):**

1. Import the feature hook: `useForum()`, `useLearning()`, `useTreeGraph()`, etc.
2. You may import **pure** helpers from `api/` (formatting, labels, geometry without side effects).
3. **Do not** import: `core/store.js`, `store-singleton`, `aiService`, `sageVoice`, or `useXStore()`.

```jsx
import { useForum } from '../hooks/useForum.js';

export function ModalForum() {
  const { ui, confirm, addForumMessage, activeSource, data } = useForum();
  // ...
}
```

For global state: `useApp()` or the domain slice (`useTreeGraphSlice`, etc.).

---

## Before vs now

| Before (monolith) | Now (jr-friendly) |
|-------------------|-------------------|
| `import { store } from '../../core/store.js'` | `import { usePublishing } from '../hooks/usePublishing.js'` |
| `store.publishTreePublicInteractive()` | `publishTreePublicInteractive()` from the hook |
| `store.state.activeSource` | `activeSource` (from `useApp` / slices) |
| `store.confirm(...)` | `confirm(...)` via `shellUiActions` from the hook |
| `store.value.modal` | `modal` from shell slice |
| Search 3000 lines of `core/store.js` | Open `stores/<domain>-store-actions.js` (~100 lines) |
| Undocumented prototype mixins | `attach-action-bundles.js` grouped by domain |

---

## Folder map

```
features/<domain>/
  hooks/useX.js          ← ONLY entry point for .jsx
  hooks/useXModal.js     ← optional: heavy modal state (forum)
  components/*.jsx       ← import useX() only
  components/sidebar/    ← shell-chrome only (sidebar subtree)
  modals/*.jsx           ← JSX only (no `.js` here — use hooks/ or api/)
  api/                   ← imperative logic + pure helpers (singleton OK here)
  index.js               ← public feature API

stores/
  <domain>-store-actions.js   ← callable actions (preferred for new behavior)
  attach-action-bundles.js    ← Store.prototype bundles at boot

core/
  store.js                 ← ~34 lines: constructor + instance
  store-singleton.js       ← getArboritoStore() (imperative / api/)
  bootstrap.js             ← main.jsx only
```

---

## Where does this action live?

```text
.jsx (components/modals)
    └── useX.js hook          ← only entry point
            └── stores/*-store-actions.js   ← domain actions (preferred)

api/                             ← imperative helpers; may use getArboritoStore()
attach-action-bundles.js         ← groups Store.prototype methods by domain
```

| I want to… | Where |
|------------|-------|
| Read state in UI | `useX()` / `useApp()` |
| New domain action | `stores/<domain>-store-actions.js` → export in `useX.js` |
| Call a panel without React | `getPanelRef` in `*-store-actions.js` or `api/` |
| Sage AI / voice | `useSageAi()` + `useSageVoice()` runtime |
| Chips / mobile graph panel | `useTreeGraph()` — `openExploreCurriculumSwitcher`, etc. |

**Do not copy** store logic from `api/` into components — call through the hook.

---

| Domain | Hook | Actions |
|--------|------|---------|
| Shell UI | `useApp` / `useShell` | `shellUiActions` |
| Search | `useSearch` | `searchActions` + `navigationActions` (**jr pilot**) |
| Learning | `useLearning` | `learningActions` |
| Tree graph | `useTreeGraph` | `treeGraphActions` |
| Sources | `useSources` / `useSourcesModal` | `sourcesActions` |
| Nostr | `useNostr` | `nostrDomainActions` |
| Publishing | `usePublishing` | `publishingActions` |
| Forum | `useForum` / `useForumModal` | `forumActions` |
| Identity | `useIdentityAuth` | `identityActions` |
| Editor | `useEditor` / `useConstructionAbout` | `editorActions` — see [`editor-jr-guide.md`](./editor-jr-guide.md) |
| Arcade | `useArcade` / `useGamePlayerModal` | `arcadeActions` |
| Garden | `useGardenProgress` | `gardenProgressActions` |

---

## Common patterns

### Read state

```jsx
const { data, activeSource, constructionMode, modal, lang } = useTreeGraph();
// or useApp() for composite state from all slices
```

**Zustand:** if a selector returns an object or array, wrap it with `useShallow` from `zustand/react/shallow` (see `useArboritoStore.js`). Plain `(s) => ({ a: s.a })` creates a new reference every snapshot and can loop under React 19.

### Write state (patch)

```jsx
const { update } = useApp();
update({ selectedNode: node });  // syncs slices automatically
```

### Confirm / alert

```jsx
const { confirm, alert } = useForum(); // or useApp via shellUiActions
if (await confirm('Delete?', 'Confirm', true)) { /* ... */ }
```

### Domain action

```jsx
const { forumActions } = useForum();
await forumActions.addForumMessage(sourceId, { threadId, body });
```

State (`ui`, `data`, `activeSource`) and actions (`forumActions`) are separate — do not expect action names at the top level of the hook.

Full checklist: [`jr-ready-checklist.md`](./jr-ready-checklist.md).

---

## Do not touch without a senior

- `core/store.js`, `attach-actions.js`, large publish/Nostr flows in `stores/`
- `getArboritoStore()` in `.jsx` — only in `api/` and `stores/`

---

## CI

```bash
npm run check:migration   # architecture rules + ui-scope + metrics + store bundles
npm run build
```

### What `check-react-migration` validates

| Rule | Layer |
|------|-------|
| No `core/store.js` in `.jsx` | components / modals |
| No `store-singleton`, `aiService`, `sageVoice`, `useXStore()` | components / modals |
| No `wireArboritoSwitch` / `bindMobileTap` | components / modals |
| No legacy panel-tools imports | components / modals |
| No `innerHTML` / `build*Html` | features `*.js` (except editor) |
| No raw `dangerouslySetInnerHTML` | features `*.jsx` |

**Exceptions:** `features/editor/**` — [`editor-architecture.md`](./editor-architecture.md).  
**Hooks** (`features/**/hooks/**`) may use `useXStore()`; AI/voice only via **`useSageAi()`** and **`useSageVoice()`** runtime.

Full CI vs metrics table: [`react-architecture.md`](./react-architecture.md#ci-gates).

---

## Sage — jr pattern

| Need | Hook / component |
|------|------------------|
| Chat, health, AI config | `useSageAi()` in hooks — exported from `features/learning/index.js` |
| Settings form | `useSageSettings({ ui, ai, voice, onSave })` |
| Voice (mic, TTS, overlay) | `voice.*` props from `useSageVoice()` |
| Toggle UI | `SageSwitchRow` — pure React |

Modals **do not** import `ai.js` or the `sageVoice` singleton.

---

## Bridges (panel refs)

Store and `api/` sometimes call panels without a React tree in between.

- **Register:** `useRegisterPanel('sidebar', () => api)` in the panel hook
- **Consume:** `getPanelRef('sidebar')?.closeMobileMenuIfOpen()` in `*-store-actions.js` / `api/`

Details and key table: [`react-architecture.md`](./react-architecture.md#imperative-apis-bridges).

**In `components/` / `modals/` `.jsx`:** do not use `getPanelRef` — delegate to the feature hook.

---

## Walkthrough — add a boolean preference toggle

Example: a new “compact publish diff” toggle in construction about.

1. **State** — if it belongs in user progress, add a field in `userStore` persistence; if shell-only, `shell-ui-store-actions.js`.
2. **Action** — `stores/publishing-store-actions.js` (or domain module):

   ```js
   export function setCompactPublishDiffAction(on) {
     const store = getArboritoStore();
     if (!store) return;
     store.userStore.settings.update…({ compactPublishDiff: !!on });
   }
   ```

3. **Hook** — expose in `useEditor()` or `useConstructionAbout()`:

   ```js
   const setCompactPublishDiff = useCallback(
     () => publishingActions.setCompactPublishDiff(),
     []
   );
   ```

4. **Modal** — only JSX; copy `SageSwitchRow` pattern or use existing toggle component:

   ```jsx
   import { useConstructionAbout } from '../hooks/useConstructionAbout.js';

   export function ModalConstructionAbout() {
     const { ui, compactPublishDiff, setCompactPublishDiff } = useConstructionAbout();
     // …
   }
   ```

5. **Export** — `features/editor/index.js` if the hook is new.
6. **CI** — `npm run check:migration`.

Never import `store-singleton` in the `.jsx` file.

---

## PR checklist

1. Does the `.jsx` import only `useX` from the feature?
2. Any bare `store.` usage? → move to hook or `*-store-actions`
3. New action? → add in `stores/<domain>-store-actions.js` and expose in `useX.js`
4. Public export? → `features/<domain>/index.js`
