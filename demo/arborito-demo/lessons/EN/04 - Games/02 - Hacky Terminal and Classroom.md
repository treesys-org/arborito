@info
icon: 💻
description: Retro console and classroom
tags: terminal, classroom
@/info

@section
index: 1
title: Two games, same questions
@/section

**Hacky Terminal** and **Classroom** review your course in another format.

@image
url: ./media/09-hacky-en.png
caption: Hacky Terminal: answer like a console.
@/image

@image
url: ./media/10-classroom-en.png
caption: Classroom: class format.
@/image

@section
index: 2
title: Hacky Terminal
@/section

Type `lessons` to list lessons. Then `play 1` (or another number) to start: **play and the lesson number**. With AI on you can also ask me.

```bash
$ echo Hello
Hello
```

@quiz
concept: Static terminal
items:
  - question: How do you start a lesson in Terminal?
    answer: play and the lesson number
    modes: recall,multiple
    traps:
      - Ask Sage only
      - Delete the branch
      - Forest only
  - question: Which command lists lessons?
    answer: lessons
    modes: recall,multiple
    traps:
      - play
      - quit
      - export
  - question: Does static mode work without AI?
    answer: Yes
    modes: multiple,recall
    traps:
      - No
      - English only
      - Exam only
@/quiz

@section
index: 3
title: Classroom
@/section

A class with fictional classmates. Questions come from your lessons. Open it from Arcade.

@quiz
concept: Classroom
items:
  - question: Which game simulates a class?
    answer: Classroom
    modes: multiple,recall
    traps:
      - Hacky Terminal
      - Memory only
      - The Forest
  - question: Where do you open Classroom?
    answer: From Arcade with the course open
    modes: multiple,recall
    traps:
      - Final exam only
      - Forest only
      - Export only
@/quiz
