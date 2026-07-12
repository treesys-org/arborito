@info
icon: ⭐
description: Puntos, racha, trofeos de rama/árbol y logros opcionales
@/info

# Puntos y recompensas

Arborito **gamifica** tu estudio para que sea más fácil volver cada día. No es un videojuego competitivo: es **tu progreso personal**.

@section
title: XP, racha y jardín
@/section

- **Puntos (XP)** al completar lecciones y acertar preguntas.
- **Racha** si entras varios días seguidos.
- **Semillas** en tu jardín cuando terminas módulos (mira **Progreso** / mochila 🎒).

Cada cuestionario del temario suma sensación de avance: por eso las lecciones de esta demo llevan varios `items` por bloque.

@quiz
concept: Progreso diario
items:
  - question: ¿Qué sube cuando completas lecciones y preguntas?
    answer: Puntos XP
    modes: cloze,multiple
    traps:
      - Solo el volumen del móvil
      - El precio del curso
      - Los archivos .arborito
  - question: ¿Qué es la racha en Arborito?
    answer: Días seguidos estudiando
    modes: recall,multiple
    traps:
      - Número de exámenes
      - Cantidad de ramas importadas
      - Puntos de Arcade solamente
  - question: ¿Dónde ves semillas y resumen de progreso?
    answer: Progreso o mochila
    modes: multiple,recall
    traps:
      - Solo examen
      - Solo Bosque
      - Solo construcción
@/quiz

@section
title: Trofeos de rama y árbol
@/section

En la mochila **Logros** verás tres tipos:

1. **Rama:** completas **toda** una rama del Bosque (como esta demo).
2. **Árbol:** completas **todas** las ramas de un árbol (playlist con varias ramas).
3. **Logro opcional:** el autor activa 🏆 en una carpeta concreta del mapa (construcción → menú ⋮ → Activar logro).

Los trofeos de rama y árbol cuentan **aunque estés dentro de una carpeta** del mapa.

@quiz
concept: Trofeos principales
items:
  - question: ¿Qué trofeo ganas al terminar una rama entera como esta demo?
    answer: Trofeo de rama
    modes: cloze,multiple
    traps:
      - Solo un examen
      - Un logro opcional de carpeta
      - Puntos de Arcade solamente
  - question: ¿Qué trofeo requiere completar todas las ramas de un árbol?
    answer: Trofeo de árbol
    modes: multiple,recall
    traps:
      - Trofeo de rama
      - Solo racha
      - Solo Classroom
  - question: ¿Dónde activas un logro opcional en una carpeta?
    answer: Modo construcción menú de carpeta
    modes: multiple,recall
    traps:
      - Solo examen
      - Solo Sage
      - No se puede
@/quiz

@section
title: Motivación sin presión
@/section

Los puntos y trofeos están para **celebrar**, no para castigar. Puedes estudiar a tu ritmo, repetir cuestionarios y jugar Arcade sin perder lo aprendido.

@quiz
concept: Filosofía de logros
items:
  - question: ¿Los trofeos de rama exigen volver al mapa raíz?
    answer: No
    modes: multiple,recall
    traps:
      - Sí, siempre
      - Solo en inglés
      - Solo con IA
  - question: ¿Completar un cuestionario con tres items da más sensación de avance que una sola pregunta?
    answer: Sí
    modes: multiple,recall
    traps:
      - No
      - Solo en examen
      - No hay temario
  - question: ¿El progreso es personal y no competitivo entre usuarios?
    answer: Sí
    modes: multiple,recall
    traps:
      - No, hay ranking global
      - Solo en Arcade
      - Solo en demo
@/quiz
