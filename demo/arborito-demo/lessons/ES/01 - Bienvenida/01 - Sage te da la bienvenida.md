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
- **Árbol:** varias ramas juntas.

Si activas la IA en ajustes, puedo ayudarte. Por defecto está **apagada**.

@quiz
concept: Bienvenida Sage
items:
  - question: ¿Quién te guía en esta demo?
    answer: Sage
    modes: multiple,recall
    traps:
      - Hacky Terminal
      - El Bosque solo
      - Un examen automático
  - question: ¿Cómo se llama un curso completo?
    answer: Rama
    modes: recall,multiple
    traps:
      - Solo un cuestionario
      - Un juego suelto
      - Un archivo del móvil
  - question: ¿La IA viene encendida?
    answer: No
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
    answer: En el índice de la lección
    modes: recall,multiple
    traps:
      - Solo en Arcade
      - En el Bosque
      - En la papelera
  - question: ¿Puedes repetir un cuestionario ya hecho?
    answer: Sí
    modes: multiple,recall
    traps:
      - No, nunca
      - Solo en examen
      - Solo con IA
@/quiz
