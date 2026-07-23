# Arborito game SDK: contract (language-neutral)

This document describes the **logical API** for **browser cartridges** (`window.arborito`, Arcade SDK) and the **Python SDK** in [`arborito-sdk`](https://github.com/treesys-org/arborito-sdk) (`arborito_sdk`, CLI **`arborito-cli`**).

**This `arborito` app repo** implements the browser Arcade SDK. The Python package lives in **`arborito-sdk`**. See [`PYTHON_SDK.md`](PYTHON_SDK.md).

> **AI is optional.** Lessons can ship pre-authored questionnaires (Quiz V2 `@quiz` blocks) and most cartridges run entirely in **static mode** by reading them with `challenge.fromLesson(..)`. The `ask.*` family is an *upgrade* for users who configured a local LLM (Sage / llama.cpp), gate it on `getAIMode() === 'dynamic'` and always provide a static fallback. A perfectly good Arborito game makes zero AI calls.

Implementations:

| Surface | Where | Notes |
|--------|--------|------|
| Browser iframe | `arborito/src/features/arcade/api/inject-game-sdk.js` | Injected by `useGamePlayerModal.js`; talks to `window.parent.__ARBORITO_GAME_BRIDGE__`. |
| Python (stdlib) | **[`arborito-sdk`](https://github.com/treesys-org/arborito-sdk)** → `arborito_sdk` | Same logical API as the browser (Arcade names stay camelCase; quiz/ask helpers prefer `snake_case` with aliases). CLI: **`arborito-cli`**. See [`PYTHON_SDK.md`](PYTHON_SDK.md). |

**Lesson blocks (authoring):** `@quiz`, `@game` (Arcade URL), `@info` (tags). Narrative scenes use **YAML frontmatter** on lessons (`scene_id`, `progress_details`, …), not a separate `@story` tag. SDK: `narrative.start()` / `narrative.advance()` in **both** Arcade and Python (library API). CLI study uses `read` / `quiz`; CLI authoring uses **`edit`** (enriched TUI with `[tui]`, or `edit --raw` for `$EDITOR`).

**Nostr kinds (maintainers):** canonical spec in `arborito-sdk/nostr_spec/spec.json`; regenerate with `python arborito-sdk/scripts/generate_nostr_spec.py --app`.

---

## Selecting the curriculum source (which tree powers your game)

Arborito games never embed a course themselves. Each game is a small renderer that asks the host for lessons. **Where those lessons come from depends entirely on the surface you target.** Pick one of the two modes below, the API surface is the same, but who chooses the source is not.

### A. Browser cartridge (Arcade, inside the Arborito app)

The **user** picks the tree, not the game. The flow is:

1. The user opens Arborito and switches to one of their local or public trees (the "active source").
2. The user opens a module (any non-leaf node) and launches a game from the in-app Arcade.
3. The host (`useGamePlayerModal.js`) collects every leaf and `@exam` node under the selected module into an ordered **playlist** and starts the cartridge.
4. The cartridge calls `window.arborito.lesson.next()`, `.list()`, or `.at(i)` against that playlist via the bridge.

Practical consequences for cartridge authors:

- You **cannot** hard-code a tree, source URL, share code, or relay. The cartridge has no read access to the active source's identity, just to its lesson contents through the bridge.
- Design defensively: any tree may be loaded. Read `lesson.title`, use **`lesson.plainText(lesson)`** for NPC/UI prose (strips `@section`, `@quiz`, markdown). Use `lesson.text` for pre-cleaned body from the host, or `lesson.raw` / `lesson.content` only when you need full markdown. Read `lesson.challenge*` for quizzes and use `window.arborito.user.lang` to localize prompts. Never assume a specific subject or schema beyond the Lesson shape above.
- Use `challenge.isComplete(..)` / `getAIMode()` to fall back when a tree has no Quiz V2 data, instead of crashing.
- Cross-tree work is intentionally out of scope: a cartridge only ever sees the playlist of the module the user launched it from.

**Arcade catalog CDN:** when the host loads games from `cdn.jsdelivr.net/gh/treesys-org/arborito-games@main/…`, it rewrites `@main` to the **latest GitHub commit SHA** (short TTL cache in `arcade-games-cdn.js`) so edge caches do not serve stale cartridge JS after a merge. Cartridge authors should bump `meta.json` `version` when behaviour changes.

If your game **needs a fixed curriculum** (e.g. a Pygame title that ships with one course), ship it as a Python SDK app instead, see B.

### B. Python SDK (independent games and apps, outside the browser)

The Python SDK is the **extra surface** for games and tools that do not run inside Arborito's iframe (Pygame, CLI, bots, kiosks, native desktop). The **developer** picks the tree at startup: a file, a static folder, or a public Nostr share code. The same package also ships **`arborito-cli`** with optional Nostr account and publish (`pip install 'arborito-sdk[nostr]'`).

Three loaders are supported:

| Loader | Constructor | What you provide | When to use |
|--------|-------------|------------------|-------------|
| Exported tree file | `Arborito.from_arborito("course.arborito", lang="ES")` | A `*.arborito` archive exported from the app (**Sources → branch → Export**). It is a **ZIP** with `manifest.json` (`meta.titles` / `meta.descriptions` per curriculum language) plus one markdown file per lesson under `lessons/<LANG>/…` (quizzes/games live inside the markdown as `@quiz` / `@game` blocks). | Shipping a frozen course bundled with your game. **Default offline path**: no network call. |
| Static `data/` folder | `Arborito.from_static_data("/path/to/data", lang="EN")` | A directory laid out like Arborito's static HTTPS source (`meta.json`, lesson markdown, optional `arborito-index.json`). | When the same tree is also self-hosted as a static site and you want both to read from one source on disk. |
| Public Nostr share code | `Arborito.from_share_code("ABCD-EF23", lang="ES", relays=None)` | An 8-character public **share code** (format `XXXX-XXXX`, alphabet `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`) that some other Arborito user published from their app. Optionally a list of `wss://` relay URLs; otherwise the SDK uses the same defaults as the app (Germany / EU). | Joining a tree someone publishes publicly on Nostr, typically because the player (not you) typed the code, or because you want the latest published version instead of pinning a file. **Requires network and user consent.** |

#### How the share code resolves under the hood

For transparency (the SDK is just a thin client over the same protocol the app uses):

1. The code is normalized to `XXXX-XXXX` and turned into the `d` tag of a `KIND_TREE_CODE` addressable event.
2. The SDK queries the configured relays for that event and gets back `{ ownerPub, universeId, recommendedRelays }`. The signature is verified before anything else is done with it.
3. The SDK then loads the **format v2 chunked bundle** authored by `ownerPub` for `universeId` from those relays (metadata first, lesson bodies and release snapshots on demand). See [`NETWORK.md`](./NETWORK.md#publishing-bundle-v2).
4. From this point on, `lesson.next()`, `quiz(..)`, `matchPairs(..)`, etc. work identically to the file-based loaders.

If you already know the publisher's pub key and the universe id (e.g. for a tree your organization owns), you can skip the share-code lookup and pass them directly: `Arborito.from_nostr(pub, universe_id, lang="ES", relays=None)`. Useful for CI, automation, or first-party deployments where the share-code roundtrip is just overhead.

#### Recommended workflow to assign a specific tree to your game

Pick whichever fits your game; both are valid.

**Option 1, Pinned `.arborito` file (default, offline-friendly):**

The shortest honest path from "I want my game to use course X" to "the SDK is reading it":

1. **Open the tree in Arborito** (or author it there). This can be your own local tree or one you joined via share code / Nostr, the app normalizes both into your local garden.
2. **Export it** from **Sources → select branch → Export**. You get an `arborito-branch-<name>.arborito` file with the **current** curriculum (release snapshots never travel inside the ZIP, pin versions by re-exporting when you cut a release).
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

**Option 2, Public share code (live tree from Nostr):**

When the course the game targets is **someone else's published tree** (or your own published tree that you want to keep updated without re-shipping the game), use the share code path:

```python
from arborito_sdk import Arborito

arb = Arborito.from_share_code("ABCD-EF23", lang="ES")

for lesson in arb.lesson.iter():
 render(lesson.title, lesson.text)
 play_round(arb.quiz(lesson, count=3))
```

What this implies (be explicit with your players):

- The SDK opens `wss://` connections to the same Nostr relays the Arborito app uses by default (independent operators in Germany / EU; the deployment owner can override the list, see [`NETWORK.md`](./NETWORK.md#nostr-relays)).
- The relay operators (and any passive observer of the network) see that the player's IP requested a public tree. They do **not** see who the player is unless your game additionally identifies them; the SDK never sends an Arborito identity by itself.
- You, as the game developer, are responsible for asking the player for consent before the first network call. Mirror what Arborito's onboarding does ("network activity is opt-in, defaults are EU operators, you can stay offline"). Pinned `.arborito` mode is the natural fallback for players who refuse network use.

#### Live updates (opt-in)

`from_share_code(..)` and `from_nostr(..)` are **one-shot fetches by default**: the SDK pulls the current bundle once and then reads from memory like the file-based loaders. To keep the tree synchronized as the publisher pushes new versions, subscribe explicitly:

```python
arb = Arborito.from_share_code("ABCD-EF23", lang="ES")

def on_tree_update(info):
 # info: { "version": str, "updated_at": int, "added": [..], "changed": [..] }
 # Called when the same ownerPub publishes a newer bundle for universeId.
 refresh_game_menu()

arb.subscribe(on_update=on_tree_update)
#.. later..
arb.unsubscribe()
```

Notes on the subscription:

- One persistent `wss://` connection per relay in the configured set, held while `subscribe(..)` is active. Closed cleanly on `unsubscribe()` or process exit.
- Only metadata changes wake the callback (new release snapshot, new top-level version). Lesson bodies stay lazy and are fetched on the next `lesson.next()` / `lesson.at(i)` that reaches a changed node.
- The SDK never auto-applies a new tree mid-frame. The callback is the **signal**; your game decides when it's safe to swap (between levels, on a save screen, etc.). Until you re-read from the SDK, players see the cached version.
- All bundles are signature-verified against `ownerPub` before they replace anything. A relay that returns a forged bundle is rejected silently and the previous tree stays in memory.

If you only need "check for updates at startup", call `arb.refresh()` once instead of subscribing, same verification, no long-lived connections.

#### Nostr authoring and account (CLI)

Reading public trees (`from_share_code` / `from_nostr` / `subscribe`) is available from the **library** API. Publishing and session login live on **`arborito-cli`** with the `[nostr]` extra:

| Command area | What it does |
|--------------|--------------|
| `session register` / `login` / `logout` / `whoami` | Arborito username + secret on Nostr (same model as the app). |
| `branch publish` | Signs and publishes a local `.arborito` branch (share code on first publish; republish updates the bundle). |

Construction WYSIWYG stays in the Arborito app; terminal authoring uses `edit` / `edit --raw`. See [`PYTHON_SDK.md`](PYTHON_SDK.md) and [arborito-sdk CLI.md](https://github.com/treesys-org/arborito-sdk/blob/main/CLI.md).

#### Game progress: library vs in-app host

A Python **game** process is not the Arborito UI. Same method names as the cartridge, different wiring:

| API | Browser cartridge | Python library |
|-----|-------------------|----------------|
| `memory.*` | Writes the player's Care / SRS schedule in the app. | In-process SM-2. With `api.login` + a Nostr tree (`from_share_code` / `from_nostr`), `memory.pull` / `push` / `sync` use the same encrypted Care envelopes as the app. |
| `xp(n)` | Increments profile XP in the host. | No host profile; call is ignored. |
| `save` / `load` | Per-game IndexedDB via the bridge (~195 KB cap). | Host shims only; persist with your own files / DB. |
| `exit()` | Closes the Arcade modal. | No modal; your loop owns shutdown. |

Pinned `.arborito` files do not embed release snapshots: replace the file when you cut a course release. On share-code loads, use `arb.release_snapshots()` when you need a specific published snapshot.

Forum, certificates, and the in-app source manager stay in the Arborito app. For games that must use the player's live profile and Care tab, ship a **browser cartridge (A)**.

---

## Capabilities and limits: cartridge (in-app) vs Python SDK

Both surfaces share the same **logical API names** (`lesson.*`, `quiz`, `matchPairs`, `ask.*`, `challenge.*`, `memory.*`, `xp`, `save`/`load`). What changes is **what those calls are actually wired to**, how the game is delivered, and what it is allowed to do at runtime. Read this before you commit to a surface.

### Side-by-side capabilities

Legend: ✅ first-class · ⚠️ supported with caveats · ❌ out of scope on this surface.

| Capability | Browser cartridge (Arcade) | Python SDK |
|------------|----------------------------|------------|
| Which tree is loaded | ❌ User picks the active source in the app and launches from a module. | ✅ Developer chooses at startup: `from_arborito` / `from_static_data` / `from_share_code` / `from_nostr`. |
| Cross-tree gameplay (mix multiple trees) | ❌ Cartridge only sees the current playlist. | ✅ Instantiate `Arborito` multiple times against different files / codes in the same process. |
| `user.username` / `user.avatar` from the app profile | ✅ Comes from `store.user`. | ⚠️ Pass your own values into the loader; optional CLI `session` for Nostr account (not auto-injected into every game process). |
| `user.lang` | ✅ Reflects the Arborito UI language. | ⚠️ You pass `lang="ES"` / `"EN"` to the loader. |
| SRS (`memory.due`, `memory.report`, `memory.getStatus`) | ✅ App Care schedule; reviews affect the Care tab. | ✅ In-process SM-2; with `login` + Nostr tree, `memory.pull` / `push` / `sync` share Care with the app. |
| Profile XP (`xp`) | ✅ Increments Arborito profile XP. | ❌ No host profile in a standalone process. |
| Per-game persistence (`save` / `load`) | ⚠️ Scoped to `gameId` in IndexedDB; hard cap **~195 KB per game**. Throws `GAME_QUOTA_EXCEEDED` past that. | ❌ Host shims; use local files / SQLite / your backend. |
| Publish course to Nostr | ✅ From the Arborito app (Sources / Construction). | ✅ `arborito-cli branch publish` with `[nostr]` (after `session` login when required). |
| Care progress on Nostr | ✅ Automatic when cloud sync is on. | ✅ Explicit `memory.pull` / `push` / `sync` after `api.login` (or CLI `session login`). |
| AI (`ask.json`, `ask.chat`) | ✅ Host `aiService`: native llama.cpp on desktop; Expert API in browser. | ⚠️ Local `llama-server` at `LLAMA_CPP_HOST` (default `http://127.0.0.1:8080`). You ship/start it; else static fallback. |
| Static-mode helpers (`quiz`, `matchPairs`, Quiz V2 parsing, `buildDuelDeck`) | ✅ Same implementation. | ✅ Same implementation, ported. |
| `getAIMode()` | ✅ Reflects what the user picked in the host. | ⚠️ Reflects what you passed (`ai_mode="static"` / `"dynamic"`) or what the loader defaulted to. |
| Discovery / distribution to players | ✅ In-app Arcade catalog once the cartridge is published. | ❌ You distribute the native/Python app yourself (stores, itch.io, your site). |
| Update of the *game code* itself | ✅ Re-publish the cartridge bundle; players get it through `downloadAndCacheGame`. | ❌ Ship a new build of your app. |
| Update of the *tree* (course) | ✅ Whatever tree the user has loaded. | ✅ `arb.refresh()` or `arb.subscribe(..)` in share-code mode; replace the `.arborito` file otherwise. |
| Forum, certificates, Discover index UI | ✅ Surrounding Arborito UI. | ❌ App surfaces; SDK focuses on curriculum + CLI publish/session. |
| Native graphics / audio / multi-threading / GPU | ❌ Sandboxed iframe limits. | ✅ Anything Python and your libraries allow. |
| Network access during gameplay | ⚠️ Prefer the bridge (`ask.*`, `save`/`load`); arbitrary `fetch` is fragile under CSP/sandbox. | ✅ Subject to the consent flow you collect from the player. |
| Live Nostr sync of the tree (`subscribe`) | ⚠️ Implicit when the user updates the active source; no cartridge `subscribe()` API. | ✅ Explicit `arb.subscribe(on_update=..)`. |
| Closing / exiting | ✅ `exit()` closes the modal. | ❌ Your process owns the window/loop. |
| Error reporting back to host | ✅ `window.onerror` / `unhandledrejection` → `bridge.reportError(..)`. | ❌ Standard Python exceptions. |

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
- Register service workers or open IndexedDB databases at their own origin, they run from `srcdoc`, so they have no stable origin of their own. The only persistent storage you have is `save(key, value)` (≤195 KB total per game).
- `import` from external CDNs, the cartridge bundler (`utils/game-bundle.js`) only follows **relative** module imports (`./foo.js`, `./bar.js`). Anything else (`import x from "https://…"`) is ignored at bundle time, so it will fail to resolve at runtime. Vendor your dependencies into the cartridge tree.
- Load `<img>` / `<audio>` / `<video>` / `<link>` from external URLs reliably in offline mode, they get rewritten to blob URLs from the cached bundle.

### Hard constraints unique to the Python SDK

- **You ship the runtime.** Players need a Python environment (or a frozen executable). Arborito's auto-installer does not extend to your game.
- **You ship the AI server** when using dynamic mode (`llama-server`), or stay on static Quiz V2 only.
- **Care tab sync.** In-process `memory.report` schedules reviews for that SDK instance. Call `api.login(username, secret)` then `memory.pull` / `push` / `sync` on a Nostr-backed tree to share schedules with Arborito Care (same packed progress events as the app).
- **Network consent.** `from_share_code` / `from_nostr` / `subscribe`, Care sync, and CLI publish open `wss://` connections; collect consent in your app the same way Arborito does before relays. Offline default: `from_arborito(..)`.

### Decision guide

| If your game… | Pick |
|---------------|------|
| …should be discoverable inside Arborito and use the player's profile, Care, XP, and host AI. | **Cartridge (A)** |
| …needs to work with whatever tree the player is studying. | **Cartridge (A)** |
| …must run native (Pygame, store build, heavy libs) or outside the browser. | **Python SDK (B)** |
| …ships with a fixed curriculum you control. | **Python SDK (B)** with `from_arborito` |
| …joins a public course by share code and follows publisher releases. | **Python SDK (B)** with `from_share_code` + `subscribe` |
| …publishes or maintains courses from the terminal. | **Python CLI** (`branch publish`, `session`, `edit`) with `[nostr]` / `[tui]` |
| …is a native trainer that should feed the same Care schedule as the Arborito app. | **Python SDK (B)** + `api.login` + `memory.sync` on a Nostr tree |

This section is the current contract for both surfaces.

---

## Quiz V2 modalities: coverage today

Quiz V2 (the lesson questionnaire format authored in the app) has **five student-facing modalities**: the same ones the in-app Care/Study view rotates through:

| Mode | What the player does | Required fields on the challenge |
|------|----------------------|----------------------------------|
| `multiple` | Pick the correct option among the traps. | `main_question`, `correct_answer`, `traps[]` |
| `recall` | Recall the answer for a concept (then confirm against options). | `core_concept`, `correct_answer` |
| `cloze` | Fill in a blanked word from the definition. | `short_definition`, `cloze_indices[]` |
| `chips` | Tap words in the correct order to compose the answer. | `correct_answer` (multi-word) |
| `steps` | Tap procedural steps in the right order. | `steps[]`, `answer_mode: "steps"` |

Canonical reference: [`src/features/learning/api/quiz-schema.js`](./src/features/learning/api/quiz-schema.js) (`ALL_QUIZ_MODES`, `getPlayableModes`, `pickStudyQuizMode`, `modeIsPlayable` is the file-private predicate behind `getPlayableModes`).

### What the SDK exposes for game authors

The SDK (browser cartridge and Python) shares the same modality logic as the in-app Care/Study view. Canonical implementation: [`src/features/learning/api/quiz-schema.js`](./src/features/learning/api/quiz-schema.js) (imported in the host; inlined in [`inject-game-sdk.js`](./src/features/arcade/api/inject-game-sdk.js) for iframe cartridges).

| Capability | Browser (`window.arborito.challenge`) | Python (`api.challenge`) |
|------------|--------------------------------------|--------------------------|
| Read raw challenge (`modes`, `cloze_indices`, `steps`, …) | ✅ `fromLesson(lesson)` | ✅ `fromLesson(lesson)` |
| List playable modes on a challenge | ✅ `modes.playable(challenge)` | ✅ `modes.playable(challenge)` |
| Pick one mode (honours `modes:` line when narrowed) | ✅ `modes.pick(challenge, blockId, salt?)` | ✅ `modes.pick(challenge, blockId, salt?)` |
| Build a UI-neutral card for one mode | ✅ `modes.buildCard(challenge, mode, { lessonTitle, lang })` | ✅ `modes.buildCard(..)` |
| Pick + build in one call | ✅ `modes.buildStudyCard(challenge, blockId, opts)` | ✅ `modes.buildStudyCard(..)` |
| Quick multiple-choice items (Arcade-style) | ✅ `quiz(lesson, { count })` | ✅ `quiz(lesson, { count })` |
| MC option building (correct answer always included) | ✅ `quiz.buildOptions(item, { count? })` | ✅ `quiz.buildOptions(item, count?)` |
| Curriculum quiz pool (deduped) | ✅ `quiz.pool({ count?, maxAttempts?, … })` | ✅ `quiz.pool({ count?, … })` |
| Session pick without repeats | ✅ `quiz.pick(pool, session)` | ✅ `quiz.pick(pool, session)` |
| Stable dedup key for a quiz item | ✅ `quiz.itemKey(item)` | ✅ `quiz.itemKey(item)` |
| Memory pairs (not a Quiz V2 mode) | ✅ `matchPairs(lesson, …)` | ✅ `matchPairs(lesson, …)` |
| Duel deck (multiple-choice only) | ✅ `buildDuelDeck(lesson)` | ✅ `buildDuelDeck(lesson)` |

**Exam nodes (`@exam`):** a single lesson node can contain **many** Quiz V2 blocks. Use `challenge.fromLesson(lesson)` and iterate every entry, do not rely on `lesson.challenge` alone (that field is only the first block).

### Example games and cartridges

| Surface | Modalities | Notes |
|---------|------------|-------|
| In-app Care/Study | All five | Reference UI in the main app. |
| Python `arborito-cli quiz` | All five | Interactive terminal session |
| Python `examples/minimal_quiz.py` | One card | Static quiz loop (~70 lines) |
| Python `examples/ai_tutor.py` | Chat | Dynamic AI via `ask.lesson_action` (~80 lines) |
| Cartridge `alonso-duel` | All five | Uses `window.arborito.challenge.modes.*` + duel-specific chrome in `card-modes.js`. |
| Cartridge `classroom-sim`, `firstjob` | `multiple` (via `quiz()`) | Use `quiz.pool` / `quiz.buildOptions` from the SDK; do not reimplement dedup in the cartridge. |
| Cartridge `memory-garden` | All (extract-only) | "Pares" mode uses `matchPairs`; "Repaso" mode reads `challenge.fromLesson` to surface a flip-card prompt/answer per challenge (no interactive Quiz V2 UI). |
| Narrative / visual-novel cartridges | `narrative.*` | YAML frontmatter scenes; in dynamic mode dialogue adapts to the active branch via `ask.lessonAction`. |

### What this means if you are building a game

- **All five modes:** call `challenge.modes.buildCard(..)` (or `buildStudyCard`) per challenge. The `arborito-cli quiz` command shows a minimal terminal renderer.
- **Multiple-choice only is enough:** `quiz()` remains the shortest path (~10 lines).
- **Many questions in one node:** loop `challenge.fromLesson(lesson)`, typical for `@exam` nodes authored in Construction mode.
- **Arcade-style rounds from the syllabus:** call `quiz.pool({ count })` then `quiz.pick(pool, usedSet)` for session dedup. Build on-screen options with `quiz.buildOptions(item)`: never roll your own shuffle that might drop the correct answer.
- **Fix quiz bugs in the SDK, not in cartridges.** If items repeat, options are wrong, or traps duplicate questions, patch [`game-sdk-lesson.js`](./src/features/arcade/api/game-sdk-inject/game-sdk-lesson.js) (browser) or `arborito-sdk/arborito_sdk/quiz_v2.py` (Python). Games should only add gameplay (scoring, UI, NPC logic).

See [Quiz helpers: `quiz`](#quiz-helpers-quiz) for the full contract.

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
| `branchProfile(lesson?, opts?)` | `Promise<object>` (browser) / `dict` (Python `branch_profile`) | Player profile + inferred branch study language (`learnLang`, `learnLangLabel`). Use before `narrative.start` or custom AI loops. |
| `branchContextForAi(lesson?, profile?)` | `Promise<string>` (browser) / `str` (Python `branch_context_for_ai`) | Full playlist + questionnaire samples for custom prompts (`ask.json`). |

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
| `memoryHealth` | number (0–1, SRS health, Arborito's own judgement) |
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

## Quiz helpers: `quiz`

The callable `quiz(lesson, opts)` is the entry point for quick multiple-choice items. The same function object also exposes helpers for **pool building**, **session dedup**, and **option lists**. Browser implementation: [`game-sdk-lesson.js`](./src/features/arcade/api/game-sdk-inject/game-sdk-lesson.js) (attached in [`game-sdk-api.js`](./src/features/arcade/api/game-sdk-inject/game-sdk-api.js)). Python: `arborito-sdk/arborito_sdk/quiz_v2.py` + `client.py`.

### Design rule: SDK owns quiz correctness

| Layer | Responsibility |
|-------|----------------|
| **SDK** | One item per challenge (not one per trap), dedup keys, curriculum pools, MC options that always include the correct answer when present |
| **Game cartridge** | When to ask, how many rounds, scoring, streaks, layout, NPC behavior, victory screens |

**Do not reimplement in a cartridge:**

- Walking `lesson.next()` with your own dedup sets
- Shuffling traps into options without guaranteeing the correct answer is in the list
- Expanding each trap into a separate quiz row (the SDK already expands challenges correctly; do not re-expand traps in the cartridge)
- Session-level “don’t repeat this question” tracking with ad-hoc keys

If any of the above is broken for **all** games, fix the SDK. Reference cartridges (`classroom`, `firstjob`) should only **delegate** to `quiz.pool`, `quiz.pick`, and `quiz.buildOptions`.

### `quiz(lesson, opts)`

Returns an array of `{ topic, q, correct, wrong, traps? }`.

| Option | Default | Description |
|--------|---------|-------------|
| `count` | `3` | Number of items to return from this lesson. |
| `askOptions` | (none) | Passed through to `ask.json` in dynamic mode (`timeoutMs`, `maxAttempts`). |

**Static mode:** items come from Quiz V2 questionnaires via `staticQuizFromLesson` (one item per challenge block; traps stay in `traps[]`). **Dynamic mode:** static items first, then AI fills remaining slots.

### `quiz.itemKey(item)`

Returns a stable lowercase key `lessonId::question` for deduplication. Use it only if you need custom pooling; prefer `quiz.pick` for session rotation.

### `quiz.buildOptions(item, opts?)`

Builds a shuffled multiple-choice list for one item.

| Option | Default | Description |
|--------|---------|-------------|
| `count` | `4` | Target option count (clamped 2–6). |

Collects distractors from `wrong`, `options`, and `traps`, dedupes case-insensitively, pads with harmless fallbacks if needed, and **always includes `correct`** when it is non-empty. Same rules as the host’s `buildOptionsPool` in [`game-quiz-cards.js`](./src/features/arcade/api/game-quiz-cards.js).

### `quiz.pool(opts?)`

Async (browser) / sync (Python). Walks `lesson.next()` until `count` items are collected or `maxAttempts` is exhausted.

| Option | Default | Description |
|--------|---------|-------------|
| `count` | `6` | Target pool size. |
| `maxAttempts` | `max(count × 4, 36)` | Upper bound on `lesson.next()` calls. |
| `uniqueLessons` | `true` | Skip a lesson id already used in this pool build. |
| `uniqueQuestions` | `true` | Skip duplicate `quiz.itemKey` values. |

On playlist wrap, the walker **continues** (it does not stop at the first repeated lesson id). Lessons without a playable questionnaire are skipped.

Returns `{ topic, q, correct, wrong, traps, options, lessonId }[]`: `options` mirrors `traps` for convenience.

### `quiz.pick(pool, session)`

Picks one item from `pool` without repeating until the pool is exhausted, then clears the session set and starts over.

- **Browser:** `session` is a `Set` of keys, or `{ used: Set }`.
- **Python:** `session` is a `set` of keys, or `{ "used": set }`.

Returns the chosen item or `null` / `None` when `pool` is empty.

### Examples

**Browser: six rounds, no repeats within a shift:**

```javascript
const pool = await window.arborito.quiz.pool({ count: 6 });
const used = new Set();
for (let round = 0; round < 6; round++) {
 const item = window.arborito.quiz.pick(pool, used);
 if (!item) break;
 const options = window.arborito.quiz.buildOptions(item, { count: 4 });
 // render question item.q and options …
}
```

**Python: same pattern:**

```python
pool = api.quiz.pool({"count": 6})
used: set[str] = set()
for _ in range(6):
 item = api.quiz.pick(pool, used)
 if not item:
 break
 options = api.quiz.buildOptions(item, count=4)
```

**When to use `challenge.modes` instead:** you need cloze, chips, steps, or recall, `quiz()` is multiple-choice shorthand only. For full Study parity, use `challenge.modes.buildCard` per challenge (see `arborito-cli quiz`).

---

## Platform helpers: `platform` (browser cartridges only)

Things every cartridge needs anyway: a tap handler that doesn't fire twice on mobile, knowing the screen size, and HTML-safe text. Calling them is one line; nothing crosses the bridge to the host.

| Method | Description |
|--------|-------------|
| `platform.onTap(el, handler)` | Attach a tap/click handler that fires **once** even on touch devices (no ghost click after `touchend`). Returns a `cleanup()` function, call it on game exit / element removal. |
| `platform.getScreenSize()` | `{ width, height }` of the usable area, rounded. Uses `visualViewport` when available so the value reflects mobile browser chrome and the soft keyboard. |
| `platform.onScreenChange(callback, observeTargets?)` | Run `callback` whenever the screen resizes, the device rotates, or any element in `observeTargets` changes size. Coalesced via `requestAnimationFrame`. Returns a `cleanup()` function. |
| `platform.escapeHtml(s)` | Escape `&`, `<`, `>` so user / lesson text is safe inside `innerHTML`. |
| `platform.escapeAttr(s)` | Escape `&`, `<`, `>`, `"`, `'` so values are safe inside HTML attributes. |

```javascript
const offTap = window.arborito.platform.onTap(myButton, () => playRound());
const offScrn = window.arborito.platform.onScreenChange(() => layout(), [canvas]);
const { width, height } = window.arborito.platform.getScreenSize();
// On game exit:
offTap(); offScrn();
```

Python SDK: not present. Desktop / CLI engines own their own input loop.

---

## Lesson meta: browser `lesson.readMeta(lesson)` · Python `lesson.read_meta(lesson)` / `meta.read(lesson)`

Returns `{ tags }` parsed from the leading `@info … @/info` block of the lesson markdown (`tags: a, b`). Spaced-repetition status is **not** an authoring flag, Arborito's SRS engine decides which lessons are due (`memory.due()` / `memory.getStatus(lessonId)`).

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
| `lesson` | (none) | Optional lesson object. When set, Sage receives that lesson as active game context (recommended whenever the prompt relates to a specific playlist item). |

Prefer **`lesson.contextForAi(lesson)`** in the prompt body and pass the same `lesson` here so Sage and the prompt stay aligned.

### Browser `lesson.byId(id)` · Python `lesson.by_id(id)`

Resolves full lesson content from a playlist node id (e.g. items from `quiz.pool` include `lessonId`). Returns `null` / `None` when not found.

### Browser `lesson.plainText(lessonOrRaw)` · Python (use cleaned `lesson["text"]`)

Returns **student-facing prose only**: strips `@info`, `@quiz`, `@section`, markdown headings, etc. Use for **dialogue, TTS, and HUD text** in narrative cartridges (Starship, Classroom NPC lines). Do **not** paste raw `lesson.raw` into UI.

| Field / method | Content |
|----------------|---------|
| `lesson.raw` / archive body | Full markdown as authored |
| `lesson.text` | Cleaned prose from host (games) |
| `lesson.plainText(x)` | Same cleaning, explicit API in browser |

### Browser `lesson.contextForAi(lesson)` · Python `lesson.context_for_ai(lesson)`

Compact lesson body + questionnaire block for custom AI prompts.

### Browser `quiz.gradeAnswer(…)` · Python `quiz.grade_answer(…)`

Grades one quiz item without reimplementing AI prompts:

1. Local answer match (`answersMatch` / `answers_match`)
2. In dynamic mode: grounded Sage / llama call with lesson context + author questionnaire facts first

`item`: `{ q, correct, topic?, complaint? }`. Use for open-text answers in Classroom, First Job, etc.

Browser: pass **`lesson`** in `ask.json` opts so Sage’s game-mode context matches the prompt. Python embeds context in the prompt automatically (no separate bridge param). Python opts: `timeout_ms`, `max_attempts`.

**Matching:** `answersMatch` / `answers_match` use the same normalization + Levenshtein fuzzy rules in both SDKs.

### `ask.chat(messages, contextNode?)`

Full chat; returns provider-specific result. Host uses `aiService.chat()` (native llama.cpp on desktop, Expert API in browser).

### Helpers

- `quiz(lesson, { count?, askOptions? })`: classroom-style Q/A array. See [Quiz helpers: `quiz`](#quiz-helpers-quiz) for `quiz.pool`, `quiz.pick`, `quiz.buildOptions`, and `quiz.itemKey`.
- `matchPairs(lesson, { count?, askOptions?, fillFromCurriculum? })`, `{ t, d }[]` pairs. Each card **face** is unique (no duplicate text on the board). In static mode, one Quiz V2 questionnaire yields one **topic union** per lesson; when `fillFromCurriculum` is true (default), pairs from **following** lessons in the Arcade playlist are merged until `count` is reached (Memory Garden uses this to avoid empty grid slots). Set `fillFromCurriculum: false` to use only the current lesson.
- `ask.lessonAction(lesson, playerSaid, { persona?, authorLine?, profile?, askOptions? })`: dynamic AI for games. JSON `{ output, success, matches_lesson }`. **`authorLine`**: optional fixed text from the lesson (story/dialog); the SDK adapts it to the active branch. **`playerSaid`**: what the player typed (can be empty). Author questionnaire facts are used first; AI only fills gaps. Set persona once via `ai.persona`.
- `ai.persona` / `ai.arborito`: string getter/setter for the dynamic-mode character prompt (e.g. *"You are a night wizard… ask about the dungeon secret"*).

---

## Game loop (challenge-first)

Games own their UI and scoring. The SDK provides lesson data and quiz primitives, **no** `play.boot()` session.

### Pick your path (minimal mental load)

| You are building… | Start here | Dynamic AI? |
|-------------------|------------|-------------|
| **Story / visual novel** | `narrative.start()` → loop `narrative.advance(profile, input)` | Optional: adapts author lines to the branch language and questionnaires |
| **Missions from questionnaires** (terminal, classroom, duel) | `challenge.tasksFromLesson(lesson)` + `quiz.matchesAny` | Optional: `quiz.gradeAnswer` for open text |
| **NPC or tutor chat** | `ask.lessonAction(lesson, playerSaid, { persona, authorLine? })` | Yes |
| **Multiple-choice rounds** | `quiz(lesson, { count })` or `quiz.pool` + `quiz.pick` | Fills missing slots from branch content |
| **Full custom AI** (any genre) | `ask.json(yourPrompt)` or `ask.chat(messages)` | Yes. you own the prompt |

**Content priority (always):** author questionnaires → lesson body → branch playlist → AI fills gaps. Teachers need only **one** complete questionnaire; games and dynamic AI reuse it.

### Design rule

| Layer | Responsibility |
|-------|----------------|
| **SDK** | Lessons, `challenge.fromLesson`, `challenge.tasksFromLesson`, `challenge.modes`, answer helpers (`quiz.matchesAny`, `quiz.findCodeReplay`), optional `ask.lessonAction` |
| **Game** | UI, scoring, art; build tasks from lessons and check answers in your loop |

### Minimal browser cartridge

```javascript
const lesson = await window.arborito.lesson.at(0);
const tasks = window.arborito.challenge.tasksFromLesson(lesson, { max: 10 });
let index = 0;
while (index < tasks.length) {
 const task = tasks[index];
 const line = await readLine(task.prompt || task.question);
 const hit = window.arborito.quiz.matchesAny(line, task.accept);
 if (hit.ok) {
 render(task.output || hit.matched);
 index += 1;
 }
}
```

Optional persona (dynamic mode only):

```javascript
window.arborito.ai.persona = 'You are a night wizard in a dungeon.';
```

### Dynamic AI: one helper for games

```javascript
// Player typed something. tutor / NPC / terminal
const res = await window.arborito.ask.lessonAction(lesson, playerSaid, {
 persona: window.arborito.ai.persona, // optional voice
});

// Story line written by the author. SDK adapts it to THIS branch (language, topics)
const res = await window.arborito.ask.lessonAction(lesson, authorLine, {
 authorLine, // same string: tells the SDK this is fixed lesson text, not player input
 persona: 'Guide',
 profile: await window.arborito.lesson.branchProfile(lesson),
});

console.log(res.output); // plain text to show the player
```

You do **not** choose modes like “adapt” or “reply”. Pass `authorLine` when you have scripted lesson text; omit it for free chat. The SDK uses questionnaires first and only invents what is missing.

For **total creative control** (custom genres, special JSON, your own prompts), use `ask.json(prompt)`: same AI backend, no guardrails beyond your prompt.

### Narrative games (frontmatter scenes)

Authoring: YAML frontmatter on lessons (`scene_id`, `progress_details`, `initial_narration`). Tag lessons with `@info` tags like `narrative` or `story` when needed.

```javascript
const profile = await window.arborito.lesson.branchProfile(await window.arborito.lesson.at(0), {
 playerName: window.arborito.user.username,
});

let packet = await window.arborito.narrative.start({
 playerName: profile.playerName,
 playerLang: profile.playerLang,
 learnLang: profile.learnLang,
});

while (packet.display_type !== 'END_OF_SCENE' && packet.display_type !== 'END_CHAPTER') {
 if (packet.display_type === 'CHOICE') {
 renderChoices(packet.choices);
 const pick = await readChoice();
 packet = await window.arborito.narrative.advance(packet.updated_profile, pick);
 continue;
 }
 if (packet.display_type === 'DIALOGUE' || packet.display_type === 'NARRATION') {
 showText(packet.content.text, packet.npc_data);
 const freeText = await readOptionalLine(); // empty = just advance
 packet = await window.arborito.narrative.advance(packet.updated_profile, freeText || null);
 continue;
 }
 packet = await window.arborito.narrative.advance(packet.updated_profile, null);
}
```

In **dynamic mode**, dialogue and narration lines are adapted to the active branch (e.g. German course vs English course) while keeping the same story structure. In **static mode**, authored text is shown as-is.

Set narrative voice once (dynamic mode):

```javascript
window.arborito.ai.persona =
 'You are a night wizard. Ask if the student knows the secret to open the dungeon.';
```

### Python SDK

`challenge.modes` and `challenge.tasksFromLesson` match the Arcade surface (camelCase). Quiz / ask helpers prefer `snake_case` (`quiz.matches_any`, `quiz.grade_answer`, `quiz.find_code_replay`, `ask.lesson_action`) and also expose camelCase aliases (`matchesAny`, `gradeAnswer`, `findCodeReplay`, `lessonAction`). Use `lesson.plainText(lesson)` for NPC / HUD prose (same role as the browser).

```python
lesson = api.lesson.at(0)
tasks = api.challenge.tasksFromLesson(lesson, {"max": 10, "lang": api.user.lang})
for task in tasks:
 line = input(task.get("prompt") or "")
 hit = api.quiz.matches_any(line, task.get("accept") or [])
 ok = hit["ok"]
```

Dynamic AI (same mental model as browser):

```python
profile = api.lesson.branch_profile(lesson)
res = api.ask.lesson_action(lesson, player_said, {"persona": "Guide", "profile": profile})
res = api.ask.lesson_action(lesson, author_line, {"authorLine": author_line, "profile": profile})
print(res["output"])
```

Python accepts both `branch_profile` / `branch_context_for_ai` and the Arcade names `branchProfile` / `branchContextForAi`.

Runnable examples in **`arborito-sdk/examples/`**:

| Script | Needs AI? | Shows |
|--------|-----------|-------|
| `minimal_quiz.py` | No | `challenge.modes.buildCard` + `quiz.matches_any` |
| `ai_tutor.py` | Yes (llama.cpp) | `ask.lesson_action` + `lesson.branch_profile` |

### Narrative (`narrative`)

Frontmatter-driven visual-novel scenes (YAML in lesson headers). **Same API** in browser and Python:

| Method | Description |
|--------|-------------|
| `narrative.start(moduleOrOpts?)` | Start narrative. Python: module name string. Browser: optional opts; uses active Arcade playlist. |
| `narrative.advance(profile, input?)` | Advance scene; returns packet with `display_type` (`NARRATION`, `DIALOGUE`, `CHOICE`, `END_OF_SCENE`, `END_CHAPTER`, `ERROR`). |

```javascript
let packet = await window.arborito.narrative.start({ playerName: 'Alex' });
while (packet.display_type === 'CHOICE') {
 packet = await window.arborito.narrative.advance(packet.updated_profile, choiceId);
}
```

```python
packet = api.narrative.start("Chapter 1", player_name="Alex")
packet = api.narrative.advance(packet["updated_profile"], None)
```

CLI study: `read`, `quiz` (no dedicated `narrative` command).

### Content priority (dynamic AI)

1. **Author questionnaire** (`staticQuizFromLesson` facts in the prompt)
2. **Lesson body + challenge fields** (`lessonContextBlockForAi`)
3. **Persona** (dev-defined scene. does not replace lesson grounding)

Teachers are **not** required to fill every Quiz V2 mode. One complete questionnaire is enough; games use whatever modes are playable and AI fills the rest in dynamic mode.

---

## Gamification & persistence

| API | Description |
|-----|-------------|
| `xp(n)` | Add experience in the Arborito host (browser cartridge). Ignored in a standalone Python process. |
| `save(key, value)` | Persist JSON-serializable data (browser: per-game IndexedDB). Python: host shim; use your own storage. |
| `load(key)` | Load value (browser). Python: host shim. |
| `exit()` | Close the Arcade modal (browser). Python: your process owns shutdown. |

---

## Memory (SRS)

| API | Description |
|-----|-------------|
| `memory.due()` | Node IDs due for review. |
| `memory.getStatus(nodeId)` | SRS status `{ health, interval, isDue, … }`. |
| `memory.isDue(nodeId)` | Boolean shortcut for due check. |
| `memory.report(nodeId, quality)` | Report recall quality `0–5`. |

Browser: updates Care in the host. Python: in-process SM-2; optional Care sync via `memory.pull` / `push` / `sync` after `api.login` on a Nostr-backed tree (`pip install 'arborito-sdk[nostr]'`).

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

## Python SDK (`arborito-sdk` / `arborito_sdk`)

Package: **`arborito-sdk`** (import `arborito_sdk`, CLI **`arborito-cli`**): for **independent game creators** building outside the browser iframe (Pygame, CLI, backend tools). Full contract: [Selecting the curriculum source](#selecting-the-curriculum-source-which-tree-powers-your-game).

| Loader | Method | Typical mode |
|--------|--------|--------------|
| Exported tree | `Arborito.from_arborito("course.arborito", lang="ES")` | `static` (Quiz V2). Default offline path. |
| Static `data/` folder | `Arborito.from_static_data("/path/to/data", lang="EN")` | `dynamic` (local llama.cpp server) or `static`. Use this when the tree was exported as a static site rather than packaged into a single `.arborito` file. |
| Public share code | `Arborito.from_share_code("ABCD-EF23", lang="ES", relays=None)` | `static`. Uses Arborito suggested relays by default; override with `relays=[..]` or `ARBORITO_NOSTR_RELAYS`. |
| Direct Nostr address | `Arborito.from_nostr(pub, universe_id, lang="ES", relays=None)` | Same as share-code path when you already know `pub` + `universeId`. |

- **`lesson` / `ask.json` / `quiz` / `matchPairs` / `challenge` / `getAIMode()`:** same logical API as `window.arborito` (quiz/ask helpers prefer `snake_case`, with camelCase aliases; `lesson.plainText` for NPC prose); curriculum text matches the Arcade.
- **`challenge.modes` / `challenge.tasksFromLesson`:** Arcade parity, `playable`, `pick`, `buildCard`, `buildStudyCard`, all five Quiz V2 modalities (see [Quiz V2 modalities](#quiz-modalities-coverage-today)).
- **Static mode:** `quiz()` and `matchPairs()` read Quiz V2 from lessons (no LLM). Set `ai_mode="static"` or use `from_arborito`.
- **Dynamic mode:** `ask.json` calls a local **llama.cpp** server (`llama-server`) over the OpenAI-compatible `/v1/chat/completions` endpoint. Configure via `LLAMA_CPP_HOST` (default `http://127.0.0.1:8080`) and optionally `LLAMA_CPP_MODEL`.
- **Network defaults:** `from_share_code` / `from_nostr` connect to the same Nostr relays the Arborito app uses by default (independent operators in Germany / EU). Override per-call with `relays=[..]` or globally with the `ARBORITO_NOSTR_RELAYS` environment variable. See [`NETWORK.md`](./NETWORK.md#nostr-relays).
- **Live updates:** `arb.subscribe(on_update=fn)` / `arb.unsubscribe()` keep the tree in sync with the publisher's latest bundle; signature is verified against `ownerPub` before any replacement. Bundles never auto-apply mid-frame. the callback is the signal; your game decides when to swap. `arb.refresh()` does the same check once without holding open connections.
- **Publish / session:** `arborito-cli` with `[nostr]`: `session register|login`, `branch publish` (share code on first publish).
- **Care sync:** `api.login` then `memory.pull` / `push` / `sync` (or CLI `memory pull|push|sync`) on a Nostr tree; same packed progress as the app.
- **`memory.*`:** in-process SM-2 (+ optional network sync above). **`xp` / `save` / `load`:** host shims (profile XP and IndexedDB belong to the Arborito app / cartridge).

Install and demo: see [`arborito-sdk` README](https://github.com/treesys-org/arborito-sdk/blob/main/README.md) and [`PYTHON_SDK.md`](PYTHON_SDK.md).

```bash
cd arborito-sdk && pip install -e ".[tui,nostr]"
arborito-cli branch import /path/to/course.arborito
arborito-cli branch open "My Course"
arborito-cli list
arborito-cli go 1
arborito-cli read # enriched blocks (default)
arborito-cli edit # TUI: F2 Quiz, Ctrl+S save
arborito-cli edit --raw # $EDITOR on markdown
arborito-cli ask "what is in this module?"
arborito-cli quiz course.arborito --rounds 10 --lang ES
# with session: arborito-cli branch publish
```

Additional Python-only conveniences: `branch`, `tree`, `cp`, `games`, `info`, `ask.with_context`, host-style CLI navigation (`list`, `go`). Lesson editor details: [arborito-sdk/CLI.md](https://github.com/treesys-org/arborito-sdk/blob/main/CLI.md).

No `lock` namespace. Arborito uses Nostr session login for private trees, not a separate branch lock API.
