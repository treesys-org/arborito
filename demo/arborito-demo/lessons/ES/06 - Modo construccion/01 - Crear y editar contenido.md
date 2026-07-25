@info
icon: 🔧
description: Crear y editar tu curso
@/info

@section
index: 1
title: Modo construcción
@/section

Para **escribir** un curso usa el modo construcción (martillo / llave en el mapa). Ahí creas carpetas, lecciones, texto y preguntas.

Si aún no tienes rama propia: en el **Bosque**, **Crear rama**.

@image
url: ./media/12-construccion-es.png
caption: Editas carpetas, lecciones y el índice.
@/image

@section
index: 2
title: Esta demo
@/section

Como un curso en línea de otro autor, esta demo es **solo lectura**: puedes mirar la construcción, pero no guardar aquí.

Para editarla: entra en modo construcción y elige un **nombre** para tu copia. En esa copia sí puedes cambiar y escribir.

@quiz
concept: Demo readonly
items:
  - question: ¿Cómo haces una copia editable de esta demo?
    answer: Modo construcción y luego un nombre para tu copia
    modes: multiple,recall
    traps:
      - Editar el demo directo
      - Borrar Sage
      - Solo leer
  - question: ¿Puedes guardar cambios en la demo original?
    answer: No, solo en tu copia
    modes: multiple,recall
    traps:
      - Sí, siempre
      - Solo títulos
      - Solo en examen
  - question: ¿Para qué sirve el modo construcción?
    answer: Crear y editar tu curso
    modes: multiple,recall
    traps:
      - Solo jugar Arcade
      - Borrar Sage
      - Importar sin guardar
@/quiz

@section
index: 3
title: Exportar
@/section

**Exportar** crea un `.arborito` para compartir. Quien lo importe lo abre en el **Bosque**. No hace falta programar.

@quiz
concept: Exportar rama
items:
  - question: ¿Qué archivo compartes al exportar un curso?
    answer: Un archivo .arborito
    modes: multiple,recall
    traps:
      - .pdf solamente
      - .mp4
      - Un enlace de Arcade
  - question: ¿Dónde se importa ese archivo .arborito?
    answer: En el Bosque
    modes: multiple,recall
    traps:
      - Arcade
      - Solo examen
      - Sage
@/quiz
