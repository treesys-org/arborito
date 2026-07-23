# Course authoring

How to create and edit content in Arborito without a terminal.

## Recommended flow (in the app)

1. Turn on **Construction** (helmet icon in the sidebar).
2. Tap a node on the map to edit it.
3. **Leaves** open the lesson editor; **folders** organize modules.
4. Use **Sage → Tour** for a step-by-step walkthrough.
5. Publish from the tree info modal when ready.

**Optional terminal:** `pip install 'arborito-sdk[tui]'` → `arborito-cli edit`. Same on-disk format. See [`PYTHON_SDK.md`](PYTHON_SDK.md).

## `.arborito` format (folders)

| Rule | Detail |
|------|--------|
| Languages | Parallel `lessons/ES/` and `lessons/EN/` with matching numbering (`01/02`) |
| Lesson / folder title | Text after `NN -` in folder/file names |
| Course title | `meta.titles` per language — in Construction, rename the **root** after switching curriculum language |
| Course blurb | Optional `meta.descriptions` per language |
| Course intro file | Optional `files/README.md` |

### Blocks inside a lesson `.md`

| Block | Purpose |
|-------|---------|
| `@section` + `index` + `title` | Syllabus / TOC row (nest depth = index segments, max 8) |
| `@info` … `@/info` | Metadata: title, icon, description, tags |
| `@quiz` … `@/quiz` | Interactive questions (Care, Arcade, practice) |
| `@image`, `@video`, `@audio`, `@game`, `@math` | Media, Arcade link, formula |
| Pipe table (`\| … \|`) | Comparison / data grid (hand-editable Markdown) |
| `{{lg}}` … `{{/lg}}` | Large in-lesson title (construct WYSIWYG) |
| Plain `##` / `###` | Content titles inside a section (not TOC once `index:` exists) |

Full syntax also ships as `files/AUTHOR-GUIDE.md` / `files/AUTORIA.md` on export. Archive layout: [`ARBORITO_ARCHIVE.md`](ARBORITO_ARCHIVE.md).

### Complete lesson example

One file using the usual authoring blocks together:

```markdown
@info
icon: 👋
description: Greetings and farewells for day one
tags: classroom, demo
discussion: https://forum.example.org/greetings
@/info

@section
index: 1
title: Hello
@/section

{{lg}}Hello{{/lg}}

Welcome. Today you learn how to greet someone.

@image
url: https://example.org/media/wave.png
caption: A friendly wave
@/image

## Useful phrases

| Phrase  | Use      |
| ------- | -------- |
| Hello   | Neutral  |
| Hi      | Casual   |
| Goodbye | Farewell |

@align: center
Say it out loud once.

@section
index: 1.1
title: Practice listening
@/section

{{lg}}Practice listening{{/lg}}

@audio
url: https://example.org/media/hello.mp3
@/audio

@video
url: https://www.youtube.com/watch?v=dQw4w9WgXcQ
@/video

@math
latex: E = mc^2
display: block
@/math

@section
index: 1.2
title: Quick check
@/section

{{lg}}Quick check{{/lg}}

@quiz
concept: Informal greeting
items:
  - question: How do you greet a friend informally?
    answer: Hi
    modes: multiple,recall
    traps:
      - Goodbye
      - Please
  - question: Complete: {Hello}, my name is Ana.
    answer: Hello
    modes: cloze,multiple
    traps:
      - Goodbye
      - Thanks
pass: 80
@/quiz

@section
index: 2
title: Play and review
@/section

{{lg}}Play and review{{/lg}}

Try the Arcade game, then come back to the quiz above.

@game
url: https://example.org/games/greetings.html
label: Greeting pairs
optional: yes
topics: classroom, memory
@/game
```

**How to read it**

| Part | Role |
|------|------|
| `@info` | Lesson metadata (not a TOC row) |
| `@section` + `index` + `title` | Temario / sidebar index (`1.1` nests under `1`) |
| `{{lg}}…{{/lg}}` | Large title inside the lesson body |
| Prose, lists, `##`, pipe tables | What the learner reads |
| `@image` / `@video` / `@audio` / `@math` / `@game` | Embeds |
| `@quiz` | Practice (one or more `items:`) |

### Tables (plain Markdown)

Write a grid with `|` separators. Row 1 = headers, row 2 = dashes, then data. A blank line ends the table. Construction saves them aligned so they stay readable in any text editor:

```markdown
| Phrase  | Use      |
| ------- | -------- |
| Hello   | Neutral  |
| Hi      | Casual   |
```

Tips: keep a space after each `|`; put a literal `|` inside a cell as `\|`. Uneven spacing still works; the app pads columns on save.

## Quiz vs exam (not the same)

| | Quiz (`@quiz`) | Exam |
|---|----------------|------|
| **What** | Questions inside lesson text | A special node on the map |
| **Defined in** | `@quiz` block in `.md` | `type: exam` on the tree (no `@exam` block) |
| **Typical use** | Per-lesson practice | Final evaluation with many quizzes in sequence |

**Practice modes** (app picks a playable one from your fields): multiple, recall, cloze, chips, steps. Field reference: [`CONTRIBUTING.md`](./CONTRIBUTING.md#lesson-quiz-the-quiz-block-five-practice-modes) and `src/features/learning/api/quiz-schema.js`.

In Construction, the quiz wizard (**F2**) guides concept, question, traps, and pass % (default 80).

## Optional diplomas

By default the learner earns a trophy for finishing the whole course. For a diploma on one folder:

1. Construction → select the folder.
2. **Trophy** button next to Move, or **Properties → Issue diploma**.

See [`PRODUCT_GUIDE.md`](PRODUCT_GUIDE.md#trophies-and-diplomas).

## Publishing

- **Nostr (open network):** Construction → publish. Arborito assigns a **new random network id** on first publish. Technical format: [`NETWORK.md`](NETWORK.md).
- **Catalog title in Forest:** follows the viewer’s **UI language** via `meta.titles` (set by renaming the root per curriculum language).
- **Export file:** Forest → Export → `.arborito`.
- **Local only:** import and study without publishing.

Full archive layout: [`ARBORITO_ARCHIVE.md`](ARBORITO_ARCHIVE.md). Shipped author guides in each export: `files/AUTHOR-GUIDE.md` (EN) / `files/AUTORIA.md` (ES).
