@info
icon: 👋
description: Te doy la bienvenida y te cuento de qué va este demo
tags: demo, classroom
@/info

@section
index: 1
title: Hola, soy Sage
@/section

Soy **Sage**, el asistente de Arborito. Este demo te enseña lo básico: mapa, lecciones, juegos y cómo crear tu propio curso.

@image
url:./media/01-sage-es.png
caption: Así me ves en el escritorio (la IA viene apagada).
@/image

@section
index: 2
title: Tres nombres útiles
@/section

- **Curso:** lo que estudias de punta a punta (este demo es un curso).
- **Lección:** una página con texto, capturas y preguntas.
- **Playlist:** varios cursos juntos en un solo recorrido.

Si activas la IA en ajustes, puedo ayudarte. Por defecto está **apagada**.

@quiz
concept: Bienvenida Sage
items:
  - question: ¿Quién te guía en este demo?
    answer: Sage, el asistente
    modes: multiple,recall
    traps:
      - Hacky Terminal
      - Solo Arcade
      - Un examen automático
  - question: ¿Qué es este demo?
    answer: Un curso
    modes: recall,multiple
    traps:
      - Solo un cuestionario
      - Un juego
      - Un archivo del móvil
  - question: ¿La IA viene encendida por defecto?
    answer: No, viene apagada
    modes: multiple,recall
    traps:
      - Sí, siempre
      - Solo en examen
      - Solo en Arcade
@/quiz

@section
index: 3
title: Cómo seguir
@/section

Abre las carpetas del mapa en orden. En el índice, lo que aciertas se pone **verde**. Puedes repetir las preguntas cuando quieras.

@quiz
concept: Recorrido demo
items:
  - question: ¿Dónde ves qué completaste en una lección?
    answer: En el índice de la lección (se pone verde)
    modes: recall,multiple
    traps:
      - Solo en Arcade
      - Solo en Cursos
      - En la papelera
  - question: ¿Puedes repetir un cuestionario ya hecho?
    answer: Sí, cuando quieras
    modes: multiple,recall
    traps:
      - No, nunca
      - Solo en examen
      - Solo con IA
@/quiz
