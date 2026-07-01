# Editor — guía rápida para jr

> El **cuerpo editable de la lección** sigue siendo `contentEditable` (imperativo). Todo lo demás del editor es React normal.  
> Detalle técnico: [`editor-architecture.md`](./editor-architecture.md).

---

## ¿Qué hook uso?

| Quiero… | Hook | Import |
|---------|------|--------|
| Modal de construcción (historial, idioma, pick edit) | `useEditor()` | `features/editor` |
| Modal “about / publicar” (`ConstructionAboutModal`) | `useConstructionAbout()` | `features/editor` |
| Modal historial undo (`ConstructionHistoryModal`) | `useConstructionHistory()` | `features/editor` |
| Panel dock de construcción (solo `ConstructionPanel.jsx`) | `useConstructionPanel()` | `features/editor` |
| Toolbar + undo de lección en modo construcción | `useLessonEditor({ … })` | `features/editor` — solo desde `learning/` |
| Wizard de quiz inline | `useQuizWizard()` | `features/editor` |
| Acción sin UI (undo árbol, validar metadata) | `editorActions.*` | `features/editor` |

**Regla de oro:** en `components/` y `modals/*.jsx` del editor → **un hook de la tabla**, nunca `getArboritoStore()` ni imports desde `api/`.

---

## Capas (qué es React y qué no)

```
┌─────────────────────────────────────────┐
│  Modales / toolbar / ConstructionPanel  │  ← React + useEditor / useConstruction*
├─────────────────────────────────────────┤
│  #lesson-visual-editor (contentEditable)│  ← NO React (lesson-editor-dom.js)
└─────────────────────────────────────────┘
```

| Capa | Carpeta | Jr toca |
|------|---------|---------|
| Chrome React | `components/`, `modals/`, `hooks/` | ✅ Sí |
| DOM helpers puros | `api/logic/lesson-editor-dom.js` | ⚠️ Solo si mentor aprueba |
| Motor / serializar | `api/editor-engine.js`, `api/logic/editor-serialize.js` | ❌ No al empezar |
| Enter flow / panel refs | `api/construction-enter-flow.js` | ❌ Usar hook |

---

## Flujo típico — nuevo botón en modal de construcción

1. ¿Es solo UI? → `useEditor()` o `useConstructionAbout()`.
2. ¿Necesita mutar árbol / publicar? → buscar acción en `editorActions` o `publishing-store-actions.js`.
3. Si no existe → añadir `*Action` en `stores/` y exponer en `useEditor()`.
4. Modal `.jsx` solo importa el hook del paso 1.
5. `npm run check:migration`.

Ejemplo (ya en repo): toggle / validación en `useConstructionAbout` + `ConstructionAboutModal.jsx`.

---

## Flujo típico — lección en modo construcción

Vive en `features/learning/` (panel de contenido):

- `useContentPanel.jsx` monta `useLessonEditor` y pasa `toolbarHandlers` al header.
- `LessonEditorToolbarBridge` solo pinta botones; **no** importa el store.
- Helpers DOM (`applyEditorSectionMarkdown`, etc.) → importar desde `features/editor` (`index.js`), no desde rutas internas.

---

## No hagas esto

| Anti-patrón | Haz en su lugar |
|-------------|-----------------|
| `import { getArboritoStore }` en `.jsx` | `useEditor()` |
| `import … from '../api/construction-edit-scope.js'` en `.jsx` | `useConstructionPanel()` o `useEditor()` |
| `querySelector('#lesson-visual-editor')` en componentes | `useLessonEditor` / `lesson-editor-dom.js` |
| Importar desde `hooks/useLessonEditor.jsx` para helpers | `import { buildConstructEditorSeed } from '…/editor'` |

---

## CI

El editor tiene **excepciones documentadas** en `check-react-migration.mjs` (`innerHTML` en `api/`, quiz DnD, etc.). No ampliar la excepción sin actualizar [`editor-architecture.md`](./editor-architecture.md).

---

## Más lectura

- [`jr-developer-guide.md`](./jr-developer-guide.md) — reglas globales
