# `arborito-index.json` en fuentes HTTP (E2)

Si la URL del árbol apunta a un **sitio HTTP** con el layout tipo library (`data/` + manifiesto), el cliente puede cargar un **`arborito-index.json`** junto al árbol. La descarga es **opcional** y solo alimenta la lista de versiones / rolling en la UI. No obliga por sí sola a mantener compatibilidad con despliegues antiguos: es soporte del formato cuando quien sirve el árbol expone ese JSON.

## Dónde busca el cliente

La lógica vive en `discoverManifest` en [`src/stores/source-manager.js`](../src/stores/source-manager.js). Para una URL de fuente HTTP, se prueba, en orden, entre candidatos derivados de la URL base:

1. `arborito-index.json` junto a la URL resuelta del árbol.
2. `../arborito-index.json` respecto a esa base.
3. Si la URL contiene `/data/`, también `…/data/arborito-index.json` (ruta absoluta reconstruida a partir del segmento `/data/`).

El primer JSON válido actualiza `availableReleases` y guarda `manifestUrlAttempted`. Nostr, `local://` y orígenes no HTTP **no** pasan por este descubrimiento.

## Formato esperado

Un objeto JSON con:

- `rolling` — opcional; debe incluir al menos `url` (relativa `./` se resuelve contra la base del manifiesto).
- `releases` — opcional; array de entradas con `url` cada una.

Así se puede usar un manifiesto generado por un build (p. ej. script de la library) **sin** depender de Nostr para el listado de versiones.
