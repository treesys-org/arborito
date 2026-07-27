# Editor architecture (React exception)

> The editor is the **only large area** where imperative DOM (contentEditable) and React chrome coexist. It is excluded from several `lib/check/react-architecture.mjs` rules.

---

## Why it is not “100% React”

The lesson body lives in a **contentEditable** host:

- Paste from Word, nested lists, inline images, and quiz blocks require direct DOM mutation.
- Serializing markdown ↔ HTML on every keystroke via React state would be slow and fragile.
- Undo is **markdown-based** (`editor-serialize.js`), not React’s stack.

**Decision:** keep the editable host as contentEditable; chrome around it (toolbars, modals, construction shell) is React.

---

## Layers

```
features/editor/
 components/ ← JSX: ConstructionPanel, toolbars, LessonConstructDnD, QuizWizardModal
 modals/ ← JSX: ConstructionAboutModal, ConstructionHistoryModal, …
 hooks/ ← useEditor, useConstructionAbout, useConstructionPanel, useLessonEditor, useQuizWizard
 api/
  logic/ ← flushConstructEditor, editor-serialize.js, DnD helpers
  construction-enter-flow.js ← enter-flow helpers
  editor-engine.js ← bridge to contentEditable host
```

Lesson TOC UI lives under `features/learning/` (`LessonToc`, `LessonTocSheet`). Construction outline mutations go through `lesson-toc-bridge.js` after `flushConstructEditor`.

### Syllabus vs lesson writing

| Role | Markers | Code |
|------|---------|------|
| Syllabus (TOC) | `@section` + `index:` + `title:` | `lesson-syllabus.js`, `lesson-toc-mutations.js` |
| Lesson prose | Paragraphs, lists, `@quiz`, media, in-lesson `{{lg}}` titles | `lesson-section-slices.js`, Construction WYSIWYG |

Nest depth = segments of `index` (`1.1` under `1`). Construction move and renumber operations read and write `index:` on those fences. Old `#path} Title` lines are accepted on ingest and converted. Pathless `##` / `###` are content titles in the reading view once the body has `index:` rows. Construction keeps visible titles as `{{lg}}` so the editor cannot invent TOC rows.

### Construction outline invariants

| Rule | Meaning |
|------|---------|
| One live body | Sync draft → panel draft → file. Flush or abort before TOC mutate. |
| WYSIWYG = prose only | Outline fences live in the TOC; `#` / `@section` lines in the editor are stripped on commit and on every TOC prose splice. |
| Synthetic intro | Reserved id (`SYNTHETIC_INTRO_ID`); never the slug `intro`. Filter with `synthetic` / `isSyntheticIntroItem`. |
| Outline depth = `index` | Nest depth from path segments only (`index: 1.1`, max 8). Plain `##`/`###` without a path are content titles once the body has indexes. `@quiz` is a capability bit (delete confirm), never a depth or move lock. |
| Move success | `applyTocSectionMove` → `{ ok, body, selectedIndex }`. `ok` is path geometry (←→↑↓), not body-byte equality. |
| Subtree exclusive end | Later rows with strictly deeper heading level; first equal-or-shallower row stops the slice. |
| Level rewrite | Only the known outline heading line of each range in the subtree, never fence/`@quiz` interiors. |
| Preamble | Bytes before the first heading stay before that heading on flush (not pulled into the WYSIWYG seed). |

| What | Where | React |
|------|-------|-------|
| Lesson body | `#lesson-visual-editor` (contentEditable) | No |
| Toolbar / TOC | `components/` | Yes |
| Inline quiz | `components/QuizWizardModal.jsx` + `hooks/useQuizWizard.jsx` mounts UI in block | Hybrid |
| Construction | `ConstructionPanel.jsx` + `useRegisterPanel('construction-panel')` | Yes |
| Enter lesson flow | `api/construction-enter-flow.js` | Imperative OK |

---

## Rules for contributors editing the editor

**Start here:** [`DEVELOPMENT.md`](./DEVELOPMENT.md) § Editor (documented exception).

**You may:**

- Edit JSX in `components/`, `modals/`, `hooks/`.
- Call `useEditor()` / `editorActions` from hooks.
- Use `getPanelRef('content')` / `'construction-panel'` only in `api/` or editor hooks.

**Do not copy outside the editor:**

- `querySelector` on `#lesson-visual-editor` (only CI-allowlisted hooks).
- `.innerHTML =` in features; exceptions here are in `editor-serialize.js` and engine.
- Mount widgets with `bindMobileTap`.

---

## CI: what is allowlisted

`scripts/lib/check/react-architecture.mjs` tolerates in editor:

- `innerHTML` in `features/editor/api/**`
- Template HTML in `editor-engine.js`, `useQuizWizard.jsx`
- Quiz DnD bindings in `LessonConstructDnD.jsx`

If you add a new allowlist entry, document it here and in the script.

---

## References

- General architecture: [`DEVELOPMENT.md`](./DEVELOPMENT.md)
