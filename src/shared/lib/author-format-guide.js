/**
 * Author-facing format reference, bundled as `files/AUTORIA.md` on every export.
 * @param {'ES'|'EN'|string} [lang]
 * @returns {string}
 */
export function getAuthorFormatGuide(lang = 'ES') {
    const l = String(lang || 'ES').toUpperCase().startsWith('EN') ? 'EN' : 'ES';
    return l === 'EN' ? GUIDE_EN : GUIDE_ES;
}

/** Short pointer included as `files/EXPORT-GUIDE.txt`. */
export function getExportGuideTxt(lang = 'ES') {
    const l = String(lang || 'ES').toUpperCase().startsWith('EN') ? 'EN' : 'ES';
    if (l === 'EN') {
        return [
            'Arborito export (.arborito)',
            '',
            'A ZIP file, unzip it and the folders are the course.',
            '',
            'Two rules:',
            '  1. Parallel lessons/ES/… and lessons/EN/…, same position (01/02) = same lesson.',
            '  2. Text after "NN -" in each file is the lesson title.',
            '',
            'Full author format (file syntax): files/AUTHOR-GUIDE.md',
            '',
            'Re-import: Arborito → Trees → Import.'
        ].join('\n');
    }
    return [
        'Exportación Arborito (.arborito)',
        '',
        'Es un ZIP: al descomprimirlo, las carpetas son el curso.',
        '',
        'Dos reglas:',
        '  1. lessons/ES/… y lessons/EN/… en paralelo, misma posición (01/02) = misma lección.',
        '  2. El texto tras "NN -" en cada archivo es el título de la lección.',
        '',
        'Formato completo del autor (sintaxis de archivo): files/AUTORIA.md',
        '',
        'Reimportar: Arborito → Árboles → Importar.'
    ].join('\n');
}

const GUIDE_ES = `# Guía del autor, formato Arborito

Esta carpeta es un curso editable. No hace falta terminal: descomprime el .arborito, edita archivos y vuelve a importar en Arborito → Árboles → Importar.

## 1. Estructura (lo esencial)

\`\`\`
manifest.json              ← nombre del curso (no toques el id si reimportas)
lessons/
  ES/01 - Saludos/
    README.md              ← opcional: intro del módulo (texto normal)
    01 - Hola.md           ← lección
  EN/01 - Greetings/
    01 - Hello.md
files/
  README.md                ← opcional: intro del curso
  AUTORIA.md               ← este archivo
\`\`\`

**Dos reglas:**

1. **Carpetas ES y EN en paralelo**: misma posición numérica = misma lección en otro idioma.  
   Ejemplo: \`ES/01 - Saludos/02 - Adiós.md\` ↔ \`EN/01 - Greetings/02 - Goodbye.md\` (ambas son 01/02).

2. **El título es el nombre**: lo que va tras \`NN -\` en carpetas y archivos.  
   Ejemplo: \`03 - Gramática- to be.md\` → título «Gramática- to be».

## 2. Bloque @info (opcional, solo en lecciones .md)

Va **al inicio** del archivo, solo si necesitas algo que el nombre no puede decir:

\`\`\`
@info
title: Gramática: to be
icon: 📚
description: Breve resumen para el índice
discussion: https://…
tags: classroom, memory
@/info
\`\`\`

| Campo | Para qué sirve |
|-------|----------------|
| \`title:\` | Título con dos puntos u otros caracteres que no caben en el nombre del archivo |
| \`icon:\` | Emoji del nodo (por defecto 📄 o 📝 si es examen) |
| \`description:\` | Texto corto en el árbol |
| \`discussion:\` | Enlace al foro o hilo de debate |
| \`tags:\` | Etiquetas libres para filtrar en juegos del Arcade (ver abajo) |

El alumno **no ve** el bloque @info, solo metadatos.

## 3. Cuestionario @quiz (opcional)

**Solo dentro del cuerpo de la lección** (nunca en la cabecera del archivo, tras @info). Inserta el bloque **después** del texto o imágenes a los que pertenece. Para varias preguntas con el mismo contexto, usa **un solo** bloque con \`items:\` (pestaña «+ Añadir pregunta» en el editor). Varios bloques \`@quiz\` solo cuando cambia el contexto (p. ej. herbívoros vs carnívoros).

Bloque delimitado en medio del texto. El alumno responde en el mismo scroll, sin perder el material visual.

\`\`\`
@quiz
concept: hello
definition: {Saludo} informal en {inglés}
question: ¿Qué significa "hello"?
answer: Hola
modes: cloze,multiple,recall
traps:
- Adiós
- Gracias
@/quiz
\`\`\`

| Campo | Modo que habilita |
|-------|-------------------|
| \`concept:\` + \`answer:\` | Recall (recordar) |
| \`definition:\` con \`{palabras}\` | Cloze (rellenar huecos) |
| \`question:\` + \`answer:\` + \`traps:\` | Opción múltiple |
| \`answer:\` con varias palabras | Chips (ordenar palabras) |
| \`steps:\` (lista con 2+ ítems) | Pasos en orden |

\`modes:\` limita qué modos usar (valores: \`cloze\`, \`multiple\`, \`recall\`, \`chips\`, \`steps\`).

Flags opcionales: \`skip_multiple: yes\`, \`skip_ordering: yes\`.

En **nodos examen** (tipo \`exam\` en el árbol): intro en prosa y bloques \`@quiz\` al final. El alumno lee la intro y pulsa «Iniciar evaluación» para un flujo lineal pregunta a pregunta.

### Varias preguntas en un solo @quiz (sección cuestionario)

Una sección del temario puede ser solo cuestionario. Apila varias preguntas con \`items:\`:

\`\`\`
@quiz
items:
  - concept: hello
    definition: {Saludo} informal
    question: ¿Qué significa hello?
    answer: Hola
    modes: cloze,multiple,recall
  - concept: goodbye
    question: ¿Cómo se dice adiós?
    answer: Goodbye
    modes: multiple,recall
@/quiz
\`\`\`

Sin \`items:\`, un bloque @quiz sigue siendo una sola pregunta (comportamiento habitual).

## 4. Otros bloques (mismo patrón: @tag … @/tag)

Todos usan líneas \`clave: valor\` dentro del bloque:

\`\`\`
@section
title: Introducción
@/section

@subsection
title: Vocabulario clave
@/subsection

@image
url: https://ejemplo.org/foto.png
@/image

@video
url: https://www.youtube.com/watch?v=…
@/video

@audio
url: https://ejemplo.org/audio.mp3
@/audio

@game
url: https://…/juego.html
label: Simulador de aula
optional: yes
topics: classroom, memory
@/game
\`\`\`

| Bloque | Para qué |
|--------|----------|
| \`@section\` | Pantalla principal de la lección |
| \`@subsection\` | Ancla dentro de la pantalla |
| \`@image\` / \`@video\` / \`@audio\` | Medios embebidos |
| \`@game\` | Enlace a juego del Arcade (lección opcional) |

Todo lo demás es **Markdown normal** (# títulos, tablas, listas, código…).

## 5. Tags en @info (juegos del Arcade)

\`tags:\` es una lista separada por comas. Los juegos pueden filtrar lecciones por etiqueta. Ejemplos habituales en demos:

| Tag | Uso típico |
|-----|------------|
| \`classroom\` | Simulador de aula / preguntas rápidas |
| \`memory\` | Juego de pares / memoria |
| \`starship\` | Aventura narrativa |
| \`alonso\` | Duelo Alonso |

Puedes inventar las tuyas; sirven para que un cartucho ignore o priorice ciertas lecciones.

## 6. README.md en módulos

Texto plano (o Markdown) con la intro del módulo. Opcional. El título del módulo sigue siendo el **nombre de la carpeta**.

## 7. Consejos

- Empieza sin @info: si el nombre del archivo alcanza, el .md puede ser solo Markdown (+ @quiz si quieres).
- Al importar, Arborito avisa si un @quiz no tiene datos suficientes para ningún modo.
- En la app, el modo **Construcción** edita todo visualmente; esta guía es para quien prefiere carpetas y texto.

---

Árbol CC BY-SA · Arborito · https://treesys.org
`;

const GUIDE_EN = `# Author guide, Arborito format

This folder is an editable course. No terminal needed: unzip the .arborito, edit files, re-import via Arborito → Trees → Import.

## 1. Structure (the essentials)

\`\`\`
manifest.json              ← course name (avoid changing id on re-import)
lessons/
  ES/01 - Greetings/
    README.md              ← optional module intro (plain text)
    01 - Hello.md          ← lesson
  EN/01 - Greetings/
    01 - Hello.md
files/
  README.md                ← optional course intro
  AUTORIA.md               ← this file (AUTHOR-GUIDE.md on EN exports)
\`\`\`

**Two rules:**

1. **Parallel ES and EN folders**: same numeric position = same lesson in another language.  
   Example: \`ES/01 - Saludos/02 - Adiós.md\` ↔ \`EN/01 - Greetings/02 - Goodbye.md\` (both are 01/02).

2. **The title is the name**: text after \`NN -\` in folders and files.

## 2. @info block (optional, lesson .md only)

At the **top** of the file, only when the filename is not enough:

\`\`\`
@info
title: Grammar: to be
icon: 📚
description: Short blurb for the tree index
discussion: https://…
tags: classroom, memory
@/info
\`\`\`

| Field | Purpose |
|-------|---------|
| \`title:\` | Display title when colons etc. cannot go in the filename |
| \`icon:\` | Node emoji (default 📄 or 📝 for exams) |
| \`description:\` | Short tree blurb |
| \`discussion:\` | Forum or thread URL |
| \`tags:\` | Free-form labels for Arcade game filters (see below) |

Learners **never see** @info, metadata only.

## 3. @quiz block (optional)

**Body only** — never in the file header after @info. Insert the block **after** the prose or media it belongs to. For many questions sharing context, use **one** block with \`items:\` («+ Add question» in the editor). Multiple \`@quiz\` blocks only when context changes (e.g. herbivores vs carnivores).

Students answer inline in the same scroll without losing visual material.

\`\`\`
@quiz
concept: hello
definition: Informal {greeting} in {English}
question: What does "hello" mean?
answer: A greeting
modes: cloze,multiple,recall
traps:
- Goodbye
- Thanks
@/quiz
\`\`\`

| Field | Enables mode |
|-------|----------------|
| \`concept:\` + \`answer:\` | Recall |
| \`definition:\` with \`{words}\` | Cloze (fill blanks) |
| \`question:\` + \`answer:\` + \`traps:\` | Multiple choice |
| \`answer:\` with several words | Chips (word order) |
| \`steps:\` (2+ list items) | Step order |

\`modes:\` limits which modes run (\`cloze\`, \`multiple\`, \`recall\`, \`chips\`, \`steps\`).

Optional flags: \`skip_multiple: yes\`, \`skip_ordering: yes\`.

**Exam nodes** (\`type: exam\`): prose intro first, then \`@quiz\` blocks at the end. Students tap «Start evaluation» for a linear question-by-question flow.

### Multiple questions in one @quiz (quiz syllabus section)

\`\`\`
@quiz
items:
  - concept: hello
    definition: Informal {greeting}
    question: What does hello mean?
    answer: Hi
    modes: cloze,multiple,recall
@/quiz
\`\`\`

Without \`items:\`, a single @quiz block is one question.

## 4. Other blocks (same pattern: @tag … @/tag)

All use \`key: value\` lines inside the fence:

\`\`\`
@section
title: Introduction
@/section

@subsection
title: Key vocabulary
@/subsection

@image
url: https://example.org/photo.png
@/image

@video
url: https://www.youtube.com/watch?v=…
@/video

@audio
url: https://example.org/audio.mp3
@/audio

@game
url: https://…/game.html
label: Classroom sim
optional: yes
topics: classroom, memory
@/game
\`\`\`

| Block | Purpose |
|-------|---------|
| \`@section\` | Main lesson screen |
| \`@subsection\` | In-page anchor |
| \`@image\` / \`@video\` / \`@audio\` | Embedded media |
| \`@game\` | Arcade game link (optional lesson item) |

Everything else is **normal Markdown**.

## 5. @info tags (Arcade games)

\`tags:\` is a comma-separated list. Games may filter lessons. Common demo tags:

| Tag | Typical use |
|-----|-------------|
| \`classroom\` | Classroom sim / quick Q&A |
| \`memory\` | Pairs / memory game |
| \`starship\` | Narrative adventure |
| \`alonso\` | Alonso duel |

You can invent your own.

## 6. README.md in modules

Plain or Markdown module intro. Optional. Module title = **folder name**.

## 7. Tips

- Start without @info when the filename is enough.
- On import, Arborito warns if a @quiz cannot run any practice mode.
- In the app, **Construction** mode edits visually; this guide is for folder + text authors.

---

CC BY-SA tree · Arborito · https://treesys.org
`;
