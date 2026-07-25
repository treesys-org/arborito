@info
icon: 👋
description: Te doy la bienvenida y te cuento de qué va esta demo
tags: demo, classroom
@/info

@section
index: 1
title: Hola, soy Sage
@/section

Soy **Sage**, la asistente de Arborito. Esta demo te enseña lo básico: mapa, lecciones, juegos y cómo crear tu propio curso.

@image
url:./media/01-sage-es.png
caption: Así me ves en el escritorio (la IA viene apagada).
@/image

@section
index: 2
title: Tres nombres útiles
@/section

- **Rama:** un curso completo (esta demo es una rama).
- **Lección:** una página con texto, capturas y preguntas.
- **Árbol:** cursos combinados (varias ramas en un solo recorrido).

Si activas la IA en ajustes, puedo ayudarte. Por defecto está **apagada**.

@quiz
concept: Bienvenida Sage
items:
  - question: ¿Quién te guía en esta demo?
    answer: Sage, la asistente
    modes: multiple,recall
    traps:
      - Hacky Terminal
      - El Bosque
      - Un examen automático
  - question: ¿Cómo se llama un curso completo?
    answer: Una Rama
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
      - En el Bosque
      - En la papelera
  - question: ¿Puedes repetir un cuestionario ya hecho?
    answer: Sí, cuando quieras
    modes: multiple,recall
    traps:
      - No, nunca
      - Solo en examen
      - Solo con IA
@/quiz
