@info
icon: 🕹️
description: Minijuegos que usan tus lecciones
tags: classroom, memory, terminal
@/info

# Arcade: jugar lo que estudias

**Arcade** son minijuegos dentro de Arborito. **No son apps aparte**: leen las **preguntas de tus lecciones** y las convierten en partidas.

@section
title: Entrar al Arcade
@/section

1. Abre una **carpeta** o rama en el mapa.
2. Busca el botón **Jugar** / **Arcade** (mando 🎮).
3. Elige un juego: Classroom, Memory, Hacky Terminal…

Si no ves el botón, abre primero una carpeta con lecciones. Arcade usa el curso que tienes abierto.

@quiz
concept: Acceso Arcade
items:
  - question: ¿De dónde sacan las preguntas los juegos del Arcade?
    answer: De las lecciones del curso que tienes abierto
    modes: multiple,recall
    traps:
      - De internet al azar
      - Solo de Sage
      - De un examen cerrado
  - question: ¿Qué botón abre los minijuegos desde el mapa?
    answer: Jugar
    modes: multiple,recall
    traps:
      - Bosque
      - Exportar
      - Solo Sage
  - question: ¿Necesitas una carpeta abierta para ver Arcade?
    answer: Sí
    modes: multiple,recall
    traps:
      - No, siempre visible
      - Solo tras examen
      - Solo en PC
@/quiz

@section
title: Modo estático y dinámico
@/section

**Modo estático** usa solo el contenido del curso: funciona sin IA y es perfecto para repasar en el metro.

**Modo dinámico** (con IA activada) deja que **Sage** genere variaciones o ayude en algunos juegos. Tú eliges en ajustes.

@quiz
concept: Modos de juego
items:
  - question: ¿Qué modo de juego no necesita conexión con IA?
    answer: Modo estático
    modes: recall,multiple
    traps:
      - Modo dinámico con Sage
      - Solo examen
      - Modo construcción
  - question: ¿El modo dinámico puede usar Sage?
    answer: Sí
    modes: multiple,recall
    traps:
      - No existe
      - Solo en Bosque
      - Solo en PDF
  - question: ¿Arcade repite preguntas que ya escribiste en @quiz?
    answer: Sí
    modes: multiple,recall
    traps:
      - No, son distintas
      - Solo imágenes
      - Solo trofeos
@/quiz

@section
title: Juegos de esta demo
@/section

- **Classroom** — aula con compañeros ficticios.
- **Memory** — parejas concepto/respuesta.
- **Hacky Terminal** — consola retro con menú `lessons` y `play`.

Todos leen la misma rama que estás explorando. Termina las lecciones con buenos `@quiz` y el Arcade se llena solo.

@quiz
concept: Catálogo Arcade
items:
  - question: ¿Qué juego usa parejas para memorizar?
    answer: Memory
    modes: multiple,recall
    traps:
      - Classroom
      - Solo examen
      - Bosque
  - question: ¿Qué juego parece una consola de los 80?
    answer: Hacky Terminal
    modes: multiple,recall
    traps:
      - Classroom
      - Memory
      - Exportar
  - question: ¿Qué juego simula una clase con compañeros?
    answer: Classroom
    modes: multiple,recall
    traps:
      - Hacky Terminal
      - Memory solamente
      - El Bosque
@/quiz
