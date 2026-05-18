# Reemplazo del builder Python — matriz de paridad

Para el checklist **sin comandos** (IndexedDB + Nostr) y la QA previa al primer release, ver [`BUILDER_FREE_INDEXEDDB_NOSTR_CHECKLIST.md`](BUILDER_FREE_INDEXEDDB_NOSTR_CHECKLIST.md).

Este documento contrasta **qué hace** [`arborito-library/builder_script.py`](../../arborito-library/builder_script.py) con **qué cubre Arborito en el runtime** (índice local, cachés, export). Esa library es **referencia técnica** y opción para generar `data/` fuera de la app; no hay release de Arborito en producción que obligue a “apagar el builder” por migración de usuarios.

| # | Capacidad del builder | Criterio de aceptación | Verificación |
|---|------------------------|------------------------|--------------|
| 1 | Parse Markdown → nodos (`contentPath`, ids) | El runtime no altera el parseo de lecciones al añadir búsqueda local | Pruebas manuales / regresión en carga de fixtures |
| 2 | Rolling: `data.json` + `nodes/` + `content/` lazy | Sin cambio en esta entrega: el runtime sigue cargando el mismo layout HTTP/Nostr; el índice no sustituye el troceo de contenido | Medición tamaño primer fetch vs baseline (fuera de este PR) |
| 3 | Releases / archivo bajo `data/releases/` | `releaseSnapshots` + modal de versiones intactos | Flujo versiones existente |
| 4 | Búsqueda por shards `data/search/LANG/...` | Si existen shards estáticos, se usan primero; índice local **fusiona** (overlay gana por `id`) | [`npm run test:search-index`](../package.json) + prueba manual búsqueda Nostr/HTTP |
| 5 | `arborito-index.json` | Descubrimiento HTTP opcional documentado; el cliente prueba varias rutas relativas al árbol | [`STATIC_ARBORITO_INDEX.md`](STATIC_ARBORITO_INDEX.md) |
| 6 | Caché incremental (mtime) | Autor: índice se **reconstruye** tras cambios de grafo (debounce); lectores HTTP: texto de lección en IndexedDB además del índice | [`lesson-content-cache.js`](../src/utils/lesson-content-cache.js) + `graph-update` |
| 7 | Limpieza huérfanos en `data/content` | Solo aplica si generás árboles estáticos con un pipeline que escribe `data/` | Fuera del runtime de la app |

## Componentes runtime (esta entrega)

- [`src/utils/search-index-core.js`](../src/utils/search-index-core.js) — tokenización y shards alineados al builder.
- [`src/utils/search-index-store.js`](../src/utils/search-index-store.js) — IndexedDB por árbol.
- [`src/workers/search-index.worker.js`](../src/workers/search-index.worker.js) — construcción en segundo plano.
- [`src/utils/search-index-service.js`](../src/utils/search-index-service.js) — orquestación tras `DataProcessor.process` y mutaciones.
- [`SEARCH_INDEX_WORKER_PROTOCOL.md`](SEARCH_INDEX_WORKER_PROTOCOL.md) — mensajes del worker.
- [`SEARCH_INDEX_HOOKS.md`](SEARCH_INDEX_HOOKS.md) — hooks de mutación / carga.
- [`lesson-content-cache.js`](../src/utils/lesson-content-cache.js) — caché de cuerpos de lección vía `fetch` (sitios HTTP).

Despliegue estático (visitante sin `npm`): [`DEPLOY_GITHUB_PAGES.md`](DEPLOY_GITHUB_PAGES.md).

## Estado

| Fila | Estado |
|------|--------|
| ~~4–6~~ | ~~Runtime: búsqueda local, caché de lección HTTP, fusión con shards si existen.~~ |
| ~~5~~ | ~~`arborito-index.json` en fuentes HTTP: [`STATIC_ARBORITO_INDEX.md`](STATIC_ARBORITO_INDEX.md).~~ |
| 1–3 | Carga de árbol / versiones: cubierto por el loader actual; comprobación fina en **Q1** del checklist |
| ~~7~~ | ~~Solo si usás generación estática de `data/`; no es deuda del runtime.~~ |

Flujo **sin comandos** (Nostr + app): [`AUTHORING_WITHOUT_CLI.md`](AUTHORING_WITHOUT_CLI.md). QA previa al primer release: **Q1** en [`BUILDER_FREE_INDEXEDDB_NOSTR_CHECKLIST.md`](BUILDER_FREE_INDEXEDDB_NOSTR_CHECKLIST.md).
