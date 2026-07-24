@info
icon: 🧩
description: Cinco formas de practicar
tags: classroom, memory
@/info

@section
index: 1
title: Cinco tipos
@/section

Aquí las ves **una por una**. En el resto del curso suelen ir juntas en un cuestionario.

@image
url: ./media/06-quiz-es.png
caption: Una pregunta lista para practicar.
@/image

@section
index: 2
title: Opción múltiple
@/section

Varias opciones; eliges una.

@quiz
concept: Elegir respuesta
definition: Te muestran {varias opciones} y eliges una
question: ¿Qué tipo te da opciones para elegir?
answer: Opción múltiple
modes: multiple,recall
traps:
- Solo texto libre
- Ordenar pasos
- Sin preguntas
@/quiz

@section
index: 3
title: Completar huecos
@/section

Una frase con una palabra **oculta**.

@quiz
concept: Completar huecos
definition: Una frase con una palabra {oculta} que debes acertar
answer: Completar huecos
modes: cloze
@/quiz

@section
index: 4
title: Recordar
@/section

Escribes o eliges la respuesta **sin** una lista larga de trampas.

@quiz
concept: Recordar
definition: Respuesta que debes {recordar} con pocos distractores
question: ¿Qué modo pide recordar la respuesta?
answer: Recordar
modes: recall
traps:
- Opción múltiple
- Ordenar pasos
@/quiz

@section
index: 5
title: Ordenar palabras
@/section

Ordenas palabras para armar la frase.

@quiz
concept: Ordenar palabras
definition: Arrastrar o ordenar {palabras} para formar la respuesta
question: Ordena: con · Aprende · Arborito
answer: Aprende con Arborito
modes: chips
@/quiz

@section
index: 6
title: Ordenar pasos
@/section

Pones las acciones en el **orden correcto**.

@quiz
concept: Ordenar pasos
definition: Poner acciones en el {orden correcto}
question: Ordena los pasos para abrir una lección
answer: Abrir el mapa → Abrir la carpeta → Tocar la lección
modes: steps
steps:
- Abrir el mapa
- Abrir la carpeta
- Tocar la lección
@/quiz
