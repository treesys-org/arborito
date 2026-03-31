# 🌳 Contributing to Arborito

First off, thank you for considering contributing! Arborito is a community-driven project, and your help is essential for its growth.

If the repo feels large: see **[`docs/dev-onboarding.md`](docs/dev-onboarding.md)** — it explains the structure, `node_modules`, generated `main.css`, and that **Arcade / game player** use the **same Tailwind pipeline** as every other screen.

This guide walks through the Arborito frontend: **vanilla ES modules** for app code, with a **small CSS build** for Tailwind.

**Quick map:** `index.html` → `src/main.js` → imports `src/components/*`, `src/store.js`. Styles: edit `src/styles/main.entry.css`, never hand-edit `main.css` (generated). Electron: `electron-main.js` is the *main process*; `src/main.js` runs in the *renderer* (browser). See **`README.md` → Repository layout** for the full table.

## ✨ Core Philosophy: no JS bundler

Application logic uses **no Webpack/Vite/Rollup**. That keeps the codebase easy to follow:

1.  Clone the repository.
2.  For **Electron:** `npm install` and `npm start` (recommended).
3.  For **browser testing:** serve the folder over HTTP and run `npm run build:css` once (or after editing styles) so `src/styles/main.css` matches `main.entry.css`.

Optional in-browser AI loads `@huggingface/transformers` from a CDN **only when** that feature runs (see `importmap` in `index.html`). Styles and the main app do **not** use a Tailwind CDN.

---

## 🏛️ Architecture Overview

The application follows a classic, centralized state management pattern, similar to Redux or Vuex, but implemented in vanilla JavaScript.

### 1. The Global Store (`src/store.js`)

This is the heart of the application.

*   **Single Source of Truth:** `store.js` holds the entire application state in its `this.state` object. This includes everything from the current theme (`'dark'`) to the loaded knowledge tree (`data`) and the selected node (`selectedNode`).
*   **Event Bus:** The store is an `EventTarget`. When its state changes, it dispatches a `state-change` event.
*   **Global Access:** It is exported as a singleton instance, `store`, which can be imported into any component or service.

**How it works:**

1.  A component calls a method on the store (e.g., `store.setModal('search')`).
2.  The method calls `this.update({ modal: 'search' })`.
3.  The `update` method merges the new state and dispatches the `state-change` event.
4.  All components listening for this event will re-render themselves with the new state.

```javascript
// src/store.js - Simplified
class Store extends EventTarget {
    constructor() {
        this.state = { /* ... initial state ... */ };
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

### 2. Services (`src/services/`)

Services encapsulate specific domains of logic. They are typically classes or objects that handle one thing well.

*   `github.js`: Manages all interactions with the GitHub API (reading files, creating PRs).
*   `ai.js`: Handles communication with AI providers (Puter.com, Ollama).
*   `filesystem.js`: The most important service. It's an **abstraction layer** that decides whether to talk to the `github` service (for remote trees) or the `user-store` (for local trees). Components should **always** use `fileSystem.js` to read or write data, as it keeps them decoupled from the data source.

Services can import and call the `store` if they need to access state or trigger updates.

### 3. Components (`src/components/`)

All UI elements are **native Web Components** (extending `HTMLElement`).

*   **Self-Contained:** Each component manages its own HTML structure and event listeners.
*   **Reactive:** They connect to the global `store` in their `connectedCallback` and listen for the `state-change` event to re-render.
*   **Action Dispatchers:** User interactions (like button clicks) within a component call methods on the global `store` to trigger state changes (e.g., `store.toggleTheme()`).

---

## 🛠️ How to Create a New Component

Let's create a simple "Hello World" component.

**Step 1: Create the file `src/components/hello-world.js`**

```javascript
// 1. Import the global store
import { store } from '../store.js';

// 2. Define the component class, extending HTMLElement
class HelloWorld extends HTMLElement {

    // 3. The connectedCallback is called when the element is added to the DOM
    connectedCallback() {
        // Initial render
        this.render();

        // Listen for state changes from the store to re-render
        store.addEventListener('state-change', () => this.render());
    }

    // 4. The render method builds the component's HTML
    render() {
        // Get data from the store
        const { username } = store.value.gamification;
        const ui = store.ui; // Localized strings

        // Use innerHTML to define the component's view
        this.innerHTML = `
            <div class="p-4 bg-blue-100 dark:bg-blue-900 rounded-lg">
                <p>Hello, ${username || 'Traveler'}!</p>
                <button id="my-button" class="font-bold">${ui.close}</button>
            </div>
        `;

        // 5. Add event listeners after rendering
        this.querySelector('#my-button').onclick = () => {
            // Call a store method to change the state
            alert('Button clicked!');
        };
    }
}

// 6. Register the custom element with a tag name
customElements.define('hello-world', HelloWorld);
```

**Step 2: Import the component in `src/main.js`**

Add this line to `src/main.js` to make the component available to the application.

```javascript
// src/main.js
import './components/hello-world.js';
// ... other imports
```

**Step 3: Use the component in `index.html`**

You can now use your component like any other HTML tag.

```html
<!-- index.html -->
<body>
    <div id="app">
        <!-- ... other components ... -->
        <hello-world></hello-world>
    </div>
</body>
```

That's it! Your component is now live, reactive, and integrated into the app.

## 🎨 Styling

*   **Tailwind CSS:** Utility classes are compiled at build time (no CDN). Edit `src/styles/main.entry.css` and modular CSS under `src/styles/`, then run `npm run build:css` (or `npm start` / `npm run dist`, which run the CSS build first). Output is `src/styles/main.css`, linked from `index.html`.
*   **Custom CSS:** Semantic tokens in `foundation/tokens.css`; `tailwind.config.js` mirrors a **subset** of Tailwind colors to `--color-step` for `var(--*)` in custom CSS. Scrollbar/readme tweaks live in `foundation/scroll-readme.css`. Modals and `arborito-animations-prose.css` (keyframes, `.prose`) live alongside Tailwind; `preflight` is off.
*   **Dark Mode:** The `dark` class is toggled on the `<html>` element by the store. Use Tailwind's `dark:` prefixes (e.g., `bg-white dark:bg-slate-900`).

## 🤝 Submission Process

1.  Fork the [Arborito repository](https://github.com/treesys-org/arborito).
2.  Make your changes on a new branch.
3.  Submit a Pull Request to the `main` branch of the original repository.

We look forward to seeing your contributions!