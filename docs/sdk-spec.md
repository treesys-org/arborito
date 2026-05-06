# Arborito game SDK — contract (language-neutral)

This document describes the **logical API** for **browser cartridges** (`window.arborito`) and, when present in your workspace, the **Python SDK** shipped with the separate **arborito-games** repository (`sdk/` there) against an **arborito-library** checkout with `data/`.

**This `arborito` tree** contains only the browser implementation below. The Python SDK is not vendored here; keep docs in sync if you split or merge repos.

Implementations:

| Surface | Where | Notes |
|--------|--------|------|
| Browser iframe | `arborito/src/utils/inject-game-sdk.js` | Injected by `game-player.js`; talks to `window.parent.__ARBORITO_GAME_BRIDGE__`. |
| Python (stdlib) | sibling repo **arborito-games** → `sdk/` | Same API names as the player; reads `arborito-library/data`; Ollama for `ask.json`. Omit this row if you only clone `arborito`. |

---

## Identity: `user`

| Field | Type | Description |
|-------|------|-------------|
| `username` | string | Display name |
| `lang` | string | e.g. `EN`, `ES` |
| `avatar` | string | Emoji or URL |

---

## Lessons: `lesson`

| Method | Returns | Description |
|--------|---------|-------------|
| `next()` | `Promise<Lesson \| null>` (browser) / sync (Python) | Next lesson in the active playlist (browser: host cursor). |
| `list()` | `Array<{id, title}>` | Syllabus metadata (titles only in bridge). |
| `at(index)` | `Promise<Lesson \| null>` (browser) / sync (Python) | Lesson by index in the playlist. |

**Lesson** shape (minimum fields games rely on):

| Field | Type |
|-------|------|
| `id` | string |
| `title` | string |
| `text` | string (markdown/plain body) |

---

## AI: `ask`

### `ask.json(prompt, onComplete?, options?)`

- Sends a **user** message to the host LLM with JSON-only instructions appended by the implementation.
- Returns **parsed JSON** (object or array).
- Optional `onComplete(result)` for legacy callbacks.

**Browser `options` (optional):**

| Option | Default | Description |
|--------|---------|-------------|
| `timeoutMs` | `90000` | Request timeout. |
| `maxAttempts` | `3` | Retries when the model returns non-JSON or malformed JSON (not used for Sage/timeout/empty errors). |

### `ask.chat(messages, contextNode?)`

Full chat; returns provider-specific result (browser: same as host Sage/Ollama pipeline).

### Helpers

- `quiz(lesson, { count?, askOptions? })` — classroom-style Q/A array.
- `matchPairs(lesson, { count?, askOptions? })` — `{ t, d }[]` pairs.

---

## Gamification & persistence

| API | Description |
|-----|-------------|
| `xp(n)` | Add experience (browser only; no-op in Python offline). |
| `save(key, value)` | Persist JSON-serializable data (browser: per-game storage). |
| `load(key)` | Load value. |
| `exit()` | Close game modal (browser only). |

---

## Memory (SRS)

| API | Description |
|-----|-------------|
| `memory.due()` | Node IDs due for review. |
| `memory.report(nodeId, quality)` | Report recall quality `0–5`. |

Python offline: returns `[]` / no-op unless you plug a store.

---

## Error codes (`ask.json`)

Thrown errors may expose **`error.code`** (string):

| Code | When |
|------|------|
| `AI_TIMEOUT` | Request exceeded timeout. |
| `AI_SAGE_ERROR` | Sage/owl error payload in model output. |
| `AI_EMPTY_RESPONSE` | No JSON extractable from output. |
| `AI_PARSE_ERROR` | JSON invalid after retries. |

Browser: `window.arborito.ERROR_CODES`. Python: `ArboritoError.code` and `arborito_sdk.ERROR_CODES`.

---

## Python SDK (sibling **arborito-games** repo, `sdk/`)

- **`library_root`:** **arborito-library** checkout with `data/` (from `builder_script.py`).
- **`lesson` / `ask.json` / `quiz` / `matchPairs`:** same behaviour and names as `window.arborito`; curriculum text is the same as in the Arcade.
- **LLM:** **Ollama** by default (`OLLAMA_HOST`, `OLLAMA_MODEL`). Not the same process as Sage inside Electron; swap the HTTP backend in your fork if you need something else.

Use it from **any** Python process — packaged game, script, tool — without loading the Electron player.

If your layout includes the **arborito-games** repository (e.g. next to this repo in a monorepo), see that repo’s `README.md` (Python SDK / native tools). There is no in-repo link here because paths differ per checkout.
