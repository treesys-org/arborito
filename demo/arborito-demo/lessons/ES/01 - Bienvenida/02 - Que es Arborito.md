@info
icon: 🌳
description: Qué es una rama, el Bosque y los cuatro pilares de Treesys
@/info

# Tu jardín de estudio

Arborito es la **app** de Treesys para aprender con mapa, práctica y juegos. Esta rama demo muestra lo esencial en una sola sentada.

@section
title: Mapa y carpetas
@/section

Imagina un **árbol de carpetas** en pantalla:

- Cada **carpeta** es un tema (por ejemplo «Bienvenida» o «Juegos»).
- Cada **hoja** es una lección para leer y practicar.
- El **icono** de la carpeta va en el `README` con `icon:` para no repetir el emoji en el nombre.

@quiz
concept: Mapa y ramas
items:
  - question: ¿Cómo se llama un curso completo en Arborito?
    answer: Rama
    modes: recall,multiple
    traps:
      - Árbol de archivos del móvil
      - Solo un cuestionario
      - Un juego suelto
  - question: ¿Dónde pones el emoji de una carpeta para que no salga duplicado?
    answer: En el README de la carpeta con icon
    modes: recall,multiple
    traps:
      - Solo en el nombre dos veces
      - No se pueden usar emojis
      - En el título del examen
  - question: ¿Qué abres cuando tocas una hoja en el mapa?
    answer: Una lección
    modes: multiple,recall
    traps:
      - Solo Arcade
      - El Bosque entero
      - Un trofeo automático
@/quiz

@section
title: El Bosque y tu progreso
@/section

Todo lo que importas o creas aparece en el **Bosque** (menú Bosque). Esta rama «Arborito demo» es un ejemplo: puedes **borrarla** cuando quieras; vuelve si reseteas todos los datos del navegador.

Por defecto tu **progreso** (lecciones leídas, preguntas acertadas, racha) se guarda **en este dispositivo**. Exportar un `.arborito` comparte el **contenido**, no sustituye tu historial personal.

@quiz
concept: Bosque y datos
items:
  - question: ¿Dónde importas un curso .arborito?
    answer: En el Bosque
    modes: recall,multiple
    traps:
      - En Arcade
      - En el mapa directamente
      - En Sage solamente
  - question: ¿Dónde se guarda tu progreso por defecto?
    answer: En este dispositivo
    modes: multiple,recall
    traps:
      - En el archivo .arborito
      - Solo en internet
      - En el juego Classroom
  - question: ¿Qué archivo compartes cuando exportas una rama tuya?
    answer: .arborito
    modes: recall,cloze
    traps:
      - .pdf solamente
      - .mp4
      - Un enlace de Arcade
@/quiz

@section
title: Cuatro pilares (visión Treesys)
@/section

Treesys apuesta por cuatro piezas que verás en esta demo:

1. **App Arborito** — estudiar con mapa y temario.
2. **Cursos públicos** — ramas que otros autores comparten.
3. **Games (Arcade)** — minijuegos con tus propias preguntas.
4. **Python SDK** — para quien quiera generar o validar contenido fuera de la app.

No hace falta programar para usar Arborito. El SDK es opcional para autores avanzados y equipos.

@quiz
concept: Ecosistema Treesys
items:
  - question: ¿Qué zona convierte las preguntas de tus lecciones en partidas?
    answer: Arcade
    modes: multiple,recall
    traps:
      - Solo el Bosque
      - Solo el examen
      - Sage sin curso
  - question: ¿Para qué sirve el modo construcción en tu rama editable?
    answer: Crear y editar tu curso
    modes: multiple,recall
    traps:
      - Solo jugar Arcade
      - Borrar Sage
      - Importar sin guardar
  - question: ¿El SDK de Python es obligatorio para estudiar?
    answer: No
    modes: multiple,recall
    traps:
      - Sí, siempre
      - Solo en examen
      - Solo en iOS
@/quiz
