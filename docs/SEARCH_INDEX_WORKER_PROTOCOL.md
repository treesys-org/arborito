# Web Worker protocol — search index

## Messages: main → worker

| `type` | Payload | Description |
|--------|---------|-------------|
| `build` | `{ entries: SearchEntry[] }` | Builds the shard map by 2-character prefix from flat entries. |
| `cancel` | — | Ignore the result if it arrives late (main increments `seq`). |

`SearchEntry`: `{ id, n, t, i, d, p, l, c }` (same contract as the static shards).

## Messages: worker → main

| `type` | Payload |
|--------|---------|
| `done` | `{ seq: number, shards: Record<string, SearchEntry[][]> }` — key `LANG_prefix` (e.g. `EN_ab`) → array of documents in that shard. |
| `error` | `{ seq: number, message: string }` |

## Limits

- One job at a time per worker instance; main serialises with debounce.
- Very large entry sets are chunked inside the worker (batches of 2000 entries per `requestAnimationFrame`-equivalent iteration: a loop with `setTimeout(0)` every N entries) so the worker is never blocked for more than ~50 ms per slice.
