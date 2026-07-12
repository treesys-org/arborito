# Quizzes and exams

How interactive questionnaires work in Arborito, for authors and developers.

## Two different things

| Concept | What it is | Where you define it |
|---------|------------|---------------------|
| **Quiz block** | Interactive questions inside lesson prose | `@quiz` … `@/quiz` in a `.md` file |
| **Exam node** | A special lesson in the course tree | Folder + `type: exam` in the tree (not a markdown block) |

There is **no** `@exam` block. Exams are normal markdown lessons that contain `@quiz` blocks; the tree marks the node as an exam.

## Quiz blocks (`@quiz`)

Place a fenced block in any lesson section:

```markdown
@quiz
concept: Greetings
definition: Common ways to say hello in Spanish.
question: How do you say "hello" informally?
answer: Hola
traps: Adiós, Gracias
modes: multiple, recall
@/quiz
```

### Multi-question block

Use `items:` for several questions in one block:

```markdown
@quiz
concept: Basics
items:
  - question: ...
    answer: ...
    traps: ...
  - question: ...
    answer: ...
@/quiz
```

Each `@quiz` block becomes a **TOC row** (syllabus item). Learners must pass it (all answers correct) before the outline marks that section complete.

### Practice modes

Fields like `modes`, `steps`, `cloze_indices`, `traps` control how the question is played. See [CONTRIBUTING.md](../CONTRIBUTING.md#quiz--the-lesson-questionnaire-five-practice-modes).

## Exam nodes (`type: exam`)

An exam is a **graph node**, like a lesson leaf, with `type: exam` in `tree.json` (or equivalent manifest).

```
modules/
  03-final/
    exam/          ← node type: exam
      lesson.md    ← normal markdown + @quiz blocks
```

### Learner flow

1. Open exam → intro screen (“Start evaluation”).
2. TOC is locked until start; then sections work like a lesson (one at a time).
3. Each section can have prose + `@quiz` blocks.
4. Quizzes are attempted once per run (no retry mid-exam).
5. Closing the exam before the final summary **loses progress** on that attempt.
6. Final results appear after the last section.

### Authoring tips

- Use the same `@quiz` syntax as lessons.
- Split content with `@section` / headings so each topic is one TOC step.
- Put `@info` metadata (`title`, `description`, …) at the top of the file like any lesson.

## Bundled author guides (export)

When you **export** a course (Forest → Branches → Export → `.arborito`), Arborito packs a ZIP. Inside `files/`:

| File | When included |
|------|----------------|
| `EXPORT-GUIDE.txt` | Always: short pointer (language matches **app UI** at export time) |
| `AUTORIA.md` | Spanish UI (`ES`): full author reference in Spanish |
| `AUTHOR-GUIDE.md` | English UI (`EN`): same content in English |

**Important:** The guide language follows the **Arborito interface language when you export**, not the course’s `lessons/ES` vs `lessons/EN` folders. A bilingual course still gets one author guide file per export.

Unzip the `.arborito` → edit folders → re-import. The guide is for humans editing the ZIP by hand; repo dev docs stay in `docs/`.

## Related docs

- This file: quizzes vs exams
- [`AUTHOR-FORMAT.md`](AUTHOR-FORMAT.md): `.arborito` folder layout
- [`AUTHORING_WITHOUT_CLI.md`](AUTHORING_WITHOUT_CLI.md): in-app editing

## Progress persistence (lessons)

For normal lessons (not exams):

- Visited sections and **passed quizzes** are saved locally when you close the lesson.
- Reopening shows completed TOC ticks even if you did not finish the whole lesson.
- You can **practice again** on a completed quiz without losing the completed tick.

Exam attempts are **not** resumed after close. You start fresh.

## Related code

| Area | File |
|------|------|
| Quiz parsing | `src/features/learning/api/quiz-schema.js` |
| Exam detection | `src/features/learning/api/exam-context.js` |
| TOC + completion | `src/features/learning/api/content-toc.js` |
| Panel state | `src/features/learning/hooks/useContentPanel.jsx` |
| Inline quiz UI | `src/features/learning/components/InlineQuizBlock.jsx` |
