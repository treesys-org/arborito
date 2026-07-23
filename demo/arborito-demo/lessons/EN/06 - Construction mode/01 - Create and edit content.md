@info
icon: 🔧
description: Create and edit your own course
@/info

@section
index: 1
title: Construction mode
@/section

Want to **write** your own course? Use **construction mode** (hammer or wrench on the map).

@image
url: ./media/12-construccion-en.png
caption: Construction mode: edit folders, lessons, and the outline.
@/image

@section
index: 2
title: Read-only demo
@/section

The **Arborito demo** branch is a **fixed** tutorial so you can explore the map, lessons, games, and construction **without breaking anything**.

- You can **browse** and **try** everything in construction mode.
- You **cannot** save changes on the demo (or reorder its outline).
- To **edit for real**, tap **Copy to My garden** on the construction bar.

@quiz
concept: Demo readonly
items:
  - question: How do you edit the Arborito demo content?
    answer: Copy to My garden and edit the copy
    modes: multiple,recall
    traps:
      - Edit the demo directly
      - Delete Sage
      - Read without copying
  - question: Can you save changes on the original demo?
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
index: 3
title: Edit your copy
@/section

On your editable branch you can:

- **Rename** folders and lessons.
- **Reorder** outline sections with the lesson arrows.
- **Write** text, sections, and quizzes (including several questions in one).
- **Enable achievement** on a folder (folder menu).

You don't need to know how to code: it's like editing a document with folders.

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
  - question: Can you group several questions in one quiz?
    answer: Yes
    modes: multiple,recall
    traps:
      - No
      - Exams only
      - English only
  - question: How do you reorder outline rows?
    answer: Arrows in construction mode
    modes: multiple,recall
    traps:
      - By deleting only
      - Sage only
      - You can't
@/quiz

@section
index: 4
title: Export and share
@/section

**Export** packs your branch as a `.arborito` to share. Whoever imports it in their Forest gets folders, lessons, and quizzes ready to go.

Treesys also offers a **Python SDK** to validate or generate content outside the app; the app is still the most comfortable place for most authors.

@quiz
concept: Export branch
items:
  - question: What file do you share when you export your branch?
    answer: .arborito
    modes: multiple,recall
    traps:
      - .pdf only
      - .mp4
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
