# Arborito demo (bundled branch)

This folder mirrors the **inside of a `.arborito` ZIP**. Use it as a reference when authoring courses by hand.

```
manifest.json          course id, name, icon
files/README.md        course intro (optional)
lessons/ES/
  01 - Module/
    README.md          module intro + @info icon (emoji here, not in folder title)
    01 - Lesson.md     lesson body + @quiz blocks
```

## Rules used here

- **No double emojis:** folder names are plain (`01 - Bienvenida`); emoji goes in `README.md` or lesson `@info` → `icon:`.
- **Exam:** `@info` with `exam: yes` on the exam lesson file.
- **Unified quizzes:** `@quiz` with `items:` (several questions per temario row).
- **Rich outline:** `@section` blocks + quizzes; most lessons have 3+ sections and 3+ quiz rows.
- **Exception:** «Five question types» keeps one quiz per practice mode (five separate blocks).

At runtime, `src/core/demo/load-arborito-demo.js` bundles these files into the local **Arborito demo** branch. After `reseteverything`, the branch is seeded again; the user can delete it until then.
