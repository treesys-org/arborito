# Hooks del índice de búsqueda incremental

Puntos donde el grafo cambia y debe **reconstruirse o actualizarse** el índice local (IndexedDB):

| Origen | Mecanismo |
|--------|-----------|
| Carga / cambio de fuente | [`DataProcessor.process`](../src/utils/data-processor.js) → `queueMicrotask(scheduleSearchIndexRebuild)` |
| Modo construcción (CRUD, guardar lección, etc.) | [`afterConstructionModeMutation`](../src/shell/construction-sync.js) → `scheduleSearchIndexAfterConstructionMutation` (debounced) |
| Import `.arborito` | [`importLocalTree`](../src/stores/user-store.js) → si el archivo trae `searchIndex` legacy, `hydrateSearchIndexFromArchive`; si no, el índice se reconstruye vía carga del grafo como siempre |

La deduplicación por **fingerprint** del grafo (sin `releaseSnapshots`) evita trabajo si el contenido no cambió.

Tras un cambio real, el servicio hoy hace **rebuild completo** del mapa de shards con **debounce** (no patch por nodo); véase la cabecera de [`search-index-service.js`](../src/utils/search-index-service.js).
