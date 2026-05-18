# Descubrimiento sin `arborito-index.json` (E1)

## Lo que ya existe en Nostr

- **Códigos de árbol** (`share code`): el grafo Nostr `arborito.codes.{code}` apunta a un registro firmado que resuelve `{ pub, universeId }`. Ver `resolveTreeShareCode` / `putTreeCodeClaim` en [`nostr-universe.js`](../src/services/nostr-universe.js).
- Eso cubre **compartir un enlace corto** sin manifest HTTP; no sustituye un “catálogo” global de todos los cursos.

## Lo que no está en el producto (aún)

- Un **registro público curado** (lista de universos, metadatos, categorías) requeriría diseño de **moderación**, firmas y posiblemente un nodo Nostr bien conocido (`arborito.registry.*`) con esquema estable.
- Hasta entonces, **E1** queda satisfecho a nivel **documentación + códigos de compartir**: autores publican desde la app; lectores entran por `nostr://…` o por código, no por un JSON generado en CI.

## Convivencia con HTTP

Quien siga publicando un sitio estático puede usar [`STATIC_ARBORITO_INDEX.md`](STATIC_ARBORITO_INDEX.md). Es **independiente** del registro Nostr.
