# Checklist: flujo **sin comandos** (IndexedDB + Nostr)

**Contexto:** Arborito **no ha tenido un release de producción**. No hay usuarios ni despliegues previos que obliguen a mantener formatos “por compatibilidad histórica”. El script [`builder_script.py`](../../arborito-library/builder_script.py) se usa aquí solo como **referencia de capacidades** (qué podía generar un pipeline externo), no como contrato a preservar.

**Principio de producto:** no depender de terminal para **autoría y lectura cotidianas**. La fuente de verdad vive en el **grafo** (Nostr y/o jardín local), el cache en **IndexedDB**, y la sincronización desde la **app** (publicar, abrir un árbol, export `.arborito`).

Los ítems ~~tachados~~ están cubiertos en código o documentación. Queda **un** bloque abierto de QA manual previo a un primer release público.

**Leyenda:** `[x]` = cubierto en repo · `[ ]` = validación manual pendiente

---

## A. Contenido y grafo (referencia: parseo Markdown → nodos)

- [x] ~~**A3** — Dejar explícito que el flujo **recomendado** es app + Nostr (+ export), no un pipeline solo Markdown+CI sin pasar por la app.~~ *Manual `sec-authoring` + [`AUTHORING_WITHOUT_CLI.md`](AUTHORING_WITHOUT_CLI.md).*

---

## B. Entrega (referencia: `data.json` + `nodes/` + `content/`)

**Nota:** La paridad con un sitio estático troceado es **comportamiento de carga** cuando se usa ese modo; no es el objetivo principal del producto.

- [x] ~~**B1** — Nostr: modelo de bundle y límites documentados.~~ *[`NOSTR_BUNDLE_AND_PUBLISH.md`](NOSTR_BUNDLE_AND_PUBLISH.md). Perfil de árbol grande: parte de [Q1](#pre-release-qa-manual).*
- [x] ~~**B2** — Carga **HTTP** con `data/` (p. ej. salida de la library): el loader actual hace lazy load; no empeorar el primer fetch sin necesidad.~~ *Código existente; smoke cuando se pruebe un árbol estático.*
- [x] ~~**B3** — IndexedDB para índice + caché de texto de lección HTTP.~~ *[`search-index-service.js`](../src/utils/search-index-service.js), [`lesson-content-cache.js`](../src/utils/lesson-content-cache.js).*

---

## C. Versiones / releases

- [x] ~~**C1** — `releaseSnapshots` + UI de versiones como fuente de verdad local.~~ *Comportamiento actual de la app.*
- [x] ~~**C2** — Snapshots dentro del bundle Nostr: riesgos y mitigaciones.~~ *[`NOSTR_BUNDLE_AND_PUBLISH.md`](NOSTR_BUNDLE_AND_PUBLISH.md).*

---

## D. Búsqueda

- [x] ~~**D1** — IndexedDB + worker + fusión con shards HTTP si existen.~~ *[`search-index-service.js`](../src/utils/search-index-service.js), [`tree-utils.js`](../src/utils/tree-utils.js).*
- [x] ~~**D2** — Estado de índice + banners.~~ *`searchIndexStatus`, [`search-index-banner.js`](../src/utils/search-index-banner.js).*
- [x] ~~**D3** — Export / import `.arborito` (export solo currículo; índice se reconstruye; import legacy puede hidratar `searchIndex` si existe).~~ *[`store.js`](../src/store.js), [`user-store.js`](../src/stores/user-store.js).*

---

## E. Descubrimiento / manifest

- [x] ~~**E1** — Descubrimiento sin manifest HTTP: códigos Nostr y alcance.~~ *[`NOSTR_DISCOVERY.md`](NOSTR_DISCOVERY.md).*
- [x] ~~**E2** — `arborito-index.json` cuando la fuente es HTTP.~~ *[`STATIC_ARBORITO_INDEX.md`](STATIC_ARBORITO_INDEX.md).*

---

## F. Caché incremental

- [x] ~~**F1** — Fingerprint del grafo.~~ *[`search-index-store.js`](../src/utils/search-index-store.js).*
- [x] ~~**F2** — Rebuild debounced (sin patch fino).~~ *Cabecera [`search-index-service.js`](../src/utils/search-index-service.js).*
- [x] ~~**F3** — Mutaciones → `process` → índice.~~ *[`store.js`](../src/store.js); evitar `update({ rawGraphData })` sin `process`.*

---

## G. Limpieza / GC

- [x] ~~**G1–G3** — Borrado en grafo, limpieza IndexedDB, expectativas Nostr.~~ *Pipeline existente + [`NOSTR_STORAGE_NOTES.md`](NOSTR_STORAGE_NOTES.md).*

---

## H. Alcance del checklist (sin “legacy” de producción)

- [x] ~~**H1** — Criterio de alcance: el modelo **Nostr + IndexedDB + export** está implementado y documentado; no existe una base instalada que exija mantener rutas solo por antigüedad.~~
- [x] ~~**H2** — Documentación alineada con ese modelo ([`AUTHORING_WITHOUT_CLI.md`](AUTHORING_WITHOUT_CLI.md), [`BUILDER_REPLACEMENT.md`](BUILDER_REPLACEMENT.md)).~~

---

## Pre-release: QA manual

- [ ] **Q1** — Antes del **primer release** público, validar en dispositivo real: edición de lecciones y coherencia del modelo de nodos; round-trip **import `.arborito` / Nostr** (autor → lector); curso o fixture “grande” según [`BIG_TREE_ACCEPTANCE.md`](BIG_TREE_ACCEPTANCE.md) (búsqueda, memoria, segunda visita con caché). *No hay “regresión vs producción”: solo calidad de la primera versión publicada.*

---

### Nota

Un sitio estático con `data/` generado **fuera** de la app (p. ej. script en la library) sigue siendo un **modo de prueba o distribución alternativa**, no algo que debamos conservar por usuarios previos — porque no los hay. Quien elija solo GitHub+Markdown sin Nostr necesita **generar** `data/` en algún lado; el producto empuja a **Nostr / export** para el flujo sin terminal.

**GitHub Pages:** el visitante no ejecuta `npm`; quien mantiene el repo regenera CSS si toca estilos ([`DEPLOY_GITHUB_PAGES.md`](DEPLOY_GITHUB_PAGES.md)).

---

## Revisión rápida (histórico)

### 1. Solo validación manual

| Ítem | Notas |
|------|--------|
| **Q1** | Único ítem abierto: ver sección [Pre-release](#pre-release-qa-manual). |
| **D\*** | Prueba de búsqueda en curso grande entra en Q1. |

### 2. Ya cubierto en código (referencia)

Tablas anteriores de D2, G2, F3, B3, etc. quedan **resueltas** en el cuerpo del checklist arriba; no repetir tareas duplicadas.

### 3. Objetos grandes / Nostr

| Ítem | Notas |
|------|--------|
| **B1 / bundle** | [`NOSTR_BUNDLE_AND_PUBLISH.md`](NOSTR_BUNDLE_AND_PUBLISH.md); medición en Q1. |

### 4. Grande / QA

| Ítem | Notas |
|------|--------|
| **Q1** | Incluye lo que antes era H3 + comprobaciones tipo A1/A2. |
