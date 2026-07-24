@info
icon: 💻
description: Consola retro y aula
tags: terminal, classroom
@/info

@section
index: 1
title: Dos juegos, mismas preguntas
@/section

**Hacky Terminal** y **Classroom** repasan tu curso con otro formato.

@image
url: ./media/09-hacky-es.png
caption: Hacky Terminal: respondes como en una consola.
@/image

@image
url: ./media/10-classroom-es.png
caption: Classroom: formato clase.
@/image

@section
index: 2
title: Hacky Terminal
@/section

Escribe `lessons` para listar lecciones. Luego `play 1` (u otro número) para empezar: **play y el número de lección**. Con IA activada también puedes preguntarme a mí.

```bash
$ echo Hola
Hola
```

@quiz
concept: Terminal estático
items:
  - question: ¿Cómo empiezas una lección en Terminal?
    answer: play y el número de lección
    modes: recall,multiple
    traps:
      - Solo preguntando a Sage
      - Borrando la rama
      - Solo desde el Bosque
  - question: ¿Qué comando lista las lecciones?
    answer: lessons
    modes: recall,multiple
    traps:
      - play
      - quit
      - export
  - question: ¿El modo estático funciona sin IA?
    answer: Sí
    modes: multiple,recall
    traps:
      - No
      - Solo en inglés
      - Solo en examen
@/quiz

@section
index: 3
title: Classroom
@/section

Simula una clase con compañeros ficticios. Las preguntas son las de tus lecciones. Se abre desde el Arcade.

@quiz
concept: Classroom
items:
  - question: ¿Qué juego simula una clase?
    answer: Classroom
    modes: multiple,recall
    traps:
      - Hacky Terminal
      - Memory solamente
      - El Bosque
  - question: ¿Dónde abres Classroom?
    answer: Desde Arcade con el curso abierto
    modes: multiple,recall
    traps:
      - Solo examen final
      - Solo Bosque
      - Solo exportar
@/quiz
