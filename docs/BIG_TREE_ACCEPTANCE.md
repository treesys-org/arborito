# Aceptación: árbol grande (parte de **Q1**)

Plantilla para la validación manual **antes del primer release** público, cuando tengas un curso o fixture de referencia (definí N nodos / M MB). Forma parte del ítem **Q1** en [`BUILDER_FREE_INDEXEDDB_NOSTR_CHECKLIST.md`](BUILDER_FREE_INDEXEDDB_NOSTR_CHECKLIST.md).

## Medición sugerida

1. **Primera visita (HTTP con `data/`):** tiempo hasta que el mapa es usable; tamaño del primer `fetch` de `data.json` (comparar con un objetivo fijado o un commit de referencia, no con “producción” — no la hay).
2. **Nostr:** tiempo hasta mensaje de carga resuelto o primer render del árbol; tamaño percibido del sync (DevTools → red).
3. **Búsqueda:** tiempo hasta estado `ready` (banner desaparece) y una consulta que devuelva resultados esperados.
4. **Segunda visita:** repetir apertura de la misma lección HTTP — debe servir desde **IndexedDB** ([`lesson-content-cache.js`](../src/utils/lesson-content-cache.js)) tras la primera carga.
5. **Memoria:** observación rápida en DevTools → Memory (sin automatizar aquí).

Registrar resultado y versión/commit de Arborito en el ticket o notas de release.
