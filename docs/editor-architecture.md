# Editor architecture (React exception)

> The editor is the **only large area** where imperative DOM (contentEditable) and React chrome coexist. It is excluded from several `check-react-migration.mjs` rules.

---

## Why it is not “100% React”

The lesson body lives in a **contentEditable** host:

- Paste from Word, nested lists, inline images, and quiz blocks require direct DOM mutation.
- Serializing markdown ↔ HTML on every keystroke via React state would be slow and fragile.
- Undo is **markdown-based** (`editor-serialize.js`), not React’s stack.

**Decision:** do not migrate the editable host to React. Do migrate everything around it.

---

## Layers

```
features/editor/
  components/          ← JSX: ConstructionPanel, toolbars, TOC, LessonEditorToc
  modals/              ← JSX: ConstructionAboutModal, QuizWizardModal, …
  hooks/               ← useEditor, useConstructionAbout, useConstructionPanel, useLessonEditor
  api/
    logic/             ← editor-serialize.js, undo, DnD helpers
    actions/           ← mixins / enter-flow (getPanelRef allowed)
    editor-engine.js   ← bridge to contentEditable host
```

| What | Where | React |
|------|-------|-------|
| Lesson body | `#lesson-visual-editor` (contentEditable) | No |
| Toolbar / TOC | `components/` | Yes |
| Inline quiz | `useQuizWizard.jsx` mounts UI in block | Hybrid |
| Construction | `ConstructionPanel.jsx` + `useRegisterPanel('construction-panel')` | Yes |
| Enter lesson flow | `api/construction-enter-flow.js` | Imperative OK |

---

## Rules for jr devs in editor

**Start here:** [`editor-jr-guide.md`](./editor-jr-guide.md), which hook to use (decision table).

**You may:**

- Edit JSX in `components/`, `modals/`, `hooks/`.
- Call `useEditor()` / `editorActions` from hooks.
- Use `getPanelRef('content')` / `'construction-panel'` only in `api/` or editor hooks.

**Do not copy outside the editor:**

- `querySelector` on `#lesson-visual-editor` (only CI-allowlisted hooks).
- `.innerHTML =` in features, exceptions here in `editor-serialize.js` and engine.
- Mount widgets with `bindMobileTap`.

---

## CI: what is allowlisted

`scripts/check-react-migration.mjs` tolerates in editor:

- `innerHTML` in `features/editor/api/**`
- Template HTML in `editor-engine.js`, `useQuizWizard.jsx`
- Binding debt in `LessonConstructDnD.jsx` (quiz DnD)

If you add a new allowlist entry, document it here and in the script.

---

## References

- General architecture: [`react-architecture.md`](./react-architecture.md#editor-documented-exception)
- Jr guide: [`jr-developer-guide.md`](./jr-developer-guide.md) · [`editor-jr-guide.md`](./editor-jr-guide.md)
