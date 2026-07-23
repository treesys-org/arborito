# Python SDK

Package: **[arborito-sdk](https://github.com/treesys-org/arborito-sdk)** · version **0.2.2** (initial release)

## Who are you?

| You are… | Start here |
|----------|------------|
| **Python game / tool dev** | This doc + [arborito-sdk README](https://github.com/treesys-org/arborito-sdk) |
| **Arcade HTML cartridge dev** | [arborito-games](https://github.com/treesys-org/arborito-games) |
| **Course author (app)** | Arborito Construction mode. export `.arborito` |
| **Course author (terminal)** | `pip install 'arborito-sdk[tui]'` → `arborito-cli edit` |

## Install

```bash
pip install arborito-sdk
pip install 'arborito-sdk[tui]' # enriched terminal lesson editor
pip install 'arborito-sdk[nostr]' # account + publish
arborito-cli --help
```

## Quick start

The one pipeline: `list` → `go` → `read | edit | quiz | ask`

```bash
pip install 'arborito-sdk[tui]'
arborito-cli shell --fresh
branch import course.arborito
branch open "My Course"
list
go 1
read # enriched view (no raw @quiz fences)
edit # F2 Quiz, F3 Section, Ctrl+S save
quiz --rounds 5
```

```python
from arborito_sdk import Arborito

api = Arborito.from_arborito("course.arborito", lang="EN")
lesson = api.lesson.at(0)
card = api.challenge.modes.buildCard(
    api.challenge.fromLesson(lesson)[0], "multiple", lang="EN"
)
prose = api.lesson.plainText(lesson)

# Optional AI (needs local llama.cpp)
api = Arborito.from_arborito("course.arborito", lang="EN", ai_mode="dynamic")
res = api.ask.lesson_action(lesson, "What should I practice?", {"persona": "Guide"})
```

## Naming

Arcade surface methods keep **camelCase** (`fromLesson`, `buildCard`, `tasksFromLesson`) so Python and browser cartridges share one vocabulary. Python-style helpers use **snake_case** (`grade_answer`, `matches_any`, `branch_profile`); camelCase aliases are also available (`gradeAnswer`, `plainText`, …).

## CLI

| Area | Commands |
|------|----------|
| Interactive | `shell` or `arborito-cli course.arborito` (REPL) |
| Navigate | `list`, `go`, `search` |
| Lesson | `read` (enriched), `edit` (TUI / F2 Quiz), `edit --raw`, `games` |
| Study | `quiz`, `ask` |
| Branches | `branch list`, `branch add CODE`, `branch open "Name"`, `branch import`, `branch publish` |
| Trees | `tree list`, `tree open "Name"`, `tree import` |
| Copy | `cp branch "Name"` / `cp tree "Name"` |
| Account | `session register`, `session login`, `session whoami` |
| Memory | `memory due`, `memory report` |
| Config | `config relay …`, `config ai …` |

### Lesson editor (terminal)

| Command | What you see |
|---------|----------------|
| `read` | Structured blocks, not raw `@quiz` |
| `edit` | Block list + forms (**F2** Quiz, **F3** Section, **Ctrl+S** save) with `[tui]` |
| `read --raw` / `edit --raw` | Full markdown in terminal or `$EDITOR` |

Full key map: [arborito-sdk/CLI.md](https://github.com/treesys-org/arborito-sdk/blob/main/CLI.md).

## Library: `branch` vs `tree`

| | `branch` (course) | `tree` (playlist) |
|---|------------------|-------------------|
| Network | `branch add XXXX-XXXX` | (none) |
| Local | `branch import file.arborito` | `tree import file.arborito` |
| Open | `branch open "Name"` | `tree open "Name"` |
| Copy | `cp branch "Name"` | `cp tree "Name"` |

```python
from arborito_sdk import Arborito

api = Arborito.from_arborito("course.arborito", lang="EN")
lesson = api.lesson.at(0)
api.challenge.fromLesson(lesson)
api.challenge.tasksFromLesson(lesson, {"max": 10})
api.quiz.grade_answer(lesson, {"q": "…", "correct": "…"}, "student answer")
```

`api.narrative` exists for programmatic YAML scenes; the CLI uses `read` / `quiz` for study.

Parity with browser SDK: `lesson.by_id` / `byId`, `lesson.plainText`, `lesson.context_for_ai`, `challenge.tasksFromLesson`, `quiz.grade_answer`, `quiz.find_code_replay`, `ask.lesson_action` — see [`sdk-spec.md`](sdk-spec.md).

Examples: `examples/minimal_quiz.py` (static), `examples/ai_tutor.py` (AI tutor REPL).

## What you can build

| Project | API |
|---------|-----|
| Pygame action (cloze shields) | `challenge.modes` |
| Offline `.arborito` trainer | `from_arborito`, `challenge` |
| Discord SRS bot | `memory.due()`, `quiz()` |
| CI `@quiz` validator | `challenge.isComplete` |
| Terminal course editor | `arborito-cli edit` + `[tui]` |

## Authoring: three surfaces

| Surface | Editor | Best for |
|---------|--------|----------|
| **Arborito app** (Construction) | WYSIWYG | Most authors, publish to Nostr |
| **`arborito-cli edit`** | Enriched TUI / block forms | Terminal, scripts, local `.arborito` |
| **`edit --raw`** | `$EDITOR` on markdown | Power users, bulk search-replace |

Same file format everywhere: syllabus `@section` with `index:` + `title:` (nest depth = index segments), `@info`, `@quiz`, `@image`, `@game`. Construct TOC math lives in `arborito_sdk.lesson_toc_mutations` (parity with Arborito).

## Arcade vs Python

| Arcade (`arborito-games`) | Python SDK |
|---------------------------|------------|
| HTML cartridges in app | Pygame, bots, kiosk, CI |
| `window.arborito` | `import arborito_sdk` |
| `lesson.plainText()` for NPC dialogue | `lesson.plainText(lesson)` (same role) |

Maintainers: [arborito-sdk/CONTRIBUTING.md](https://github.com/treesys-org/arborito-sdk/blob/main/CONTRIBUTING.md).

## FAQ

**Does the CLI have a WYSIWYG editor like the app?** Not pixel-identical. `edit` with `[tui]` is a structured block editor. Full WYSIWYG stays in Construction mode. Advanced: `edit --raw` opens `$EDITOR` on the raw markdown.
