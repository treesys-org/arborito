@info
icon: 💻
description: Hacky Terminal, Classroom, and console practice
tags: terminal, classroom
@/info

# Hacky Terminal and Classroom

Two faces of Arcade: a **retro console** and a **classroom**. Both reuse your `@quiz` blocks.

@section
title: Static Hacky Terminal
@/section

**Hacky Terminal** looks like an 80s terminal but reviews **your lesson**:

- Menu commands: type `lessons`, then `play 1` with the lesson number.
- Answer with numbers or text depending on each question mode.

Example output (like a lesson with code):

```bash
$ echo Hello
Hello
```

@quiz
concept: Static terminal
items:
  - question: How do you start a lesson in static Hacky Terminal?
    answer: Menu and play lesson number
    modes: recall,multiple
    traps:
      - Ask Sage without a course
      - Delete the branch
      - From Forest only
  - question: Which command lists available lessons?
    answer: lessons
    modes: recall,multiple
    traps:
      - play
      - quit
      - export
  - question: Does Hacky Terminal use questions from the open course?
    answer: Yes
    modes: multiple,recall
    traps:
      - No, internet only
      - Trophies only
      - Images only
@/quiz

@section
title: Dynamic Hacky Terminal
@/section

With **AI enabled**, you can ask me, **Sage**, besides menu missions. Same game; different who generates variations.

@quiz
concept: Dynamic terminal
items:
  - question: Who can help in dynamic Terminal besides the menu?
    answer: Sage
    modes: multiple,recall
    traps:
      - Classroom only
      - The Forest
      - Nobody
  - question: Do you need lessons with @quiz for Terminal to have content?
    answer: Yes
    modes: multiple,recall
    traps:
      - No
      - Videos only
      - Exams only
  - question: Does static mode work without AI?
    answer: Yes
    modes: multiple,recall
    traps:
      - No
      - English only
      - Exams only
@/quiz

@section
title: Classroom
@/section

**Classroom** simulates a class: fictional classmates, turns, and questions from your lessons. The most social way to review without leaving Arborito.

@quiz
concept: Classroom
items:
  - question: Which game simulates a class with classmates?
    answer: Classroom
    modes: multiple,recall
    traps:
      - Hacky Terminal
      - Memory only
      - The Forest
  - question: Does Classroom read the same questions as the outline?
    answer: Yes
    modes: multiple,recall
    traps:
      - No, random others
      - Sage only
      - Construction only
  - question: Where do you open Classroom?
    answer: From Arcade with the course open
    modes: multiple,recall
    traps:
      - Final exam only
      - Forest only
      - Export only
@/quiz
