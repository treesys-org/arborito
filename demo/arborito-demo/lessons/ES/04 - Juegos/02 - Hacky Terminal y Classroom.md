@info
icon: 💻
description: Hacky Terminal, Classroom y práctica en consola
tags: terminal, classroom
@/info

@section
index: 1
title: Hacky Terminal y Classroom
@/section

Dos caras del Arcade: una **consola retro** y un **aula**. Ambas reutilizan las preguntas de tus lecciones.

@image
url: ./media/09-hacky-es.png
caption: Hacky Terminal: escribes la respuesta como en una consola.
@/image

@image
url: ./media/10-classroom-es.png
caption: Classroom: preguntas en formato clase.
@/image
@section
index: 2
title: Hacky Terminal estático
@/section

**Hacky Terminal** parece un terminal de los 80, pero repasa **tu lección**:

- Menú con comandos: escribe `lessons`, luego `play 1` con el número de lección.
- Respondes con números o texto según el modo de cada pregunta.

Ejemplo de salida (como en una lección con código):

```bash
$ echo Hola
Hola
```

@quiz
concept: Terminal estático
items:
  - question: ¿Cómo empiezas una lección en Hacky Terminal estático?
    answer: Menú y play número de lección
    modes: recall,multiple
    traps:
      - Solo preguntando a Sage sin curso
      - Borrando la rama
      - Desde el Bosque solo
  - question: ¿Qué comando lista las lecciones disponibles?
    answer: lessons
    modes: recall,multiple
    traps:
      - play
      - quit
      - export
  - question: ¿Hacky Terminal usa preguntas del curso abierto?
    answer: Sí
    modes: multiple,recall
    traps:
      - No, solo internet
      - Solo trofeos
      - Solo imágenes
@/quiz

@section
index: 3
title: Hacky Terminal dinámico
@/section

Con **IA activada**, puedes preguntarme a mí, **Sage**, además de las misiones del menú. Sigue siendo el mismo juego; cambia quién genera variaciones.

@quiz
concept: Terminal dinámico
items:
  - question: ¿Quién puede ayudarte en Terminal dinámico además del menú?
    answer: Sage
    modes: multiple,recall
    traps:
      - Solo Classroom
      - El Bosque
      - Nadie
  - question: ¿Necesitas lecciones con preguntas para que Terminal tenga contenido?
    answer: Sí
    modes: multiple,recall
    traps:
      - No
      - Solo vídeos
      - Solo examen
  - question: ¿El modo estático funciona sin IA?
    answer: Sí
    modes: multiple,recall
    traps:
      - No
      - Solo en inglés
      - Solo en examen
@/quiz

@section
index: 4
title: Classroom
@/section

**Classroom** simula un aula: compañeros ficticios, turnos y preguntas sacadas de tus lecciones. Es la forma más social de repasar sin salir de Arborito.

@quiz
concept: Classroom
items:
  - question: ¿Qué juego simula una clase con compañeros?
    answer: Classroom
    modes: multiple,recall
    traps:
      - Hacky Terminal
      - Memory solamente
      - El Bosque
  - question: ¿Classroom lee las mismas preguntas que el índice de la lección?
    answer: Sí
    modes: multiple,recall
    traps:
      - No, otras aleatorias
      - Solo Sage
      - Solo construcción
  - question: ¿Dónde abres Classroom?
    answer: Desde Arcade con el curso abierto
    modes: multiple,recall
    traps:
      - Solo examen final
      - Solo Bosque
      - Solo exportar
@/quiz
