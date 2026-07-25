@info
icon: 📖
description: Leer, índice y cuestionarios
@/info

@section
index: 1
title: Leer y practicar
@/section

Una lección tiene **texto**, capturas y **preguntas**. El índice te muestra qué te falta.

@image
url: ./media/05-leccion-es.png
caption: Texto, preguntas e índice.
@/image

@section
index: 2
title: Secciones y cuestionarios
@/section

Las **secciones** cortan la lección en partes. Un **cuestionario** puede tener varias preguntas; en el índice se ve como **uno**. Si las aciertas, pasa a **verde**. Luego puedes repetirlo.

Esas mismas preguntas salen en el **Arcade**.

@quiz
concept: Estructura de lección
items:
  - question: ¿Dónde ves lo que ya completaste en una lección?
    answer: En el índice de la lección
    modes: recall,multiple
    traps:
      - Solo en Arcade
      - En el Bosque
      - En el mapa raíz
  - question: ¿Un cuestionario puede tener varias preguntas?
    answer: Sí, varias en un mismo cuestionario
    modes: multiple,recall
    traps:
      - No, una por lección
      - Solo en examen
      - Solo en inglés
  - question: ¿De dónde salen las preguntas del Arcade?
    answer: De las lecciones del curso abierto
    modes: multiple,recall
    traps:
      - De internet al azar
      - Solo de Sage
      - De un examen cerrado
@/quiz
