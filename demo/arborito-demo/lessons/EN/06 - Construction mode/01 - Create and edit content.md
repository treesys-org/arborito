@info
icon: 🔧
description: Create and edit your own course
@/info

# Construction mode

Want to **write** your own course? Use **construction mode** (hammer or wrench on the map).

@section
title: Read-only demo
@/section

The **Arborito demo** branch is a **fixed** tutorial to explore map, lessons, games, and construction **without breaking anything**.

- You can **browse** and **try** everything in construction mode.
- You **cannot** save changes to the demo (or reorder its outline).
- To **edit for real**, tap **Copy to My garden** on the construction bar.

@quiz
concept: Demo readonly
items:
  - question: How do you edit Arborito demo content?
    answer: Copy to My garden and edit the copy
    modes: multiple,recall
    traps:
      - Edit the demo directly
      - Delete Sage
      - Read without copying
  - question: Can you save changes to the original demo?
    answer: No
    modes: multiple,recall
    traps:
      - Yes, always
      - Titles only
      - Exams only
  - question: Can you explore construction on the demo without copying?
    answer: Yes, read-only
    modes: multiple,recall
    traps:
      - No
      - Sage only
      - Export only
@/quiz

@section
title: Edit your copy
@/section

On your editable branch you can:

- **Rename** folders and lessons.
- **Reorder** outline sections (↑↓←→ in the lesson).
- **Write** text, `@section`, and `@quiz` with `items:`.
- **Enable achievement** 🏆 on a folder (⋮ menu).

No coding required: it is like editing a document with folders.

@quiz
concept: Author tools
items:
  - question: What is construction mode for on your editable branch?
    answer: Create and edit your course
    modes: multiple,recall
    traps:
      - Play Arcade only
      - Delete Sage
      - Import without saving
  - question: Can you group several questions in one @quiz?
    answer: Yes, with items
    modes: multiple,recall
    traps:
      - No
      - Exams only
      - English only
  - question: How do you reorder outline rows?
    answer: Arrows in construction mode
    modes: multiple,recall
    traps:
      - Delete only
      - Sage only
      - Not possible
@/quiz

@section
title: Export and share
@/section

**Export** packs your branch as `.arborito` to share. Whoever imports it in their Forest gets folders, lessons, and quizzes ready to go.

Treesys also offers a **Python SDK** to validate or generate content outside the app; the app remains the most comfortable place for most authors.

@quiz
concept: Export branch
items:
  - question: What file do you share when you export your branch?
    answer: .arborito
    modes: recall,cloze
    traps:
      - PDF only
      - MP4
      - An Arcade link
  - question: Where does someone import your exported course?
    answer: Forest
    modes: multiple,recall
    traps:
      - Arcade
      - Exams only
      - Sage
  - question: Is the Python SDK required to export?
    answer: No
    modes: multiple,recall
    traps:
      - Yes
      - Demo only
      - Android only
@/quiz
