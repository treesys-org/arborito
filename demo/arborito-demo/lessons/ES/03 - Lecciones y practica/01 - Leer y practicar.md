@info
icon: 📖
description: Leer lecciones, temario rico y cuestionarios con varias preguntas
@/info

# Leer y practicar

Cada lección es un **documento vivo**: secciones de texto y cuestionarios que alimentan el temario lateral y, si quieres, el Arcade.

@section
title: Texto y secciones
@/section

Los autores dividen la lección con `@section` para que el índice tenga pasos claros. Lee con calma, usa el temario para saltar y vuelve atrás cuando necesites repasar.

Las imágenes, vídeos y bloques especiales viven entre secciones como en un artículo bien editado.

@quiz
concept: Estructura de lección
items:
  - question: ¿Dónde ves qué partes de la lección ya completaste?
    answer: En el índice de la lección
    modes: recall,multiple
    traps:
      - Solo en Arcade
      - En el Bosque
      - En el mapa raíz
  - question: ¿Para qué sirven los bloques @section?
    answer: Dividir el temario en pasos
    modes: multiple,recall
    traps:
      - Solo decorar
      - Borrar preguntas
      - Activar Sage
  - question: ¿Puedes saltar entre secciones con el índice?
    answer: Sí
    modes: multiple,recall
    traps:
      - No en móvil
      - Solo en examen
      - Solo con IA
@/quiz

@section
title: Cuestionarios unificados
@/section

Un mismo bloque `@quiz` puede llevar **`items:`** con varias preguntas. En el temario cuenta como **un** cuestionario; dentro practicas varias ideas seguidas sin fragmentar la lección.

Cada pregunta puede usar distintos modos (opción múltiple, recordar, huecos…). La lección «Cinco tipos de pregunta» las muestra una a una a propósito.

@quiz
concept: Quiz con items
items:
  - question: ¿Qué necesitas para marcar un cuestionario del temario como completado?
    answer: Acertar todas sus preguntas
    modes: multiple,recall
    traps:
      - Solo leer el título
      - Cerrar la app
      - Una sola pregunta bien
  - question: ¿Varias preguntas en un bloque @quiz usan la clave items?
    answer: Sí
    modes: multiple,recall
    traps:
      - No, una quiz por archivo
      - Solo en examen
      - Solo en inglés
  - question: ¿Los cuestionarios de lección permiten practicar otra vez tras completar?
    answer: Sí
    modes: multiple,recall
    traps:
      - No, nunca
      - Solo en examen
      - Solo la primera vez
@/quiz

@section
title: De la lección al Arcade
@/section

Las mismas preguntas que escribes en `@quiz` alimentan **Classroom**, **Memory** y **Hacky Terminal**. Estudias una vez, juegas muchas: el autor no duplica trabajo.

Por eso esta demo mezcla texto claro y cuestionarios con varias `items`: es el estándar que verías en un curso publicado.

@quiz
concept: Lección y juegos
items:
  - question: ¿De dónde sacan las preguntas los juegos del Arcade?
    answer: De las lecciones del curso abierto
    modes: multiple,recall
    traps:
      - De internet al azar
      - Solo de Sage
      - De un examen cerrado
  - question: ¿Cuántas preguntas debe acertar un cuestionario con tres items para marcarlo verde?
    answer: Las tres
    modes: multiple,recall
    traps:
      - Una basta
      - Ninguna
      - Solo en examen
  - question: ¿El temario muestra secciones y cuestionarios?
    answer: Sí
    modes: multiple,recall
    traps:
      - Solo títulos
      - Solo en construcción
      - No existe temario
@/quiz
