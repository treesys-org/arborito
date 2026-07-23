@info
icon: 🔧
description: Crear y editar tu propio curso
@/info

@section
index: 1
title: Modo construcción
@/section

¿Quieres **escribir** tu propio curso? Usa el **modo construcción** (martillo o llave inglesa en el mapa).

@image
url: ./media/12-construccion-es.png
caption: Modo construcción: editas carpetas, lecciones y el temario.
@/image

@section
index: 2
title: Demo de solo lectura
@/section

La rama **Arborito demo** es un tutorial **fijo** para explorar mapa, lecciones, juegos y construcción **sin romper nada**.

- Puedes **navegar** y **probar** todo en modo construcción.
- **No** puedes guardar cambios en el demo (ni reordenar su temario).
- Para **editar de verdad**, pulsa **Copiar a Mi jardín** en la barra de construcción.

@quiz
concept: Demo readonly
items:
  - question: ¿Cómo editas el contenido del demo Arborito?
    answer: Copiar a Mi jardín y editar la copia
    modes: multiple,recall
    traps:
      - Editar el demo directamente
      - Borrar Sage
      - Solo leer sin copiar
  - question: ¿Puedes guardar cambios en la demo original?
    answer: No
    modes: multiple,recall
    traps:
      - Sí, siempre
      - Solo títulos
      - Solo en examen
  - question: ¿Puedes explorar construcción en la demo sin copiar?
    answer: Sí, en solo lectura
    modes: multiple,recall
    traps:
      - No
      - Solo Sage
      - Solo exportar
@/quiz

@section
index: 3
title: Editar tu copia
@/section

En tu rama editable puedes:

- **Renombrar** carpetas y lecciones.
- **Reordenar** secciones del temario con las flechas de la lección.
- **Escribir** texto, secciones y cuestionarios (incluso varias preguntas en uno).
- **Activar logro** en una carpeta (menú de la carpeta).

No hace falta saber programar: es como editar un documento con carpetas.

@quiz
concept: Herramientas de autor
items:
  - question: ¿Para qué sirve el modo construcción en tu rama editable?
    answer: Crear y editar tu curso
    modes: multiple,recall
    traps:
      - Solo jugar Arcade
      - Borrar Sage
      - Importar sin guardar
  - question: ¿Puedes agrupar varias preguntas en un solo cuestionario?
    answer: Sí
    modes: multiple,recall
    traps:
      - No
      - Solo en examen
      - Solo en inglés
  - question: ¿Cómo reordenas filas del temario?
    answer: Flechas en modo construcción
    modes: multiple,recall
    traps:
      - Solo borrando
      - Solo Sage
      - No se puede
@/quiz

@section
index: 4
title: Exportar y compartir
@/section

**Exportar** empaqueta tu rama como `.arborito` para compartirla. Quien la importe en su Bosque obtiene carpetas, lecciones y cuestionarios listos.

Treesys también ofrece un **Python SDK** para validar o generar contenido fuera de la app; la app sigue siendo el lugar más cómodo para la mayoría de autores.

@quiz
concept: Exportar rama
items:
  - question: ¿Qué archivo compartes cuando exportas tu rama?
    answer: .arborito
    modes: multiple,recall
    traps:
      - .pdf solamente
      - .mp4
      - Un enlace de Arcade
  - question: ¿Dónde importa alguien tu curso exportado?
    answer: Bosque
    modes: multiple,recall
    traps:
      - Arcade
      - Solo examen
      - Sage
  - question: ¿El SDK Python es obligatorio para exportar?
    answer: No
    modes: multiple,recall
    traps:
      - Sí
      - Solo en demo
      - Solo en Android
@/quiz
