# `.arborito` archive format

A `.arborito` file is a **ZIP archive** with a fixed layout. Arborito accepts two kinds:

| Kind | What it contains | Typical use |
|------|------------------|-------------|
| **Branch** | One full course (lessons, modules, languages) | Import, study, author, publish |
| **Tree** | A playlist manifest plus embedded branch archives | Combine several branches into one path |

See [`TREES_AND_BRANCHES.md`](TREES_AND_BRANCHES.md) for how branches and trees differ in the app.

## Branch archive (one course)

### Top level

```
my-course.arborito   (ZIP)
├── manifest.json
├── lessons/
│   ├── ES/
│   │   ├── 01 - Saludos/
│   │   │   ├── README.md          ← optional module intro
│   │   │   ├── 01 - Hola.md
│   │   │   └── 02 - Adios.md
│   │   └── 02 - Numeros/
│   │       └── 01 - Counting.md
│   └── EN/                        ← optional parallel language
│       └── 01 - Greetings/
│           └── 01 - Hello.md
└── files/
    ├── README.md                  ← course intro (optional)
    ├── AUTHOR-GUIDE.md            ← bundled on export (English UI)
    ├── AUTORIA.md                 ← bundled on export (Spanish UI)
    └── EXPORT-GUIDE.txt
```

### `manifest.json` (branch)

```json
{
  "magic": "ARBORITO_ARCHIVE",
  "version": 1,
  "meta": {
    "id": "demo-ingles-a1",
    "name": "English A1",
    "description": "Beginner English: greetings, numbers, daily routines.",
    "icon": "🇬🇧",
    "language": "ES"
  }
}
```

- `meta.language` is the **primary curriculum language folder** under `lessons/` (not the app UI language).
- `meta.id` should be stable if you publish to Nostr.

### Module folder `README.md`

Plain text or a short `@info` block. Optional `certifiable: yes` issues a **diploma** when students finish every lesson inside that folder:

```
@info
description: Greetings and polite phrases
certifiable: yes
@/info
```

### Lesson file `01 - Hello.md`

```markdown
@quiz
concept: hello
definition: {Informal greeting} in English, similar to {hola} in Spanish
question: What does "hello" mean?
answer: An informal greeting
modes: cloze,multiple,recall,chips,steps
traps:
- Goodbye
- Thank you
- Please
steps:
- Read the vocabulary table
- Practice the sample dialogue aloud
- Complete the review quiz
@/quiz

# Hello and goodbye

@section Vocabulary

| English | Spanish | When to use |
|---------|---------|-------------|
| hello | hola | Neutral greeting |
| hi | hola | Casual, with friends |
| goodbye | adiós | Standard farewell |

@section Practice

1. Greet three imaginary people using different registers.
2. Write one greeting line and one farewell line.
```

**Quiz modes** (see [`QUIZZES-AND-EXAMS.md`](QUIZZES-AND-EXAMS.md)):

| Mode | Author fills in |
|------|----------------|
| `multiple` | `question`, `answer`, `traps:` |
| `recall` | `concept`, `answer` |
| `cloze` | `definition` with `{blank}` markers |
| `chips` | `answer` with **several words** (spaces) |
| `steps` | `steps:` list (two or more lines) |

Optional blocks inside lessons: `@info`, `@section`, `@image`, `@video`, `@audio`, `@game`. Exam nodes use the same `@quiz` syntax inside a graph node marked `type: exam`.

### Parallel languages

Folders at the **same numeric position** link translations:

```
lessons/ES/01 - Saludos/01 - Hola.md
lessons/EN/01 - Greetings/01 - Hello.md
```

No JSON map is required: `01` + `01` pairs them.

## Tree archive (playlist)

A **tree** `.arborito` bundles a manifest and one or more **embedded branch** ZIP entries.

### Top level (simplified)

```
my-playlist.arborito   (ZIP)
├── manifest.json
├── tree.json
└── branches/
    ├── branch-a.arborito
    └── branch-b.arborito
```

### `manifest.json` (tree)

```json
{
  "magic": "ARBORITO_ARCHIVE",
  "version": 1,
  "meta": {
    "id": "tree-demo-playlist",
    "name": "Full-stack path",
    "description": "Linux basics, then Python.",
    "icon": "🌳",
    "kind": "composed-tree"
  }
}
```

### `tree.json` (playlist refs)

```json
{
  "branchRefs": [
    { "refId": "ref-linux", "branchId": "branch-linux-101", "order": 1 },
    { "refId": "ref-python", "branchId": "branch-python-101", "order": 2 }
  ]
}
```

Each `branches/*.arborito` is a full **branch** archive. When you open the tree in Arborito, each ref becomes a slot on the composed map.

## Import and export

| Action | Result |
|--------|--------|
| Import branch `.arborito` | Forest → Branches → stored in local garden |
| Import tree `.arborito` | Forest → Trees → playlist with embedded branches |
| Export branch | My garden → Export → single `.arborito` with `files/AUTHOR-GUIDE.md` |
| Export tree | Trees tab → Export → manifest + embedded branches |

Validation notes (non-blocking) are listed on import: empty quizzes, unclosed blocks, missing bilingual pairs.

## Related docs

- [`AUTHOR-FORMAT.md`](AUTHOR-FORMAT.md): block reference and quick rules
- [`QUIZZES-AND-EXAMS.md`](QUIZZES-AND-EXAMS.md): quizzes vs exam nodes
- [`ACHIEVEMENTS.md`](ACHIEVEMENTS.md): tree trophy vs folder diplomas
- [`NOSTR_BUNDLE_AND_PUBLISH.md`](NOSTR_BUNDLE_AND_PUBLISH.md): network publish format
