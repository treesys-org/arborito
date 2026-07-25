@info
icon: 🔧
description: Create and edit your course
@/info

@section
index: 1
title: Construction mode
@/section

To **write** a course, use construction mode (hammer / wrench on the map). There you create folders, lessons, text, and questions.

If you do not have your own branch yet: in the **Forest**, **Create branch**.

@image
url: ./media/12-construccion-en.png
caption: Edit folders, lessons, and the outline.
@/image

@section
index: 2
title: This demo
@/section

Like an online course from another author, this demo is **read-only**. You can open construction to see how it is built, but **you cannot save** changes here.

When you enter construction, Arborito asks for a **name** for your copy. On that copy you can write and save.

@quiz
concept: Demo readonly
items:
  - question: How do you make an editable copy of this demo?
    answer: Construction mode, then name your copy
    modes: multiple,recall
    traps:
      - Edit the demo directly
      - Delete Sage
      - Only read
  - question: Can you save changes on the original demo?
    answer: No, only on your copy
    modes: multiple,recall
    traps:
      - Yes, always
      - Titles only
      - Exam only
  - question: What is construction mode for?
    answer: Create and edit your course
    modes: multiple,recall
    traps:
      - Play Arcade only
      - Delete Sage
      - Import without saving
@/quiz

@section
index: 3
title: Export
@/section

**Export** builds a `.arborito` to share. Others import it in the **Forest**. No coding needed.

@quiz
concept: Export branch
items:
  - question: What file do you share when you export a course?
    answer: A .arborito file
    modes: multiple,recall
    traps:
      - PDF only
      - .mp4
      - An Arcade link
  - question: Where is that .arborito file imported?
    answer: In the Forest
    modes: multiple,recall
    traps:
      - Arcade
      - Exam only
      - Sage
@/quiz
