# Relevo UX — modo construcción (Arborito)

Lista priorizada tras recorrido “autor / alumno” y lectura de código. Severidad: **P** pequeño, **M** medio, **A** alto.

| # | Falla | Esperado | Actual (antes del fix) | Archivos |
|---|--------|------------|-------------------------|----------|
| 1 | Metadatos de lección desde la cabecera | Clic en icono/título abre edición de nombre, icono, descripción | Cabecera estática, sin acción | `content-template.js`, `content.js` |
| 2 | “Editar” en hoja (grafo móvil) vs carpeta | Misma noción de “editar metadatos” en construcción | Carpeta → propiedades; hoja → solo `navigateTo` | `graph-mobile.js` |
| 3 | Cabecera sin vista de descripción | Ver resumen del meta `@description` en construcción | No se mostraba | `content-template.js`, `content.js` |
| 4 | Tras guardar propiedades, cabecera desactualizada | Nombre/icono alineados al grafo | Mismo `id` de nodo no refrescaba referencia en `onState` | `content.js` (`onState`) |
| 5 | Fila “Intro” del temario sin lápiz | Confusión con título de lección | Por diseño: intro no renombrable desde TOC | `content-toc.js` (documentar en manual si hace falta) |

Post-fix: **1–4** cubiertos en código; **5** queda como decisión de producto (intro ≠ título de lección).
