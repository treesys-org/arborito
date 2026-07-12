@info
icon: 🧩
description: Cinco formas de practicar en las lecciones
tags: classroom, memory
@/info

# Cinco tipos de pregunta

En las lecciones verás preguntas que cambian de forma. Esta lección las muestra **una por una** a propósito: en el resto del curso las agrupamos en cuestionarios con `items:`.

@section
title: Opción múltiple
@/section

Te muestran **varias opciones** y eliges una. Es ideal para reconocer conceptos nuevos.

@quiz
concept: Elegir respuesta
definition: Te muestran {varias opciones} y eliges una
question: ¿Qué tipo de pregunta te da opciones para elegir?
answer: Opción múltiple
modes: multiple,recall
traps:
- Solo texto libre
- Ordenar pasos
- Sin preguntas
@/quiz

@section
title: Completar huecos
@/section

Una frase con una palabra **oculta** que debes acertar. La definición usa `{huecos}` para marcar dónde va la respuesta.

@quiz
concept: Completar huecos
definition: Una frase con una palabra {oculta} que debes acertar
question: ¿Qué tipo de pregunta tiene un hueco en la frase?
answer: Completar huecos
modes: recall,multiple
traps:
- Elegir respuesta
- Ordenar palabras
- Vídeo solo
@/quiz

@section
title: Recordar sin opciones
@/section

Modo **recordar**: escribes o eliges la respuesta sin lista larga de trampas. Refuerza memoria activa.

@quiz
concept: Recordar
definition: Respuesta que debes {recordar} con pocos distractores
question: ¿Qué modo pide recordar la respuesta con concepto y definición?
answer: Recordar
modes: recall
traps:
- Opción múltiple
- Ordenar pasos
@/quiz

@section
title: Ordenar palabras
@/section

Arrastras o ordenas **palabras** para formar la frase correcta. Útil para fórmulas, saludos o secuencias cortas.

@quiz
concept: Ordenar palabras
definition: Arrastrar o ordenar {palabras} para formar la respuesta
question: Ordena: con · Aprende · Arborito
answer: Aprende con Arborito
modes: chips
@/quiz

@section
title: Ordenar pasos
@/section

Pones acciones en el **orden correcto**. Perfecto para procedimientos: abrir mapa, carpeta, lección…

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
