# Publicación Nostr: formato v2 (troceo)

**Relays (`wss://`):** quién empaqueta la app decide la lista por defecto y las anulaciones; ver [`NOSTR_RELAYS_CONFIGURATION.md`](NOSTR_RELAYS_CONFIGURATION.md).

Arborito **no mantiene** lectores de bundles monolíticos antiguos. Si `bundle.meta.nostrBundleFormat !== 2`, la carga falla con mensaje pidiendo **republicar** con la app actual.

## Escala (millones de usuarios)

Esta spec explica el **formato** (cómo se publica y se carga). Para el **porqué** del diseño a escala (Nostr como control plane + WebTorrent como data plane, lazy loading, buckets, foro v3), ver:

- [`docs/MILLIONS_SCALE_ARCHITECTURE.md`](MILLIONS_SCALE_ARCHITECTURE.md)

## Qué va dónde

| Pieza | Dónde vive | Cuándo se carga |
|--------|------------|------------------|
| Metadatos + árbol “índice” (sin cuerpos de lección) | `…bundle` | Primer `once` del bundle |
| Cuerpos de lección / examen | `…chunks.lessons.{key}` | Al abrir la lección (`loadNostrLessonChunk`) |
| Grafos de versiones (`releaseSnapshots`) | `…chunks.snapshots.{snap__id}` | Bajo demanda (`materializeNetworkReleaseSnapshot`) |
| Búsqueda (nodos + snippet de cuerpo de lección, ~12k chars/nodo) | `…chunks.search` `{ version, entries }` | Tras cargar el bundle: índice local en IndexedDB (`loadNostrSearchPack` → worker) |
| Snapshot del foro al publicar | `…chunks.forum.meta`, `threads`, `modlog`, `msg0`…`msgN` (listas troceadas) | Al abrir el modal foro: `loadNostrForumPack` (lazy; ~12s por nodo) |
| Foro en vivo (P2P) | `…forum.threads`, `…forum.messages`, borrados firmados, etc. | Misma apertura del modal: `loadForumSnapshot` + fusión con el snapshot |

El foro **no** va en el JSON del `bundle` (stub vacío). El histórico publicado vive en **`chunks.forum.*`** en partes; el estado vivo sigue en **`forum.*`**. La carga del árbol **no** trae el foro: se hidrata al abrir el foro (`hydrateTreeForumIfNeeded` → pack + live + `ForumStore`).
| Progreso del alumno | `…progress.users.{userPub}` | `loadNetworkProgressIntoUserStore` (cifrado; ya existía) |

El **`bundle.forum`** y **`bundle.progress`** que se escriben en el put son **vacíos** (stubs). No se duplica el foro ni el progreso agregado en el JSON del bundle.

## Publicación (`publishBundle`)

1. [`prepareNostrSplitBundleV2`](../src/utils/nostr-bundle-chunks.js) clona el bundle y:
   - quita `searchIndex` y `forum` del `tree` si vinieran colgados;
   - vacía `forum` / `progress` del paquete;
   - mueve cuerpos de lección a `lessonChunks` (currículo actual + cada `releaseSnapshots[…].languages`);
   - mueve cada snapshot completo a `snapshotChunks` y deja en `tree.releaseSnapshots` solo `{ treeSnapshotRef: 'snap__…' }`;
   - fija `meta.nostrBundleFormat = 2` y contadores de chunks.
2. `put` del bundle reducido + un `put` por clave en `chunks.lessons` y `chunks.snapshots`.
3. `chunks.forum`: `meta`, `threads`/`modlog` como `{ list }`, mensajes en `msg0`…`msgN` (~200 mensajes por nodo).
4. `chunks.meta`: `{ format: 2, lessonCount, snapshotCount, searchEntryCount, forumMessageParts, updatedAt }`.

## Lectura

- [`source-manager`](../src/stores/source-manager.js): exige `nostrBundleFormat === 2`; deja el stub `bundle.forum` tal cual (sin forzar carga de foro en el primer `once`).
- Modal foro + [`store.hydrateTreeForumIfNeeded`](../src/store.js): `loadNostrForumPack` + `loadForumSnapshot` y fusión en `ForumStore` (`mergeNostrForumSnapshots` / `mergeNostrForumOverlayLive`). `applyBundlePayload` **no** sustituye el foro local cuando `finalSource.origin === 'nostr'`.
- Lecciones: [`GraphLogic.loadNodeContent`](../src/stores/graph-logic.js) + `treeLazyContent` / `treeContentKey`.
- Snapshots para flujo de versiones: [`store.materializeNetworkReleaseSnapshot`](../src/store.js) (p. ej. modal de versiones).

