# Almacenamiento Nostr y “basura” (G3)

Nostr no se comporta como un **sistema de ficheros** con borrado global garantizado. Los datos que alguna vez se publicaron en la red pueden seguir existiendo en réplicas o caches según peers y política de la red.

## Implicaciones para el producto

- **Eliminar un nodo en la app** actualiza el grafo que tus lectores obtienen por las rutas que Arborito usa; no implica un **garbage collection** automático de todo blob histórico en toda la red Nostr.
- **No** prometer al usuario que “borrar” equivale a borrado irreversible en todos los servidores Nostr del planeta.
- Para copias locales, **IndexedDB** y export **`.arborito`** son bajo control del dispositivo; ahí sí se puede limpiar de forma determinista (véase índice de búsqueda y jardines locales en el checklist).

## Documentación relacionada

- [`NOSTR_RELAYS_CONFIGURATION.md`](NOSTR_RELAYS_CONFIGURATION.md) — lista por defecto de relays y cómo sobrescribirla en despliegue.
- [`BUILDER_FREE_INDEXEDDB_NOSTR_CHECKLIST.md`](BUILDER_FREE_INDEXEDDB_NOSTR_CHECKLIST.md) — ítems G1–G3.
