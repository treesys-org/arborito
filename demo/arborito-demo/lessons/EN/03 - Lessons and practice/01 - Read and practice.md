@info
icon: 📖
description: Read lessons, rich outline, and multi-question quizzes
@/info

# Read and practice

Each lesson is a **living document**: text sections and quizzes that feed the side outline and, if you want, Arcade.

@section
title: Text and sections
@/section

Authors split lessons with `@section` so the outline has clear steps. Read calmly, use the outline to jump, and go back when you need a refresher.

Images, videos, and special blocks live between sections like a well-edited article.

@quiz
concept: Lesson structure
items:
  - question: Where do you see which parts of a lesson you completed?
    answer: In the lesson outline
    modes: recall,multiple
    traps:
      - Only in Arcade
      - In the Forest
      - On the root map
  - question: What are @section blocks for?
    answer: Split the outline into steps
    modes: multiple,recall
    traps:
      - Decoration only
      - Delete questions
      - Enable Sage
  - question: Can you jump between sections with the outline?
    answer: Yes
    modes: multiple,recall
    traps:
      - Not on mobile
      - Only in exams
      - Only with AI
@/quiz

@section
title: Unified quizzes
@/section

One `@quiz` block can use **`items:`** with several questions. The outline shows **one** quiz row; inside you practice several ideas in a row without fragmenting the lesson.

Each question can use different modes (multiple choice, recall, cloze…). The "Five question types" lesson shows them one by one on purpose.

@quiz
concept: Quiz with items
items:
  - question: What do you need to mark an outline quiz as completed?
    answer: Get all its questions right
    modes: multiple,recall
    traps:
      - Read the title only
      - Close the app
      - One question is enough
  - question: Do several questions in one @quiz use the items key?
    answer: Yes
    modes: multiple,recall
    traps:
      - No, one quiz per file
      - Only in exams
      - Only in Spanish
  - question: Can you practice again after completing a lesson quiz?
    answer: Yes
    modes: multiple,recall
    traps:
      - No, never
      - Only in exams
      - Only the first time
@/quiz

@section
title: From lesson to Arcade
@/section

The same `@quiz` questions feed **Classroom**, **Memory**, and **Hacky Terminal**. Study once, play many times: authors do not duplicate work.

That is why this demo mixes clear text and quizzes with several `items`: it is the standard you would see in a published course.

@quiz
concept: Lessons and games
items:
  - question: Where do Arcade games get their questions?
    answer: From lessons in the open course
    modes: multiple,recall
    traps:
      - Random internet
      - Sage only
      - A closed exam
  - question: How many questions must you pass in a three-item quiz to mark it green?
    answer: All three
    modes: multiple,recall
    traps:
      - One is enough
      - None
      - Only in exams
  - question: Does the outline show sections and quizzes?
    answer: Yes
    modes: multiple,recall
    traps:
      - Titles only
      - Only in construction
      - There is no outline
@/quiz
