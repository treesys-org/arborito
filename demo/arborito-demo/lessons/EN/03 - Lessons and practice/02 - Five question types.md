@info
icon: 🧩
description: Five ways to practice in lessons
tags: classroom, memory
@/info

# Five question types

Lesson questions change shape. This lesson shows them **one by one** on purpose: elsewhere we group them in quizzes with `items:`.

@section
title: Multiple choice
@/section

You get **several options** and pick one. Great for recognizing new concepts.

@quiz
concept: Pick an answer
definition: You see {several options} and pick one
question: Which question type gives you options to choose from?
answer: Multiple choice
modes: multiple,recall
traps:
- Free text only
- Order steps
- No questions
@/quiz

@section
title: Fill in the blanks
@/section

A sentence with a **hidden** word you must get right. The definition uses `{blanks}` to mark where the answer goes.

@quiz
concept: Cloze
definition: A sentence with a {hidden} word you must get right
question: Which question type has a blank in the sentence?
answer: Fill in the blanks
modes: recall,multiple
traps:
- Multiple choice
- Order words
- Video only
@/quiz

@section
title: Recall without options
@/section

**Recall** mode: you supply the answer with few distractors. It strengthens active memory.

@quiz
concept: Recall
definition: Answer you must {remember} with few traps
question: Which mode asks you to recall the answer with concept and definition?
answer: Recall
modes: recall
traps:
- Multiple choice
- Order steps
@/quiz

@section
title: Order words
@/section

Drag or order **words** to form the correct phrase. Handy for formulas, greetings, or short sequences.

@quiz
concept: Word order
definition: Drag or order {words} to form the answer
question: Order: with · Learn · Arborito
answer: Learn with Arborito
modes: chips
@/quiz

@section
title: Order steps
@/section

Put actions in the **correct order**. Perfect for procedures: open map, folder, lesson…

@quiz
concept: Step order
definition: Put actions in the {correct order}
question: Order the steps to open a lesson
answer: Open the map → Open the folder → Tap the lesson
modes: steps
steps:
- Open the map
- Open the folder
- Tap the lesson
@/quiz
