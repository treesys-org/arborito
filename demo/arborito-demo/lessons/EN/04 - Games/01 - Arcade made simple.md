@info
icon: 🕹️
description: Mini-games that use your lessons
tags: classroom, memory, terminal
@/info

# Arcade: play what you study

**Arcade** is mini-games inside Arborito. **Not separate apps**: they read **questions from your lessons** and turn them into rounds.

@section
title: Enter Arcade
@/section

1. Open a **folder** or branch on the map.
2. Find **Play** / **Arcade** (gamepad 🎮).
3. Pick a game: Classroom, Memory, Hacky Terminal…

If you do not see the button, open a folder with lessons first. Arcade uses the course you have open.

@quiz
concept: Arcade access
items:
  - question: Where do Arcade games get their questions?
    answer: From lessons in the open course
    modes: multiple,recall
    traps:
      - Random internet
      - Sage only
      - A closed exam
  - question: Which button opens mini-games from the map?
    answer: Play
    modes: multiple,recall
    traps:
      - Forest
      - Export
      - Sage only
  - question: Do you need an open folder to see Arcade?
    answer: Yes
    modes: multiple,recall
    traps:
      - No, always visible
      - Only after exams
      - Only on desktop
@/quiz

@section
title: Static and dynamic mode
@/section

**Static mode** uses course content only: works without AI, great for reviewing on the go.

**Dynamic mode** (with AI on) lets **Sage** vary or help in some games. You choose in settings.

@quiz
concept: Game modes
items:
  - question: Which game mode does not need an AI connection?
    answer: Static mode
    modes: recall,multiple
    traps:
      - Dynamic mode with Sage
      - Exams only
      - Construction mode
  - question: Can dynamic mode use Sage?
    answer: Yes
    modes: multiple,recall
    traps:
      - It does not exist
      - Forest only
      - PDF only
  - question: Does Arcade reuse questions you wrote in @quiz?
    answer: Yes
    modes: multiple,recall
    traps:
      - No, they are different
      - Images only
      - Trophies only
@/quiz

@section
title: Games in this demo
@/section

- **Classroom** — classroom with fictional classmates.
- **Memory** — concept/answer pairs.
- **Hacky Terminal** — retro console with `lessons` and `play` menu.

All read the same branch you are exploring. Finish lessons with solid `@quiz` blocks and Arcade fills itself.

@quiz
concept: Arcade catalog
items:
  - question: Which game uses pairs for memorization?
    answer: Memory
    modes: multiple,recall
    traps:
      - Classroom
      - Exams only
      - Forest
  - question: Which game looks like an 80s console?
    answer: Hacky Terminal
    modes: multiple,recall
    traps:
      - Classroom
      - Memory
      - Export
  - question: Which game simulates a class with classmates?
    answer: Classroom
    modes: multiple,recall
    traps:
      - Hacky Terminal
      - Memory only
      - The Forest
@/quiz
