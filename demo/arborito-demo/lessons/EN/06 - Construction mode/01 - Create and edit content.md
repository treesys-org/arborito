@info
icon: 🔧
description: Create and edit your course
@/info

@section
index: 1
title: Construction mode
@/section

To **write** a course, use construction mode (hammer / wrench on the map).

@image
url: ./media/12-construccion-en.png
caption: Edit folders, lessons, and the outline.
@/image

@section
index: 2
title: This demo does not save
@/section

You can **look** at construction here, but **not save**. To edit for real: **Copy to My garden**.

On your copy you can rename, reorder, write text and questions, and turn on an achievement on a folder.

@quiz
concept: Demo readonly
items:
  - question: How do you edit the demo?
    answer: Copy to My garden and edit the copy
    modes: multiple,recall
    traps:
      - Edit the demo directly
      - Delete Sage
      - Only read
  - question: Can you save changes on the original demo?
    answer: No
    modes: multiple,recall
    traps:
      - Yes, always
      - Titles only
      - Exam only
  - question: What is construction mode for on your branch?
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
  - question: What file do you share when you export?
    answer: .arborito
    modes: multiple,recall
    traps:
      - PDF only
      - .mp4
      - An Arcade link
  - question: Where is that file imported?
    answer: Forest
    modes: multiple,recall
    traps:
      - Arcade
      - Exam only
      - Sage
@/quiz
