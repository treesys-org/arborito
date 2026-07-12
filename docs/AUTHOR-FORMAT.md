# Author format reference

Human-readable spec for editing `.arborito` archives as folders and Markdown files.

**Full archive layout with branch and tree examples:** [`ARBORITO_ARCHIVE.md`](ARBORITO_ARCHIVE.md)

**Start here for quizzes vs exams:** [`QUIZZES-AND-EXAMS.md`](QUIZZES-AND-EXAMS.md) explains `@quiz` blocks and exam **nodes** (there is no `@exam` block).

**Bundled on export (for course authors, not dev docs):** [`src/shared/lib/author-format-guide.js`](../src/shared/lib/author-format-guide.js) → `files/AUTORIA.md` (Spanish) / `files/AUTOR-GUIDE.md` (English).

## Quick rules

1. **Parallel `lessons/ES/…` and `lessons/EN/…`**: same numeric position (`01/02`) links translations. No JSON map.
2. **Title = text after `NN -`** in folder and file names. Optional `@info` in lesson `.md` when the filename is not enough.
3. **Optional `README.md`** in a module folder (intro) or `files/README.md` (course intro).

## Blocks inside a lesson `.md`

| Block / line | Purpose |
|--------------|---------|
| `@info` … `@/info` | Metadata: `title`, `icon`, `description`, `exam`, `discussion`, `tags` |
| `@quiz` … `@/quiz` | Interactive questionnaire (Care, Arcade, inline practice) |
| Exam node (`type: exam` in tree) | Final evaluation: same `@quiz` blocks inside; see [QUIZZES-AND-EXAMS.md](QUIZZES-AND-EXAMS.md) |
| `@section` / `@subsection` / `@image` / `@video` / `@audio` / `@game` | Fenced blocks (`@tag` … `@/tag`) with `key: value` lines |

See the lesson questionnaire section in [CONTRIBUTING.md](../CONTRIBUTING.md#quiz--the-lesson-questionnaire-five-practice-modes) for mode fields (`concept`, `definition`, `traps`, `steps`, …).

## Import validation

On import, Arborito lists non-blocking **authoring notes** (empty quizzes, unclosed `@quiz`, missing bilingual pairs, unknown `@info` keys). The tree still loads.

## Related

- [AUTHORING_WITHOUT_CLI.md](AUTHORING_WITHOUT_CLI.md), in-app workflow
- [sdk-spec.md](sdk-spec.md), `lesson.meta.tags` for game cartridges
