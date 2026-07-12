# Editor: quick guide for junior contributors

> The **editable lesson body** remains `contentEditable` (imperative). Everything else in the editor is normal React.  
> Technical detail: [`editor-architecture.md`](./editor-architecture.md).

---

## Which hook do I use?

| I want to… | Hook | Import |
|------------|------|--------|
| Construction modal (history, language, pick edit) | `useEditor()` | `features/editor` |
| About / publish modal (`ConstructionAboutModal`) | `useConstructionAbout()` | `features/editor` |
| Undo history modal (`ConstructionHistoryModal`) | `useConstructionHistory()` | `features/editor` |
| Construction dock panel (only `ConstructionPanel.jsx`) | `useConstructionPanel()` | `features/editor` |
| Toolbar + lesson undo in construction mode | `useLessonEditor({ … })` | `features/editor`, only from `learning/` |
| Inline quiz wizard | `useQuizWizard()` | `features/editor` |
| Action without UI (tree undo, validate metadata) | `editorActions.*` | `features/editor` |

**Golden rule:** in editor `components/` and `modals/*.jsx` → **one hook from the table**, never `getArboritoStore()` or imports from `api/`.

---

## Layers (what is React and what is not)

```
┌─────────────────────────────────────────┐
│  Modals / toolbar / ConstructionPanel  │  ← React + useEditor / useConstruction*
├─────────────────────────────────────────┤
│  #lesson-visual-editor (contentEditable)│  ← NOT React (lesson-editor-dom.js)
└─────────────────────────────────────────┘
```

| Layer | Folder | Jr touches |
|-------|--------|------------|
| React chrome | `components/`, `modals/`, `hooks/` | ✅ Yes |
| Pure DOM helpers | `api/logic/lesson-editor-dom.js` | ⚠️ Only if mentor approves |
| Engine / serialize | `api/editor-engine.js`, `api/logic/editor-serialize.js` | ❌ Not when starting |
| Enter flow / panel refs | `api/construction-enter-flow.js` | ❌ Use hook |

---

## Typical flow: new button in construction modal

1. UI only? → `useEditor()` or `useConstructionAbout()`.
2. Needs to mutate tree / publish? → find action in `editorActions` or `publishing-store-actions.js`.
3. If none exists → add `*Action` in `stores/` and expose via `useEditor()`.
4. Modal `.jsx` only imports the hook from step 1.
5. `npm run check:migration`.

Example (already in repo): toggle / validation in `useConstructionAbout` + `ConstructionAboutModal.jsx`.

---

## Typical flow: lesson in construction mode

Lives in `features/learning/` (content panel):

- `useContentPanel.jsx` mounts `useLessonEditor` and passes `toolbarHandlers` to the header.
- `LessonEditorToolbarBridge` only renders buttons; it does **not** import the store.
- DOM helpers (`applyEditorSectionMarkdown`, etc.) → import from `features/editor` (`index.js`), not internal paths.

---

## Do not do this

| Anti-pattern | Do this instead |
|--------------|-----------------|
| `import { getArboritoStore }` in `.jsx` | `useEditor()` |
| `import … from '../api/construction-edit-scope.js'` in `.jsx` | `useConstructionPanel()` or `useEditor()` |
| `querySelector('#lesson-visual-editor')` in components | `useLessonEditor` / `lesson-editor-dom.js` |
| Import from `hooks/useLessonEditor.jsx` for helpers | `import { buildConstructEditorSeed } from '…/editor'` |

---

## CI

The editor has **documented exceptions** in `check-react-migration.mjs` (`innerHTML` in `api/`, quiz DnD, etc.). Do not widen exceptions without updating [`editor-architecture.md`](./editor-architecture.md).

---

## Further reading

- [`jr-developer-guide.md`](./jr-developer-guide.md), global rules
