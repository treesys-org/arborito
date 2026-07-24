@info
icon: 🔧
description: Crear y editar tu curso
@/info

@section
index: 1
title: Modo construcción
@/section

Para **escribir** un curso usa el modo construcción (martillo / llave en el mapa).

@image
url: ./media/12-construccion-es.png
caption: Editas carpetas, lecciones y el temario.
@/image

@section
index: 2
title: Esta demo no se guarda
@/section

Aquí puedes **mirar** la construcción, pero **no guardar**. Para editar de verdad: **Copiar a Mi jardín**.

En tu copia puedes renombrar, reordenar, escribir texto y preguntas, y activar un logro en una carpeta.

@quiz
concept: Demo readonly
items:
  - question: ¿Cómo editas el demo?
    answer: Copiar a Mi jardín y editar la copia
    modes: multiple,recall
    traps:
      - Editar el demo directo
      - Borrar Sage
      - Solo leer
  - question: ¿Puedes guardar cambios en la demo original?
    answer: No
    modes: multiple,recall
    traps:
      - Sí, siempre
      - Solo títulos
      - Solo en examen
  - question: ¿Para qué sirve el modo construcción en tu rama?
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
  - question: ¿Qué archivo compartes al exportar?
    answer: .arborito
    modes: multiple,recall
    traps:
      - .pdf solamente
      - .mp4
      - Un enlace de Arcade
  - question: ¿Dónde se importa ese archivo?
    answer: Bosque
    modes: multiple,recall
    traps:
      - Arcade
      - Solo examen
      - Sage
@/quiz
