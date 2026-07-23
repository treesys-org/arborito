# 🌳 Contributing to Arborito

First of all, **thank you** for being here. Arborito only exists because people like you care enough to improve it. Whether you're a learner, a teacher, a translator, a designer, a writer, or a developer, **there is a way for you to help**, and it doesn't have to be code.

Chat with the community on [Matrix (#arborito:matrix.org)](https://matrix.to/#/%23arborito:matrix.org).

> This guide is split in two:
> 1. **Anyone can contribute**: start here, no programming required.
> 2. **Developer notes**: architecture, components, styles. Read only if you plan to touch the code.

---

## 1. Anyone can contribute

### 💬 Report what's broken or confusing

If something in Arborito felt wrong, confusing, ugly, or just plain bad, **that's already a contribution**. Open an [issue](../../issues) and describe what you tried to do and what happened. You don't need to suggest a fix. Screenshots help.

There are no silly issues. "I couldn't find the button to do X" is genuinely useful feedback.

### 📚 Write or improve lessons (a "tree")

Arborito is, above all, a place to **share knowledge**. If you know about something, cooking, history, electrical wiring, knitting, programming, anything, you can plant a tree about it.

- The app has a **visual editor** ("Construction mode"), no command line required.
- Start small: a single lesson is enough. Other people can extend it later.
- Lessons can be in **any language**.

A short walkthrough lives in [`docs/AUTHORING.md`](docs/AUTHORING.md).
Folder / `.arborito` format (all `@` tags, quizzes, bilingual layout): same doc. Exports also ship author guides as `files/AUTHOR-GUIDE.md` / `files/AUTORIA.md`.

#### Four authoring principles

These come from the way Arborito reads trees and how its Spaced Repetition System (SRS) reinforces what you study. They are not rules, they are heuristics that make lessons more useful:

- **Atomic.** Each leaf lesson should cover **one concept**. If a lesson is really two ideas, split it into siblings.
- **Modular.** Don't write long, linear "books". A learner might arrive at your lesson from any branch, so avoid sentences like "as we saw in chapter 3". Reference by topic, not by order.
- **Self-contained.** Each leaf should deliver a complete (if small) piece of value on its own, so a learner who only opens that node still walks away with something.
- **Universal.** Write simply and clearly. Avoid unnecessary jargon, or define it the first time it appears. Translation is a first-class citizen.

Published lessons stay under **CC BY-SA 4.0**.

#### Lesson quiz: the `@quiz` block (five practice modes)

Each leaf lesson can include a fenced `@quiz` … `@/quiz` block with `concept`, `definition`, `question`, `answer` and optional `traps:` / `steps:` lists. The app uses it in **Care** (spaced repetition) and in the **Arcade**. You author it in **Construction mode** on the lesson, or with Sage's questionnaire wizard.

**Five practice modes** (the app picks one that is playable for the data you filled in; you can narrow with the `modes:` line):

| Mode | What the learner does | What you typically fill in |
|------|----------------------|----------------------------|
| **multiple** | Choose the correct option. | `question`, `answer`, at least one entry under `traps:` |
| **recall** | Recall the answer (then confirm). | `concept`, `answer` |
| **cloze** | Fill in a blank in the definition. | `definition` with `{phrase}` markers (multi-word phrases allowed) |
| **chips** | Tap words in order to form the answer. | `answer` with **several words** (spaces) |
| **steps** | Tap steps in the right order. | `steps:` list with two or more entries (wizard: **Order concepts**) |

**Exam nodes (`@exam`):** one node can hold **many** `@quiz` blocks in sequence (useful for long drills). Games and the SDK should read **all** challenges via `lesson.challenges`, not only the first.

Optional flags inside the `@quiz` block: `pass_rate: 75` (default **80** when omitted), `modes: recall,multiple` (comma-separated list to limit modes). Modes also follow filled fields (traps → multiple, steps → order). See [`src/features/learning/api/quiz-schema.js`](src/features/learning/api/quiz-schema.js) and [`docs/AUTHORING.md`](docs/AUTHORING.md) for the Construction wizard layout.

Example:

```
@quiz
concept: GNU/Linux
definition: {Sistema operativo} libre basado en el {kernel} Linux y herramientas {GNU}
question: ¿Qué es GNU/Linux?
answer: Un sistema operativo de código abierto basado en el kernel Linux
modes: cloze,multiple,recall,chips
traps:
- Un editor de texto
- Una base de datos relacional
@/quiz
```

### ✍️ Polish existing lessons

Read a lesson and spot a typo? An unclear sentence? A quiz answer that's wrong? **Fix it in the app and propose your change**, or open an issue describing the lesson and the problem.

You don't need to be a domain expert, clear writing matters as much as correct content.

### 🌍 Translate

Arborito ships in **English** and **Spanish** today, and we want every language.

- **UI translation:** the strings live in [`locales/`](locales/) as JSON files. Copy `en/` to your language code, translate the values (not the keys), and open a PR. There's a `manifest.json` listing the files.
- **Lesson translation:** open a tree in the app and translate lessons one at a time, or fork a tree.

If a sentence sounds robotic in your language, **trust your instinct** and rephrase it, we'd rather have natural local phrasing than a literal translation.

### 🎨 Design and accessibility

You don't have to write CSS to improve the look or the experience.

- Spot something that doesn't work on your screen size? Open an issue with a screenshot.
- Have a mockup, color palette, or icon idea? Attach it to an issue or pull request.
- Notice a contrast / focus-ring / screen-reader problem? Please tell us, accessibility issues are top priority.

### 🧪 Just try Arborito and tell us how it went

Honestly, this is more useful than people realise. Open [arborito.org](https://arborito.org) (or run from source with `npm run dev`), walk through onboarding, plant a tree, sign in, sign out. Write down anything that surprised you (good or bad) and open an issue.

### 🚀 How to share your change

1. **Easiest path:** open an [issue](../../issues) describing what you'd like to change. We'll help you turn it into a pull request.
2. **If you're comfortable with Git:** fork the repo, create a branch, commit, push, and open a pull request. We'll review it kindly.

There's no formal contributor license agreement. The project is GPL-3.0; by submitting a PR you agree your contribution is also released under GPL-3.0.

### 🤝 Code of conduct (short version)

Be patient and kind. Assume the other person is doing their best. Disagree about ideas, not about people. If something feels off, contact a maintainer privately. We will remove people who make others feel unsafe.

---

## 2. Developer notes

> If you want the **map** of the codebase first, start with [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md).

This guide walks through the Arborito frontend: **Vite + React 19** + **Zustand** for React state, plus **Tailwind CSS v3**.

**Quick map:** `index.html` → `src/main.jsx` → `src/app/App.jsx` → `HeavyShell` + `OverlayShell`.

### Where to put your change

| You want to… | Open |
|--------------|------|
| Change a button or screen | `src/features/<name>/components/` or `modals/` |
| Change UI behaviour | `src/features/<name>/hooks/use<Name>.js` |
| Change search/Nostr/PDF logic | `src/features/<name>/api/` |
| Change store actions for a domain | `src/stores/<domain>-store-actions.js` (expose via the feature hook) |

**Rule:** In `.jsx` files, import **`useSearch`**, **`useForum`**, etc., **not** `core/store.js`. Hooks live in `features/<name>/hooks/`. See [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md).

**Golden example:** [`src/features/search/`](src/features/search/), `hooks/useSearch.js` + `components/` + `modals/` + `api/`.

**New modals:** follow [`SearchModal.jsx`](src/features/search/modals/SearchModal.jsx) or [`PrivacyModal.jsx`](src/features/privacy-gdpr/modals/PrivacyModal.jsx).

---

### 🏛️ Architecture overview

The application is **Vite + React 19** with a central store and Zustand mirrors for React state.

**Start here:** [`docs/PRODUCT_GUIDE.md`](docs/PRODUCT_GUIDE.md) · [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)

#### 1. The global store (`src/core/store.js`)

- **Single source of truth** for tree data, modal routing, and cross-feature orchestration.
- **Event bus:** dispatches `state-change` when state updates.
- **React access:** `useArboritoStore()` / `useApp()`, **not** direct `import { store }` from `.jsx`.

Domain actions live in `stores/*-store-actions.js` and are exposed through feature hooks (`useForum()`, etc.).

#### 2. Feature modules

Each domain lives under `src/features/<name>/`:

- `components/` + `modals/`, React `.jsx`
- `hooks/useX.js`, **only** import path for UI components
- `api/`, pure JS (Nostr, crypto, PDF, geometry)

Examples:

- `src/features/nostr/api/client/index.js`, Nostr universe service
- `src/features/learning/api/`, quiz schema, Sage prefs
- `src/features/backup-export/api/`, filesystem abstraction

#### 3. Modals

`ModalHost.jsx` routes `store.value.modal` to lazy `.jsx` modals. Copy [`SearchModal.jsx`](src/features/search/modals/SearchModal.jsx) or [`PrivacyModal.jsx`](src/features/privacy-gdpr/modals/PrivacyModal.jsx).

---

### 🛠️ How to add a new screen

1. Create `src/features/<your-feature>/components/HelloWorld.jsx` (or `modals/` if it is a modal).
2. Add logic in `hooks/useYourFeature.js` and export from `index.js`.
3. Wire the component in the shell or register it in `modal-chunk-loaders.js` if it is a modal.

```jsx
import { useGardenProgress } from '../hooks/useGardenProgress.js';

export function HelloWorld() {
  const { ui, username } = useGardenProgress();
  return (
    <div className="p-4 bg-blue-100 dark:bg-blue-900 rounded-lg">
      <p>Hello, {username || 'Traveler'}!</p>
    </div>
  );
}
```

**Do not** use `customElements.define` or `innerHTML` in new feature code.

### 🧱 Shared UI (React)

| Component | File | Use for |
|-----------|------|---------|
| `ModalShell` / `DockHubShell` | `src/app/components/` | Modal frames |
| `Callout` | `src/shared/ui/` (or feature) | Info / warn banners |
| `ChromeEmoji` | `src/app/components/ChromeEmoji.jsx` | Offline emoji glyphs |
| `LoadingBrand` | shared loading components | Spinners |

**Authoritative spec:** [`docs/MODAL_STANDARDS.md`](docs/MODAL_STANDARDS.md).

Modal chrome is React-only, **new modals must be JSX** (`ModalShell`, `Callout`, feature components).

#### Large features

Split into `components/`, `hooks/`, and `api/` subfolders. Keep files under **1000 lines** (`npm run check:max-lines`). New store actions go in `stores/<domain>-store-actions.js`.

### 🎨 Styling

- **Tailwind CSS:** utility classes are compiled at build time. Edit `src/shared/styles/main.entry.css` and feature `styles/`, then run `npm run build:css`. Vite bundles CSS via `src/main.jsx`.
- **Custom CSS:** semantic tokens in `src/shared/styles/foundation/tokens.css`; `tailwind.config.js` mirrors a **subset** of Tailwind colors to `--color-step` for `var(--*)` in custom CSS. Scrollbar/readme tweaks live in `src/shared/styles/foundation/scroll-readme.css`. Modal layout and `arborito-animations-prose.css` (keyframes, `.prose`) live in `src/shared/styles/`; `preflight` is off.
- **Dark mode:** the `dark` class is toggled on the `<html>` element by the store. Use Tailwind's `dark:` prefixes (e.g. `bg-white dark:bg-slate-900`).

### 🤝 Submission process

Coordinate with the project maintainers using whatever workflow they use for this codebase (branching, reviews, and merges are project-specific). When in doubt, **open an issue first** and we'll guide you.

We look forward to your contributions!

---

## ⚖️ If you fork or ship your own build

Contributions merged upstream are one thing; **publishing your own fork or public instance** is another. To protect **end users** and **everyone's clarity** about who maintains what, read [`docs/forking-and-branding.md`](docs/forking-and-branding.md) before you distribute binaries or host a copy others will use. It covers GPL expectations, **non-misleading** use of the Arborito / Treesys names, and disclaimers for **unofficial** deployments. **Not legal advice.**
