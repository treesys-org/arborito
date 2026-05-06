# Protocolo Web Worker — índice de búsqueda

## Mensajes main → worker

| `type` | Payload | Descripción |
|--------|---------|-------------|
| `build` | `{ entries: SearchEntry[] }` | Construye mapa de shards por prefijo (2 caracteres) a partir de entradas planas. |
| `cancel` | — | Ignora el resultado si llega tarde (el main incrementa `seq`). |

`SearchEntry`: `{ id, n, t, i, d, p, l, c }` (mismo contrato que shards estáticos).

## Mensajes worker → main

| `type` | Payload |
|--------|---------|
| `done` | `{ seq: number, shards: Record<string, SearchEntry[][]> }` — clave `LANG_prefix` (ej. `EN_ab`) → array de documentos en ese shard. |
| `error` | `{ seq: number, message: string }` |

## Límites

- Un job a la vez por instancia de worker; el main serializa con debounce.
- Entradas muy grandes se trocean en lotes en el worker (chunk de 2000 entradas por iteración `requestAnimationFrame` equivalente: bucle con `setTimeout(0)` cada N entradas) para no bloquear el worker más de ~50 ms por slice.
