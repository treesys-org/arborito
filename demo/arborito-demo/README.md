@section
index: 1
title: Arborito demo (bundled branch)
@/section

This folder mirrors the **inside of a `.arborito` ZIP**. Use it as a reference when authoring courses by hand.

```
manifest.json          course titles / descriptions per language, icon
files/README.md        course intro (optional)
lessons/ES|EN/
  01 - Module/
    README.md          module intro + @info icon (emoji here, not in folder title)
    01 - Lesson.md     lesson body + @quiz blocks
```

@section
index: 2
title: Rules used here
@/section

- **No double emojis:** folder names are plain (`01 - Bienvenida`); emoji goes in `README.md` or lesson `@info` → `icon:`.
- **Exam:** `@info` with `exam: yes` on the exam lesson file.
- **Unified quizzes:** `@quiz` with `items:` (several questions per outline row).
- **Lesson images:** `@image` with `url: ./media/<file>.png` under `media/` (ES/EN). Same folder powers Flatpak/site via `www/demo-media/` on build (no separate screenshots tree).
- **Learner tone:** lesson prose stays student-facing; author syntax stays in this README and authoring docs.
- **Exception:** «Five question types» keeps one quiz per practice mode (five separate blocks).

At runtime, `src/core/demo/load-arborito-demo.js` bundles these files into the local **Arborito demo** branch. The branch is read-only and re-seeded after `reseteverything` when the demo seed version changes.
