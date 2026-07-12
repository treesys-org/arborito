# Python SDK

The **Python SDK** is a **separate repository**: **[`arborito-sdk`](https://github.com/treesys-org/arborito-sdk)**.

| | Arcade SDK (browser) | Python SDK |
|---|---------------------|--------------|
| Package | Injected as `window.arborito` | `pip install arborito-sdk` (or install from Git) |
| CLI | — | `arborito-sdk` |
| Use | HTML cartridges in [arborito-games](https://github.com/treesys-org/arborito-games) | Pygame, CLI, bots, desktop apps |
| Games repo | [`arborito-games`](https://github.com/treesys-org/arborito-games) | This package + `examples/` |

## Install

**PyPI** (after first tagged release `v0.1.0`):

```bash
pip install arborito-sdk
```

**Git** (works today):

```bash
pip install git+https://github.com/treesys-org/arborito-sdk.git
```

**Local dev** (monorepo sibling):

```bash
cd ../arborito-sdk
pip install -e ".[dev]"
pytest tests/ -q
```

## CLI

```bash
arborito-sdk info course.arborito
arborito-sdk lessons course.arborito
arborito-sdk quiz course.arborito --rounds 10 --lang ES
arborito-sdk info --code ABCD-EF23
```

## Library

```python
from arborito_sdk import Arborito

api = Arborito.from_arborito("course.arborito", lang="ES")
lesson = api.lesson.at(0)
card = api.challenge.modes.buildCard(
    api.challenge.fromLesson(lesson)[0],
    "cloze",
    lang="ES",
)
```

## Examples

- **Library demo:** `examples/minimal_quiz.py` — ~60 lines, one quiz card.
- **Interactive CLI:** `arborito-sdk quiz course.arborito --rounds 10 --lang ES`

## Loaders

| Method | Status |
|--------|--------|
| `Arborito.from_arborito("file.arborito")` | ✅ |
| `Arborito.from_library("data/")` / `from_static_data(...)` | ✅ |
| `Arborito.from_share_code("ABCD-EF23")` | ✅ Nostr (default relays) |
| `Arborito.from_nostr(pub, universe_id)` | ✅ Nostr direct URL |

Export from the app: **Forest → Branches → Export**.

## Related

- [`sdk-spec.md`](sdk-spec.md) — full contract (Arcade + Python)
- [`QUIZZES-AND-EXAMS.md`](QUIZZES-AND-EXAMS.md) — `@quiz` authoring

## CI (GitHub Actions)

In the **`arborito-sdk`** repo:

| Trigger | Workflow |
|---------|----------|
| Push to `main` | **SDK Quality** — wheel build + smoke tests |
| Git tag `vX.Y.Z` | **Publish to PyPI** (requires trusted publisher setup) |
| Manual | Actions → **SDK Quality** or **Publish to PyPI** → Run workflow |

**GitSync** pushes to GitHub only; it does **not** publish to PyPI. Bump `version` in `arborito-sdk/pyproject.toml`, sync, then push the matching git tag when ready for PyPI.
