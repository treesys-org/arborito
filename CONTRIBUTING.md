# 🌳 Contributing to Arborito

First of all — **thank you** for being here. Arborito only exists because people like you care enough to improve it. Whether you're a learner, a teacher, a translator, a designer, a writer, or a developer, **there is a way for you to help**, and it doesn't have to be code.

> This guide is split in two:
> 1. **Anyone can contribute** — start here, no programming required.
> 2. **Developer notes** — architecture, components, styles. Read only if you plan to touch the code.

---

## 1. Anyone can contribute

### 💬 Report what's broken or confusing

If something in Arborito felt wrong, confusing, ugly, or just plain bad — **that's already a contribution**. Open an [issue](../../issues) and describe what you tried to do and what happened. You don't need to suggest a fix. Screenshots help.

There are no silly issues. "I couldn't find the button to do X" is genuinely useful feedback.

### 📚 Write or improve lessons (a "tree")

Arborito is, above all, a place to **share knowledge**. If you know about something — cooking, history, electrical wiring, knitting, programming, anything — you can plant a tree about it.

- The app has a **visual editor** ("Construction mode") — no command line required.
- Start small: a single lesson is enough. Other people can extend it later.
- Lessons can be in **any language**.

A short walkthrough lives in [`docs/AUTHORING_WITHOUT_CLI.md`](docs/AUTHORING_WITHOUT_CLI.md).

#### Four authoring principles

These come from the way Arborito reads trees and how its Spaced Repetition System (SRS) reinforces what you study. They are not rules — they are heuristics that make lessons more useful:

- **Atomic.** Each leaf lesson should cover **one concept**. If a lesson is really two ideas, split it into siblings.
- **Modular.** Don't write long, linear "books". A learner might arrive at your lesson from any branch, so avoid sentences like "as we saw in chapter 3". Reference by topic, not by order.
- **Self-contained.** Each leaf should deliver a complete (if small) piece of value on its own, so a learner who only opens that node still walks away with something.
- **Universal.** Write simply and clearly. Avoid unnecessary jargon, or define it the first time it appears. Translation is a first-class citizen.

#### Transparency about AI-assisted content

It is fine to draft a lesson with the help of a language model. We only ask that **a human reviews and edits** the result before publishing, and that you treat AI as a co-author whose claims still need fact-checking. If a tree is largely AI-drafted, saying so in its description is a kind thing to do for future readers and forkers. All published lessons remain under **CC BY-SA 4.0**, regardless of how they were drafted.

#### Quiz V2 — the lesson questionnaire (five practice modes)

Each leaf lesson can include a **Quiz V2** block — a single fenced `@quiz` … `@/quiz` region with `concept`, `definition`, `question`, `answer` and optional `traps:` / `steps:` lists. The app uses it in **Care** (spaced repetition) and in the **Arcade**. You author it in **Construction mode** on the lesson, or with Sage's questionnaire wizard.

**Five practice modes** (the app picks one that is playable for the data you filled in; you can narrow with the `modes:` line):

| Mode | What the learner does | What you typically fill in |
|------|----------------------|----------------------------|
| **multiple** | Choose the correct option. | `question`, `answer`, at least one entry under `traps:` |
| **recall** | Recall the answer (then confirm). | `concept`, `answer` |
| **cloze** | Fill in a blank in the definition. | `definition` with `{phrase}` markers (multi-word phrases allowed) |
| **chips** | Tap words in order to form the answer. | `answer` with **several words** (spaces) |
| **steps** | Tap steps in the right order. | `steps:` list with two or more entries |

**Exam nodes (`@exam`):** one node can hold **many** `@quiz` blocks in sequence (useful for long drills). Games and the SDK should read **all** challenges via `lesson.challenges`, not only the first.

Optional flags inside the `@quiz` block: `skip_multiple: yes`, `skip_ordering: yes`, `modes: recall,multiple` (comma-separated list to limit modes). See [`src/features/learning/quiz-v2-schema.js`](src/features/learning/quiz-v2-schema.js) for validation rules.

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

You don't need to be a domain expert — clear writing matters as much as correct content.

### 🌍 Translate

Arborito ships in **English** and **Spanish** today, and we want every language.

- **UI translation:** the strings live in [`locales/`](locales/) as JSON files. Copy `en/` to your language code, translate the values (not the keys), and open a PR. There's a `manifest.json` listing the files.
- **Lesson translation:** open a tree in the app and translate lessons one at a time, or fork a tree.

If a sentence sounds robotic in your language, **trust your instinct** and rephrase it — we'd rather have natural local phrasing than a literal translation.

### 🎨 Design and accessibility

You don't have to write CSS to improve the look or the experience.

- Spot something that doesn't work on your screen size? Open an issue with a screenshot.
- Have a mockup, color palette, or icon idea? Attach it to an issue or pull request.
- Notice a contrast / focus-ring / screen-reader problem? Please tell us — accessibility issues are top priority.

### 🧪 Just try Arborito and tell us how it went

Honestly, this is more useful than people realise. Install Arborito, walk through onboarding, plant a tree, sign in, sign out. Write down anything that surprised you (good or bad) and open an issue.

### 🚀 How to share your change

1. **Easiest path:** open an [issue](../../issues) describing what you'd like to change. We'll help you turn it into a pull request.
2. **If you're comfortable with Git:** fork the repo, create a branch, commit, push, and open a pull request. We'll review it kindly.

There's no formal contributor license agreement. The project is GPL-3.0; by submitting a PR you agree your contribution is also released under GPL-3.0.

### 🤝 Code of conduct (short version)

Be patient and kind. Assume the other person is doing their best. Disagree about ideas, not about people. If something feels off, contact a maintainer privately. We will remove people who make others feel unsafe.

---

## 2. Developer notes

> If you want the **map** of the codebase first, start with [`docs/dev-onboarding.md`](docs/dev-onboarding.md) — it explains the layout, why `node_modules/` is gitignored, why `main.css` is auto-generated, and that **Arcade / game player** use the **same Tailwind pipeline** as every other screen.

This guide walks through the Arborito frontend: **vanilla ES modules** for app code, plus a **small CSS build** for Tailwind.

**Quick map:** `index.html` → `src/boot.js` → `src/main.js` → `src/app-entry.js` → imports the central state from `src/core/store.js` and every web component from `src/features/*` / `src/shared/ui/`. Styles: edit `src/shared/styles/main.entry.css` (it `@import`s every feature's `styles/`); never hand-edit `main.css` (generated). Electron: `electron-main.js` is the *main process*; `src/main.js` runs in the *renderer* (browser). See [`docs/dev-onboarding.md`](docs/dev-onboarding.md) for the full tree.

### ✨ Core philosophy: no JS bundler

Application logic uses **no Webpack / Vite / Rollup**. That keeps the codebase easy to follow:

1. Clone the repository.
2. For **Electron:** `npm install` and `npm start` (recommended).
3. For **browser testing:** serve the folder over HTTP and run `npm run build:css` once (or after editing styles) so `src/shared/styles/main.css` matches `main.entry.css`.

Optional in-browser AI uses **wllama** (WebAssembly llama.cpp) — vendored under `vendor/wllama/`, with a CDN fallback at jsDelivr — and is only loaded after the user accepts the in-browser AI consent. On the desktop build the same Sage UI talks to **native `node-llama-cpp`** via the Electron preload bridge (see `src/features/learning/ai.js`). Styles and the main app do **not** use a Tailwind CDN.

---

### 🏛️ Architecture overview

The application follows a classic, centralised state-management pattern (similar to Redux or Vuex), implemented in vanilla JavaScript.

#### 1. The global store (`src/core/store.js`)

This is the heart of the application.

- **Single source of truth:** `store.js` holds the entire application state in its `this.state` object — current theme, loaded knowledge tree, selected node, and so on.
- **Event bus:** the store is an `EventTarget`. When state changes, it dispatches a `state-change` event.
- **Global access:** it is exported as a singleton instance, `store`, which can be imported into any component or service.

**How it works:**

1. A component calls a method on the store (e.g. `store.setModal('search')`).
2. The method calls `this.update({ modal: 'search' })`.
3. `update` merges the new state and dispatches the `state-change` event.
4. Every component listening for this event re-renders itself with the new state.

```javascript
// src/core/store.js — simplified
class Store extends EventTarget {
    constructor() {
        this.state = { /* … initial state … */ };
    }

    update(partialState) {
        this.state = { ...this.state, ...partialState };
        this.dispatchEvent(new CustomEvent('state-change', { detail: this.value }));
    }

    setModal(modal) {
        this.update({ modal });
    }
}

export const store = new Store();
```

#### 2. Services (now under each feature)

What used to be `src/services/*` is now split by feature — every service that belonged to a domain lives next to it:

- `src/features/nostr/nostr-universe.js`: public `nostr://` trees, bundles, share codes, and forum snapshots.
- `src/features/learning/ai.js`: AI provider abstraction. Routes through native `llama.cpp` in the Electron desktop build (via `ai-llamacpp-bridge.js` + `arboritoElectron.llamacpp` IPC) and through `wllama` (WebAssembly) in the browser (via `ai-worker.js`). Same GGUF models on both backends.
- `src/features/backup-export/filesystem.js`: abstraction for reading/writing lesson files depending on the active source (local garden, public tree, or read-only HTTPS bundle). Components should use `fileSystem.js` rather than duplicating source logic.

Services can import and call the `store` if they need to access state or trigger updates.

#### 3. Components (one per feature)

What used to be `src/components/*` and `src/components/modals/*` is now split by feature: every web component lives in `src/features/{feature}/` or `src/features/{feature}/modals/`. Cross-feature primitives (`modal-shell`, `dialog`, `toast-stack`, `modal-overlay-host`) live in `src/shared/ui/`.

All UI elements are **native Web Components** (extending `HTMLElement`).

- **Self-contained:** each component manages its own HTML structure and event listeners.
- **Reactive:** they connect to the global `store` in `connectedCallback` and listen for `state-change` to re-render.
- **Action dispatchers:** user interactions (button clicks, etc.) call methods on the global `store` to trigger state changes (e.g. `store.toggleTheme()`).

---

### 🛠️ How to create a new component

Let's build a simple "Hello World" component.

**Step 1: Create the file `src/features/{your-feature}/hello-world.js`**

(Pick the feature it belongs to — `shell-chrome/` for a chrome widget, `learning/` for a lesson UI, etc. If it doesn't fit any feature, create a new one.)

```javascript
import { store } from '../../core/store.js';

class HelloWorld extends HTMLElement {
    connectedCallback() {
        this.render();
        store.addEventListener('state-change', () => this.render());
    }

    render() {
        const { username } = store.value.gamification;
        const ui = store.ui;

        this.innerHTML = `
            <div class="p-4 bg-blue-100 dark:bg-blue-900 rounded-lg">
                <p>Hello, ${username || 'Traveler'}!</p>
                <button id="my-button" class="font-bold">${ui.close}</button>
            </div>
        `;

        this.querySelector('#my-button').onclick = () => {
            alert('Button clicked!');
        };
    }
}

customElements.define('hello-world', HelloWorld);
```

**Step 2: Import the component in `src/app-entry.js`**

```javascript
import './features/your-feature/hello-world.js';
```

**Step 3: Use the component in `index.html`**

```html
<body>
    <div id="app">
        <hello-world></hello-world>
    </div>
</body>
```

That's it — your component is now live, reactive, and integrated.

### 🧱 Unified UX helpers (use them for any new modal / surface)

> **Authoritative spec:** [`docs/MODAL_STANDARDS.md`](docs/MODAL_STANDARDS.md).
> That document contains the hard rule, the live per-modal compliance table, and the script to regenerate it. If you're going to touch a modal, **read it first**. The section here is just a summary.

Arborito has a small set of **single-source-of-truth helpers** that keep modals consistent across desktop and mobile. **Use them before inventing fresh HTML** — they are *why* the app looks coherent and *why* a regression in one helper fixes the whole app.

| Helper | File | Use for |
|--------|------|---------|
| `modalShellHtml({ bodyHtml, mobile, panelSize, lift, rootFlags, panelAttrs })` | `src/shared/ui/modal-shell.js` | The **outer modal frame** (overlay, panel sizing, mobile sheet vs. desktop card, lift/shadow). Don't hand-roll `<div class="fixed inset-0 …">`. |
| `modalHeroHtml(ui, { title, leadingIcon, subtitle, tone, backTagClass, closeTagClass, mobile })` | `src/shared/ui/modal-hero.js` | The **header bar** (title, back-arrow on mobile, close × on desktop, danger tone for warnings). |
| `calloutHtml({ tone, size, title, body, htmlBody, inline })` | `src/shared/ui/callout.js` | **Banners / callouts** (info / warn / danger). One look, all locales. |
| `loadingHtml({ label, variant, size, tone })` | `src/shared/ui/loading.js` | **Loading states** (spinner + label). Inline chip / centered block / fullbleed. |
| `bindCloseTaps(root, selectors, handler)` | `src/shared/ui/mobile-tap.js` | **Touch-safe close bindings.** Replaces the old `.onclick = () => …` pattern that double-fired on iOS. |
| `.arborito-cta-{tone}` (`emerald`, `slate`, `amber`, `rose`, `purple`, `blue`, `green`, `red`, `sky`, `indigo`) | `src/shared/styles/utilities/arborito-cta.css` | Button color + hover + dark mode. Padding/font/rounded stay Tailwind at the call site. |
| `.arborito-input` | `src/shared/styles/utilities/arborito-forms.css` | Form inputs. Replaces ad-hoc `border + bg-* + dark:bg-*` chains. |
| `.arborito-mmenu-back` | `src/features/shell-chrome/styles/*` | Canonical mobile back-button chip. |

**Rule of thumb:** if you find yourself writing a `<div class="fixed inset-0 …">` overlay or a `<button class="bg-blue-600 hover:bg-blue-500 …">`, stop and use the helper / semantic class instead. If a helper is missing what you need, **extend the helper** (add an `opts` field) rather than fork the HTML at the call site.

#### Big components → mixin pattern

Big components (e.g. `sources.js`, the forum modal, `store.js`) split into **mixin files** that get `Object.assign(Class.prototype, methods)`-applied. That keeps the host class small (< 700 lines) while preserving `this` semantics. See `src/features/sources/modals/sources-*.js` (component mixins) and `src/features/*/store-mixins/*.js` (store mixins, grouped by domain) for the canonical layout. New big components should follow the same pattern instead of growing past ~1000 lines.

### 🎨 Styling

- **Tailwind CSS:** utility classes are compiled at build time (no CDN). Edit `src/shared/styles/main.entry.css` and the modular CSS under `src/shared/styles/` (cross-feature) or `src/features/{feature}/styles/` (feature-scoped), then run `npm run build:css` (or `npm start` / `npm run dist`, which run the CSS build first). Output is `src/shared/styles/main.css`, linked from `boot.js`.
- **Custom CSS:** semantic tokens in `src/shared/styles/foundation/tokens.css`; `tailwind.config.js` mirrors a **subset** of Tailwind colors to `--color-step` for `var(--*)` in custom CSS. Scrollbar/readme tweaks live in `src/shared/styles/foundation/scroll-readme.css`. Modal layout and `arborito-animations-prose.css` (keyframes, `.prose`) live in `src/shared/styles/`; `preflight` is off.
- **Dark mode:** the `dark` class is toggled on the `<html>` element by the store. Use Tailwind's `dark:` prefixes (e.g. `bg-white dark:bg-slate-900`).

### 🤝 Submission process

Coordinate with the project maintainers using whatever workflow they use for this codebase (branching, reviews, and merges are project-specific). When in doubt, **open an issue first** and we'll guide you.

We look forward to your contributions!

---

## ⚖️ If you fork or ship your own build

Contributions merged upstream are one thing; **publishing your own fork or public instance** is another. To protect **end users** and **everyone's clarity** about who maintains what, read [`docs/forking-and-branding.md`](docs/forking-and-branding.md) before you distribute binaries or host a copy others will use. It covers GPL expectations, **non-misleading** use of the Arborito / Treesys names, and disclaimers for **unofficial** deployments. **Not legal advice.**
