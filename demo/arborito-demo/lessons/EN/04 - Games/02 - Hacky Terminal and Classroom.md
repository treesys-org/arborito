@info
icon: 💻
description: Hacky Terminal, Classroom, and console practice
tags: terminal, classroom
@/info

@section
index: 1
title: Hacky Terminal and Classroom
@/section

Two faces of Arcade: a **retro console** and a **classroom**. Both reuse the questions from your lessons.

@image
url: ./media/09-hacky-en.png
caption: Hacky Terminal: type the answer like a console.
@/image

@image
url: ./media/10-classroom-en.png
caption: Classroom: questions in a class format.
@/image
@section
index: 2
title: Static Hacky Terminal
@/section

**Hacky Terminal** looks like an 80s terminal, but it reviews **your lesson**:

- Menu with commands: type `lessons`, then `play 1` with the lesson number.
- You answer with numbers or text depending on each question mode.

Sample output (like in a lesson with code):

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
      - Asking Sage with no course
      - Deleting the branch
      - From the Forest only
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
index: 3
title: Dynamic Hacky Terminal
@/section

With **AI on**, you can ask me, **Sage**, on top of the menu missions. It's the same game; what changes is who generates variations.

@quiz
concept: Dynamic terminal
items:
  - question: Who can help you in dynamic Terminal besides the menu?
    answer: Sage
    modes: multiple,recall
    traps:
      - Classroom only
      - The Forest
      - Nobody
  - question: Do you need lessons with questions for Terminal to have content?
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
index: 4
title: Classroom
@/section

**Classroom** simulates a class: fictional classmates, turns, and questions taken from your lessons. It's the most social way to review without leaving Arborito.

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
  - question: Does Classroom read the same questions as the lesson outline?
    answer: Yes
    modes: multiple,recall
    traps:
      - No, other random ones
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
