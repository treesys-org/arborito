# Authoring sin terminal (flujo recomendado)

**Objetivo:** dejar claro que el camino **sin comandos** es **Nostr + app + IndexedDB** (y export `.arborito` opcional). Generar un sitio estático con carpetas `data/` (p. ej. con la library o un job de CI) es solo un **modo alternativo** para quien lo necesite para pruebas o hosting estático; **no** es el foco del producto y **no** impone por sí solo mantener compatibilidad con despliegues viejos.

## En la app

En el manual in-app: sección **“Courses without a terminal”** / **“Cursos sin terminal”** (`sec-authoring`), con el mismo mensaje en inglés y español.

## Más detalle

- [`BUILDER_FREE_INDEXEDDB_NOSTR_CHECKLIST.md`](BUILDER_FREE_INDEXEDDB_NOSTR_CHECKLIST.md) — paridad con `builder_script.py` y qué queda pendiente de QA.
- [`BUILDER_REPLACEMENT.md`](BUILDER_REPLACEMENT.md) — matriz de capacidades del builder vs runtime.
- [`DEPLOY_GITHUB_PAGES.md`](DEPLOY_GITHUB_PAGES.md) — el visitante **no** ejecuta `npm`; el mantenedor solo regenera CSS cuando toca estilos.
