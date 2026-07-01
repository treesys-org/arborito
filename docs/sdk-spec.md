# Arborito game SDK — contract (language-neutral)

This document describes the **logical API** for **browser cartridges** (`window.arborito`) and, when present in your workspace, the **Python SDK** shipped with the separate **arborito-games** repository (`sdk/` there).

**This `arborito` tree** contains only the browser implementation below. The Python SDK is not vendored here; keep docs in sync if you split or merge repos.

> **AI is optional.** Lessons can ship pre-authored questionnaires (Quiz V2 `@quiz` blocks) and most cartridges run entirely in **static mode** by reading them with `challenge.fromLesson(...)`. The `ask.*` family is an *upgrade* for users who configured a local LLM (Sage / llama.cpp) — gate it on `getAIMode() === 'dynamic'` and always provide a static fallback. A perfectly good Arborito game makes zero AI calls.

Implementations:

| Surface | Where | Notes |
|--------|--------|------|
| Browser iframe | `arborito/src/features/arcade/api/inject-game-sdk.js` | Injected by `game-player.js`; talks to `window.parent.__ARBORITO_GAME_BRIDGE__`. |
| Python (stdlib) | sibling repo **arborito-games** → `sdk/` | Same API names as the player. Reads a tree exported from the app (`.arborito`), a static `data/` folder, **or fetches one live over Nostr via an 8-character share code (`XXXX-XXXX`)**. Calls a local **llama.cpp server** (`llama-server`) for `ask.json` in dynamic mode. Omit this row if you only clone `arborito`. |

---

## Selecting the curriculum source (which tree powers your game)

Arborito games never embed a course themselves. Each game is a small renderer that asks the host for lessons. **Where those lessons come from depends entirely on the surface you target.** Pick one of the two modes below — the API surface is the same, but who chooses the source is not.

### A. Browser cartridge (Arcade, inside the Arborito app)

The **user** picks the tree, not the game. The flow is:

1. The user opens Arborito and switches to one of their local or public trees (the "active source").
2. The user opens a module (any non-leaf node) and launches a game from the in-app Arcade.
3. The host (`game-player.js`) collects every leaf and `@exam` node under the selected module into an ordered **playlist** and starts the cartridge.
4. The cartridge calls `window.arborito.lesson.next()`, `.list()`, or `.at(i)` against that playlist via the bridge.

Practical consequences for cartridge authors:

- You **cannot** hard-code a tree, source URL, share code, or relay. The cartridge has no read access to the active source's identity, just to its lesson contents through the bridge.
- Design defensively: any tree may be loaded. Read `lesson.title`, `lesson.text`, `lesson.challenge*` and use `window.arborito.user.lang` to localize prompts. Never assume a specific subject or schema beyond the Lesson shape above.
- Use `challenge.isComplete(...)` / `getAIMode()` to fall back when a tree has no Quiz V2 data, instead of crashing.
- Cross-tree work is intentionally out of scope: a cartridge only ever sees the playlist of the module the user launched it from.

If your game **needs a fixed curriculum** (e.g. a Pygame title that ships with one course), ship it as a Python SDK app instead — see B.

### B. Python SDK (independent games and apps, outside the browser)

The Python SDK is the **extra surface** for devs building games and apps that don't run inside Arborito's iframe (Pygame, CLI tools, Discord bots, backend pipelines, native desktop, etc.). In this mode the **developer** picks the tree explicitly at startup and the SDK is intentionally minimal: no UI, no access to the user's Arborito vault — you point it at a file, a folder, or a public Nostr share code.

Three loaders are supported:

| Loader | Constructor | What you provide | When to use |
|--------|-------------|------------------|-------------|
| Exported tree file | `Arborito.from_arborito("course.arborito", lang="ES")` | A `*.arborito` archive exported from the app (My Garden → Export). It contains the tree, release snapshots and `meta.json` in a single JSON file. | Shipping a frozen, versioned course bundled with your game. **Default offline path** — no network call. |
| Static `data/` folder | `Arborito.from_static_data("/path/to/data", lang="EN")` | A directory laid out like Arborito's static HTTPS source (`meta.json`, lesson markdown, optional `arborito-index.json`). | When the same tree is also self-hosted as a static site and you want both to read from one source on disk. |
| Public Nostr share code | `Arborito.from_share_code("ABCD-EF23", lang="ES", relays=None)` | An 8-character public **share code** (format `XXXX-XXXX`, alphabet `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`) that some other Arborito user published from their app. Optionally a list of `wss://` relay URLs; otherwise the SDK uses the same defaults as the app (Germany / EU). | Joining a tree someone publishes publicly on Nostr — typically because the player (not you) typed the code, or because you want the latest published version instead of pinning a file. **Requires network and user consent.** |

#### How the share code resolves under the hood

For transparency (the SDK is just a thin client over the same protocol the app uses):

1. The code is normalized to `XXXX-XXXX` and turned into the `d` tag of a `KIND_TREE_CODE` addressable event.
2. The SDK queries the configured relays for that event and gets back `{ ownerPub, universeId, recommendedRelays }`. The signature is verified before anything else is done with it.
3. The SDK then loads the **format v2 chunked bundle** authored by `ownerPub` for `universeId` from those relays (metadata first, lesson bodies and release snapshots on demand). This is exactly the same path described in [`NOSTR_BUNDLE_AND_PUBLISH.md`](./NOSTR_BUNDLE_AND_PUBLISH.md).
4. From this point on, `lesson.next()`, `quiz(...)`, `matchPairs(...)`, etc. work identically to the file-based loaders.

If you already know the publisher's pub key and the universe id (e.g. for a tree your organization owns), you can skip the share-code lookup and pass them directly: `Arborito.from_nostr(pub, universe_id, lang="ES", relays=None)`. Useful for CI, automation, or first-party deployments where the share-code roundtrip is just overhead.

#### Recommended workflow to assign a specific tree to your game

Pick whichever fits your game; both are valid.

**Option 1 — Pinned `.arborito` file (default, offline-friendly):**

The shortest honest path from "I want my game to use course X" to "the SDK is reading it":

1. **Open the tree in Arborito** (or author it there). This can be your own local tree or one you joined via share code / Nostr — the app normalizes both into your local garden.
2. **Export it** from *My Garden → Trees → Export*. You get an `arborito-garden-<name>.arborito` file. If the tree has release snapshots, pick which versions to include in the export dialog.
3. **Commit that file into your game's repository** (e.g. `assets/courses/spanish-a1.arborito`) so the course version your game targets is reproducible and pinned. Treat it like any other game asset.
4. **Load it at startup** and read lessons exactly as a browser cartridge would:

   ```python
   from arborito_sdk import Arborito

   arb = Arborito.from_arborito("assets/courses/spanish-a1.arborito", lang="ES")

   lesson = arb.lesson.next()
   while lesson is not None:
       render(lesson.title, lesson.text)
       quiz = arb.quiz(lesson, count=3)
       play_round(quiz)
       lesson = arb.lesson.next()
   ```

5. **To swap or update the course**, re-export from the app and replace the file. The SDK loads whatever you give it; there is no implicit auto-update, no background fetch, and no network call in static mode.

If you want to ship more than one tree, just commit several `.arborito` files and let the user (or your menu) choose which path to pass to `from_arborito` at runtime. The SDK is happy to be instantiated multiple times against different files in the same process.

**Option 2 — Public share code (live tree from Nostr):**

When the course the game targets is **someone else's published tree** (or your own published tree that you want to keep updated without re-shipping the game), use the share code path:

```python
from arborito_sdk import Arborito

arb = Arborito.from_share_code("ABCD-EF23", lang="ES")

for lesson in arb.lesson.iter():
    render(lesson.title, lesson.text)
    play_round(arb.quiz(lesson, count=3))
```

What this implies (be explicit with your players):

- The SDK opens `wss://` connections to the same Nostr relays the Arborito app uses by default (independent operators in Germany / EU; the deployment owner can override the list — see [`NOSTR_RELAYS_CONFIGURATION.md`](./NOSTR_RELAYS_CONFIGURATION.md)).
- The relay operators (and any passive observer of the network) see that the player's IP requested a public tree. They do **not** see who the player is unless your game additionally identifies them; the SDK never sends an Arborito identity by itself.
- You, as the game developer, are responsible for asking the player for consent before the first network call. Mirror what Arborito's onboarding does ("network activity is opt-in, defaults are EU operators, you can stay offline"). Pinned `.arborito` mode is the natural fallback for players who refuse network use.

#### Live updates (opt-in)

`from_share_code(...)` and `from_nostr(...)` are **one-shot fetches by default**: the SDK pulls the current bundle once and then reads from memory like the file-based loaders. To keep the tree synchronized as the publisher pushes new versions, subscribe explicitly:

```python
arb = Arborito.from_share_code("ABCD-EF23", lang="ES")

def on_tree_update(info):
    # info: { "version": str, "updated_at": int, "added": [...], "changed": [...] }
    # Called when the same ownerPub publishes a newer bundle for universeId.
    refresh_game_menu()

arb.subscribe(on_update=on_tree_update)
# ... later ...
arb.unsubscribe()
```

Notes on the subscription:

- One persistent `wss://` connection per relay in the configured set, held while `subscribe(...)` is active. Closed cleanly on `unsubscribe()` or process exit.
- Only metadata changes wake the callback (new release snapshot, new top-level version). Lesson bodies stay lazy and are fetched on the next `lesson.next()` / `lesson.at(i)` that reaches a changed node.
- The SDK never auto-applies a new tree mid-frame. The callback is the **signal**; your game decides when it's safe to swap (between levels, on a save screen, etc.). Until you re-read from the SDK, players see the cached version.
- All bundles are signature-verified against `ownerPub` before they replace anything. A relay that returns a forged bundle is rejected silently and the previous tree stays in memory.

If you only need "check for updates at startup", call `arb.refresh()` once instead of subscribing — same verification, no long-lived connections.

#### What the Python SDK still does *not* do today

To stay honest about the current contract:

- **No write to the Nostr network.** The SDK can read public trees and resolve share codes, but it does **not** publish, fork, or sign on the player's behalf. Authoring still happens inside the Arborito app.
- **No automatic upgrade across pinned versions.** In `from_arborito(...)` mode, if you replace the `.arborito` file with a newer export, players with local progress may see node IDs they don't recognize. If you care about stable progression, pin a specific **release snapshot** at export time and re-export only when you cut a new course version (snapshot ids are listed in the export dialog and persisted inside the `.arborito` archive). In `from_share_code(...)` mode, the publisher's release-snapshot policy is what gives you that guarantee — query `arb.release_snapshots()` to pin a specific one.
- **No write-back of player data.** `xp`, `save`/`load` and `memory.report` are local stubs offline. Anything you persist stays on the player's machine; it does not flow back to the Arborito vault or to Nostr.
- **No forum, no progress sharing, no Sage.** The SDK is a curriculum reader plus an optional local llama.cpp passthrough. Social features stay in the app.

If your game genuinely needs live, user-selected trees with full social context (community quiz arenas, classroom dashboards, etc.), target the browser cartridge surface (A) instead — that's the surface that already integrates with Arborito's source manager, forum, and progress sync.

---

## Capabilities and limits: cartridge (in-app) vs Python SDK

Both surfaces share the same **logical API names** (`lesson.*`, `quiz`, `matchPairs`, `ask.*`, `challenge.*`, `memory.*`, `xp`, `save`/`load`). What changes is **what those calls are actually wired to**, how the game is delivered, and what it is allowed to do at runtime. Read this before you commit to a surface.

### Side-by-side capabilities

Legend: ✅ first-class, ⚠️ supported with caveats, ❌ not available (build it yourself if you need it).

| Capability | Browser cartridge (Arcade) | Python SDK |
|------------|----------------------------|------------|
| Which tree is loaded | ❌ Developer cannot choose — user picks the active source in the app and launches from a module. | ✅ Developer chooses at startup: `from_arborito` / `from_static_data` / `from_share_code` / `from_nostr`. |
| Cross-tree gameplay (mix multiple trees) | ❌ Cartridge only sees the current playlist. | ✅ Instantiate `Arborito` multiple times against different files / codes in the same process. |
| Real `user.username` / `user.avatar` from the app profile | ✅ Comes from `store.user`. | ❌ You supply (or invent) an identity. No Arborito account context. |
| `user.lang` | ✅ Reflects the Arborito UI language. | ⚠️ You pass `lang="ES"` / `"EN"` to the loader. No automatic detection. |
| SRS / spaced repetition (`memory.due`, `memory.report`, `memory.getStatus`) | ✅ Real Arborito SRS — reading and writing the player's review schedule. Reports during a game change what the player sees in the Care tab afterwards. | ❌ Stubs (`due()` returns `[]`, `report()` is a no-op). Implement your own scheduler or plug a store. |
| XP that the player keeps across sessions / games | ✅ `xp(n)` increments the Arborito profile XP. Visible in the user's Profile and across other cartridges. | ❌ Stub. Track your own progression. |
| Per-game persistence (`save` / `load`) | ⚠️ Scoped to `gameId` in IndexedDB; hard cap **~195 KB per game** (200 000 chars). Throws `GAME_QUOTA_EXCEEDED` past that. | ✅ Whatever you want — local files, SQLite, your own backend. No quota imposed by the SDK. |
| AI (`ask.json`, `ask.chat`) | ✅ Host `aiService`: native llama.cpp on desktop; Expert API in browser. | ⚠️ Local `llama-server` at `LLAMA_CPP_HOST` (default `http://127.0.0.1:8080`). You ship/start it; else static fallback. |
| Static-mode helpers (`quiz`, `matchPairs`, Quiz V2 parsing, `buildDuelDeck`) | ✅ Same implementation. | ✅ Same implementation, ported. |
| `getAIMode()` | ✅ Reflects what the user picked in the host. | ⚠️ Reflects what you passed (`ai_mode="static"` / `"dynamic"`) or what the loader defaulted to. |
| Discovery / distribution to players | ✅ Free distribution through the in-app Arcade once your cartridge is published. | ❌ You distribute yourself (Steam, itch.io, App Store, your website). The SDK has no store. |
| Update of the *game code* itself | ✅ Re-publish your cartridge bundle; players get the new version through `downloadAndCacheGame`. | ❌ You ship a new build of your app like any other native software. |
| Update of the *tree* (course) | ✅ Whatever tree the user has loaded — auto-current. | ✅ via `arb.refresh()` or `arb.subscribe(...)` in `from_share_code` mode; manual replace of the `.arborito` file otherwise. |
| Forum, social context, progress aggregation, certificates | ✅ Available to the surrounding Arborito UI (the cartridge does not currently call into it, but the player keeps everything). | ❌ Not exposed. The SDK is a curriculum reader; social features stay in the app. |
| Native graphics / audio / multi-threading / GPU | ❌ Whatever a sandboxed iframe in a modern browser can do. No `OffscreenCanvas` with workers across origins, no native bindings. | ✅ Anything Python and your chosen libraries allow (Pygame, Arcade, Pyglet, Godot bindings, PyTorch, OpenCV, native game engines via FFI). |
| Network access during gameplay | ⚠️ Only through the bridge (`ask.*`, `save`/`load`). Arbitrary `fetch` is allowed at the network layer but constrained by the parent's CSP and the iframe sandbox; relying on it is fragile. | ✅ Anything Python lets you do, subject to whatever consent you collected from the player. |
| Live Nostr sync of the tree (`subscribe`) | ⚠️ Implicit: when the user updates the active source in the app, the next `lesson.next()` reflects it. The cartridge has no explicit `subscribe()` event. | ✅ Explicit opt-in `arb.subscribe(on_update=...)`. |
| Closing / exiting | ✅ `exit()` closes the modal and returns the player to Arborito. | ❌ No-op. You manage your own window/loop. |
| Error reporting back to host | ✅ `window.onerror` and `unhandledrejection` auto-call `bridge.reportError(...)`. | ❌ Standard Python exceptions; you handle them. |

### Hard constraints unique to the cartridge

The Arcade iframe is created with this sandbox:

```
sandbox="allow-scripts allow-same-origin allow-popups allow-forms
         allow-pointer-lock allow-modals allow-popups-to-escape-sandbox"
allow="accelerometer; autoplay; clipboard-write; encrypted-media;
       gyroscope; picture-in-picture; gamepad"
allowfullscreen
```

So cartridges **can** use scripts, popups, forms, pointer lock, modals, fullscreen, gamepad/accelerometer/gyroscope, autoplay, picture-in-picture, encrypted media and `clipboard-write`. They **cannot**:

- Read the clipboard (`clipboard-read` is not granted).
- Use camera, microphone, or screen capture (no `camera`, `microphone`, `display-capture` permissions).
- Use geolocation, WebUSB, WebBluetooth, WebSerial, payment APIs (none granted).
- Navigate the top frame (`allow-top-navigation` is not in the sandbox list).
- Register service workers or open IndexedDB databases at their own origin — they run from `srcdoc`, so they have no stable origin of their own. The only persistent storage you have is `save(key, value)` (≤195 KB total per game).
- `import` from external CDNs — the cartridge bundler (`utils/game-bundle.js`) only follows **relative** module imports (`./foo.js`, `../bar.js`). Anything else (`import x from "https://…"`) is ignored at bundle time, so it will fail to resolve at runtime. Vendor your dependencies into the cartridge tree.
- Load `<img>` / `<audio>` / `<video>` / `<link>` from external URLs reliably in offline mode — they get rewritten to blob URLs from the cached bundle.

### Hard constraints unique to the Python SDK

- **You ship the runtime.** Players need a Python environment (or a frozen executable). Arborito's auto-installer does not extend to your game.
- **You ship the AI server.** If your game needs dynamic AI, the player needs `llama-server` from llama.cpp running locally. Bundle it, document it, or design for static mode only.
- **No signed identity.** The Python SDK has no link to the player's Arborito keypair. Any leaderboard, replay, or progress signature scheme is your responsibility — without it, your players cannot be authenticated as themselves on the broader Arborito network.
- **No automatic SRS feedback loop.** A player who reviews a card in your game will not see it as "reviewed" in Arborito's Care tab. If you want that, the player has to use the in-app player too.
- **Network use must be your own consent flow.** `from_share_code` / `from_nostr` and `subscribe` open `wss://` connections. The Arborito app gathers GDPR consent before doing this; your game has to do the equivalent. The SDK will happily run without ever touching the network — `from_arborito(...)` is the safe default for that.

### Decision guide

| If your game… | Pick |
|---------------|------|
| …should be discoverable inside Arborito and tap into the player's profile, SRS, XP, and AI for free. | **Cartridge (A)** |
| …needs to work with whatever tree the player happens to be studying. | **Cartridge (A)** |
| …must run on iOS / Android / native desktop, ship through a store, use heavy native graphics / audio / ML libs, or live outside a browser. | **Python SDK (B)** |
| …ships with a fixed curriculum the team controls (educational title, museum kiosk, classroom CD-ROM). | **Python SDK (B)** with `from_arborito` |
| …joins a public course by share code and should follow new releases by the publisher. | **Python SDK (B)** with `from_share_code` + `subscribe` |
| …combines the strengths (e.g. native trainer that also publishes back to Arborito SRS). | Not supported today. Pick one, accept the trade-off. |

Everything in this section is the current contract. If a row above moves from ❌ to ✅ in a future release (for example, a documented way to mint a guest identity in the SDK), this document is the place that will say so.

---

## Quiz V2 modalities: coverage today

Quiz V2 (the lesson questionnaire format authored in the app) has **five student-facing modalities** — the same ones the in-app Care/Study view rotates through:

| Mode | What the player does | Required fields on the challenge |
|------|----------------------|----------------------------------|
| `multiple` | Pick the correct option among the traps. | `main_question`, `correct_answer`, `traps[]` |
| `recall` | Recall the answer for a concept (then confirm against options). | `core_concept`, `correct_answer` |
| `cloze` | Fill in a blanked word from the definition. | `short_definition`, `cloze_indices[]` |
| `chips` | Tap words in the correct order to compose the answer. | `correct_answer` (multi-word) |
| `steps` | Tap procedural steps in the right order. | `steps[]`, `answer_mode: "steps"` |

Canonical reference: [`src/features/learning/api/quiz-schema.js`](../src/features/learning/api/quiz-schema.js) (`ALL_QUIZ_MODES`, `getPlayableModes`, `pickStudyQuizMode` — `modeIsPlayable` is the file-private predicate behind `getPlayableModes`).

### What the SDK exposes for game authors

The SDK (browser cartridge and Python) shares the same modality logic as the in-app Care/Study view. Canonical implementation: [`src/features/learning/api/quiz-schema.js`](../src/features/learning/api/quiz-schema.js) (imported in the host; inlined in [`inject-game-sdk.js`](../src/features/arcade/api/inject-game-sdk.js) for iframe cartridges).

| Capability | Browser (`window.arborito.challenge`) | Python (`api.challenge`) |
|------------|--------------------------------------|--------------------------|
| Read raw challenge (`modes`, `cloze_indices`, `steps`, …) | ✅ `fromLesson(lesson)` | ✅ `fromLesson(lesson)` |
| List playable modes on a challenge | ✅ `modes.playable(challenge)` | ✅ `modes.playable(challenge)` |
| Pick one mode (honours `modes:` line when narrowed) | ✅ `modes.pick(challenge, blockId, salt?)` | ✅ `modes.pick(challenge, blockId, salt?)` |
| Build a UI-neutral card for one mode | ✅ `modes.buildCard(challenge, mode, { lessonTitle, lang })` | ✅ `modes.buildCard(...)` |
| Pick + build in one call | ✅ `modes.buildStudyCard(challenge, blockId, opts)` | ✅ `modes.buildStudyCard(...)` |
| Quick multiple-choice items (Arcade-style) | ✅ `quiz(lesson, { count })` | ✅ `quiz(lesson, { count })` |
| Memory pairs (not a Quiz V2 mode) | ✅ `matchPairs(lesson, …)` | ✅ `matchPairs(lesson, …)` |
| Duel deck (multiple-choice only) | ✅ `buildDuelDeck(lesson)` | ✅ `buildDuelDeck(lesson)` |

**Exam nodes (`@exam`):** a single lesson node can contain **many** Quiz V2 blocks. Use `challenge.fromLesson(lesson)` and iterate every entry — do not rely on `lesson.challenge` alone (that field is only the first block).

### Example games and cartridges

| Surface | Modalities | Notes |
|---------|------------|-------|
| In-app Care/Study | All five | Reference UI in the main app. |
| Python `sdk/examples/quiz_game.py` | All five | Single CLI example; walks every challenge (including multi-question exams). |
| Cartridge `alonso-duel` | All five | Uses `window.arborito.challenge.modes.*` + duel-specific chrome in `card-modes.js`. |
| Cartridge `classroom-sim`, `firstjob` | `multiple` (via `quiz()`) | Plus `ask.json` in dynamic mode where applicable. |
| Cartridge `memory-garden` | All (extract-only) | "Pares" mode uses `matchPairs`; "Repaso" mode reads `challenge.fromLesson` to surface a flip-card prompt/answer per challenge (no interactive Quiz V2 UI). |
| Cartridge `starship` | — | Narrative via `ask.json`. |

### What this means if you are building a game

- **All five modes:** call `challenge.modes.buildCard(...)` (or `buildStudyCard`) per challenge. The Python example `quiz_game.py` shows a minimal terminal renderer.
- **Multiple-choice only is enough:** `quiz()` remains the shortest path (~10 lines).
- **Many questions in one node:** loop `challenge.fromLesson(lesson)` — typical for `@exam` nodes authored in Construction mode.

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
| `raw` | string (full lesson content with @tags) |
| `challenge` | object (first Quiz V2 questionnaire) |
| `challenges` | array (all Quiz V2 questionnaires on the lesson) |
| `meta` | `{ tags }` |
| `memoryHealth` | number (0–1, SRS health — Arborito's own judgement) |
| `memoryDue` | boolean (true when the SRS engine has scheduled a repeat) |

---

## AI mode: `getAIMode()`

Returns `'static'` (Quiz V2 only, no LLM) or `'dynamic'` (AI helpers available). Check before calling `ask.*`.

---

## Challenge helpers: `challenge`

| Method | Description |
|--------|-------------|
| `isComplete(challenge)` | True when Quiz V2 has enough fields for static games. |
| `getCompleteness(challenge)` | `{ complete, score, total }`. |
| `fromLesson(lesson)` | All questionnaires: `lesson.challenges` or `[lesson.challenge]`. |
| `template()` | Empty Quiz V2 object. |
| `buildDuelDeck(lesson)` | Alonso Duel cards from the lesson questionnaire. |

### `challenge.modes` (all five Quiz V2 modalities)

| Method | Description |
|--------|-------------|
| `modes.ALL` | `['multiple','recall','cloze','chips','steps']` |
| `modes.playable(challenge)` | Modes that have enough data on this challenge. |
| `modes.pick(challenge, blockId, salt?)` | Pick one mode (respects the `modes:` line when narrowed). |
| `modes.buildCard(challenge, mode, { lessonTitle, lang, optionCount })` | UI-neutral card data: `question`, `correct`, `options` or `sequence`/`chips`. |
| `modes.buildStudyCard(challenge, blockId, opts)` | `pick` + `buildCard` in one call. |
| `modes.label(mode, lang)` | Translated mode name (`'cloze' → 'Hueco'` / `'Fill blank'`). Falls back to the mode key. |
| `modes.className(mode)` | CSS class fragment (`' is-mode-cloze'`) to attach to your card root for per-mode styling. Empty string for unknown modes. |
| `modes.isOrdering(card)` | `true` when the card is `chips` or `steps` (the player drags pieces into order instead of picking one option). Use it to branch your answer UI. |
| `modes.checkOrder(card, picked)` | `true` when the `string[]` the player ordered matches `card.sequence`. |
| `modes.renderAnswers(card, { showOpts, optsDisabled, lang })` | Returns ready-to-inject HTML for the answer area: chips for ordering modes, buttons for multiple-choice. Paste inside your card host and wire `click` listeners on `.opt-btn` / `.seq-chip` / `.seq-submit`. **Browser only.** |

Python parity: only `label` is mirrored. The other helpers (`className`, `isOrdering`, `checkOrder`, `renderAnswers`) are convenience for HTML cartridges; Python engines render their own UI on top of `buildCard`'s data.

---

## Platform helpers: `platform` (browser cartridges only)

Things every cartridge needs anyway: a tap handler that doesn't fire twice on mobile, knowing the screen size, and HTML-safe text. Calling them is one line; nothing crosses the bridge to the host.

| Method | Description |
|--------|-------------|
| `platform.onTap(el, handler)` | Attach a tap/click handler that fires **once** even on touch devices (no ghost click after `touchend`). Returns a `cleanup()` function — call it on game exit / element removal. |
| `platform.getScreenSize()` | `{ width, height }` of the usable area, rounded. Uses `visualViewport` when available so the value reflects mobile browser chrome and the soft keyboard. |
| `platform.onScreenChange(callback, observeTargets?)` | Run `callback` whenever the screen resizes, the device rotates, or any element in `observeTargets` changes size. Coalesced via `requestAnimationFrame`. Returns a `cleanup()` function. |
| `platform.escapeHtml(s)` | Escape `&`, `<`, `>` so user / lesson text is safe inside `innerHTML`. |
| `platform.escapeAttr(s)` | Escape `&`, `<`, `>`, `"`, `'` so values are safe inside HTML attributes. |

```javascript
const offTap   = window.arborito.platform.onTap(myButton, () => playRound());
const offScrn  = window.arborito.platform.onScreenChange(() => layout(), [canvas]);
const { width, height } = window.arborito.platform.getScreenSize();
// On game exit:
offTap(); offScrn();
```

Python SDK: not present. Desktop / CLI engines own their own input loop.

---

## Lesson meta: `lesson.readMeta(lesson)` / `meta.read(lesson)`

Returns `{ tags }` parsed from the leading `@info … @/info` block of the lesson markdown (`tags: a, b`). Spaced-repetition status is **not** an authoring flag — Arborito's SRS engine decides which lessons are due (`memory.due()` / `memory.getStatus(lessonId)`).

---

## AI: `ask`

### `ask.json(prompt, onComplete?, options?)`

- Sends a **user** message to the host LLM with JSON-only instructions appended by the implementation.
- Returns **parsed JSON** (object or array).
- Optional `onComplete(result)` callback for code that prefers callbacks over `await`.

**Browser `options` (optional):**

| Option | Default | Description |
|--------|---------|-------------|
| `timeoutMs` | `90000` | Request timeout. |
| `maxAttempts` | `3` | Retries when the model returns non-JSON or malformed JSON (not used for Sage/timeout/empty errors). |

### `ask.chat(messages, contextNode?)`

Full chat; returns provider-specific result. Host uses `aiService.chat()` (native llama.cpp on desktop, Expert API in browser).

### Helpers

- `quiz(lesson, { count?, askOptions? })` — classroom-style Q/A array.
- `matchPairs(lesson, { count?, askOptions?, fillFromCurriculum? })` — `{ t, d }[]` pairs. Each card **face** is unique (no duplicate text on the board). In static mode, one Quiz V2 questionnaire yields one **topic union** per lesson; when `fillFromCurriculum` is true (default), pairs from **following** lessons in the Arcade playlist are merged until `count` is reached (Memory Garden uses this to avoid empty grid slots). Set `fillFromCurriculum: false` to use only the current lesson.

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
| `memory.getStatus(nodeId)` | SRS status `{ health, interval, isDue, … }`. |
| `memory.isDue(nodeId)` | Boolean shortcut for due check. |
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

## Python SDK (`arborito-games/sdk/`)

Package: **`arborito-sdk`** — for **independent game creators** building outside the browser iframe (Pygame, CLI, backend tools). The full contract — including how the developer (vs the player) chooses which tree powers the game — lives in [Selecting the curriculum source](#selecting-the-curriculum-source-which-tree-powers-your-game) above; this section is the quick reference.

| Loader | Method | Typical mode |
|--------|--------|--------------|
| Exported tree | `Arborito.from_arborito("course.arborito", lang="ES")` | `static` (Quiz V2). Default offline path. |
| Static `data/` folder | `Arborito.from_static_data("/path/to/data", lang="EN")` | `dynamic` (local llama.cpp server) or `static`. Use this when the tree was exported as a static site rather than packaged into a single `.arborito` file. |
| Public share code | `Arborito.from_share_code("ABCD-EF23", lang="ES", relays=None)` | `static` (or `dynamic` if `llama-server` is reachable). Fetches the bundle over Nostr; one-shot by default, opt into live updates with `arb.subscribe(on_update=...)`. |
| Direct Nostr address | `Arborito.from_nostr(pub, universe_id, lang="ES", relays=None)` | Same as `from_share_code`, but skips the code-resolution step when you already know the publisher. |

- **`lesson` / `ask.json` / `quiz` / `matchPairs` / `challenge` / `getAIMode()`:** same names as `window.arborito`; curriculum text matches the Arcade.
- **`challenge.modes`:** `playable`, `pick`, `buildCard`, `buildStudyCard` — all five Quiz V2 modalities (see [Quiz V2 modalities](#quiz-modalities-coverage-today)).
- **Static mode:** `quiz()` and `matchPairs()` read Quiz V2 from lessons (no LLM). Set `ai_mode="static"` or use `from_arborito`.
- **Dynamic mode:** `ask.json` calls a local **llama.cpp** server (`llama-server`) over the OpenAI-compatible `/v1/chat/completions` endpoint. Configure via `LLAMA_CPP_HOST` (default `http://127.0.0.1:8080`) and optionally `LLAMA_CPP_MODEL`.
- **Network defaults:** `from_share_code` / `from_nostr` connect to the same Nostr relays the Arborito app uses by default (independent operators in Germany / EU). Override per-call with `relays=[...]` or globally with the `ARBORITO_NOSTR_RELAYS` environment variable. See [`NOSTR_RELAYS_CONFIGURATION.md`](./NOSTR_RELAYS_CONFIGURATION.md).
- **Live updates:** `arb.subscribe(on_update=fn)` / `arb.unsubscribe()` keep the tree in sync with the publisher's latest bundle; signature is verified against `ownerPub` before any replacement. Bundles never auto-apply mid-frame — the callback is the signal, your game decides when to swap. `arb.refresh()` does the same check once without holding open connections.
- **`xp`**, **`save` / `load`**, **`memory.report`:** stubs offline — implement persistence in your game.

Install and demo: see [`arborito-games/sdk/README.md`](../../arborito-games/sdk/README.md).

```bash
cd arborito-games/sdk && pip install -e .
python3 examples/quiz_game.py --arborito /path/to/course.arborito --lang ES
```
