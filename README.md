
# 🌳 Arborito

**The Visual Browser for Decentralized Knowledge**

This is the **frontend** for Arborito: a serverless, vanilla JS “player” for knowledge trees.

**New here?** Read **[`docs/dev-onboarding.md`](docs/dev-onboarding.md)** first — layout, large files, and that **Arcade / Games** share the same Tailwind build as the rest of the app.

## 🔗 Knowledge sources & Nostr

**Boot:** With no saved tree, the app does **not** load a remote default. You choose **Nostr** (`nostr://` or share codes), **local** gardens, or any **HTTPS** JSON URL you add under Trees & libraries. On `localhost` / `127.0.0.1`, optional dev mode (`?localBoot=1` or `localStorage` key `arborito-local-boot`) can auto-open `./data/data.json` if present — still not a bundled remote curriculum.

**Nostr (same origin):** [`vendor/nostr-tools/lib/nostr.bundle.js`](vendor/nostr-tools/lib/nostr.bundle.js) is **vendored**. Default relay URLs live in [`src/config/nostr-relays-runtime.js`](src/config/nostr-relays-runtime.js); overrides and precedence are documented in **[`docs/NOSTR_RELAYS_CONFIGURATION.md`](docs/NOSTR_RELAYS_CONFIGURATION.md)**. Client logic: [`src/services/nostr-universe.js`](src/services/nostr-universe.js).

**Optional aliases:** [`src/config/tree-aliases.js`](src/config/tree-aliases.js) — empty by default; add short names → URLs if you ship curated links.

**Share codes & `nostr://`:** [`src/config/share-code.js`](src/config/share-code.js) and [`src/services/nostr-universe.js`](src/services/nostr-universe.js). `?source=` accepts HTTPS, aliases, share codes, and `nostr://` links.

**Third-party script CDN (in-browser AI):** the Sage worker loads **@wllama/wllama** from same-origin [`vendor/wllama/`](vendor/wllama/) first, with **jsDelivr** as a fallback **only after** explicit in-browser AI consent. Model weights are fetched from **Hugging Face Hub** URLs configured in the worker — see [`src/services/ai-worker.js`](src/services/ai-worker.js) and `index.html` CSP comments.

## 📈 Scale notes (millions of users)

Arborito is designed as **Nostr (control plane)** + **WebTorrent (data plane)** so that “millions reading the same course” is feasible with community seeders + lazy loading. See:

- [`docs/MILLIONS_SCALE_ARCHITECTURE.md`](docs/MILLIONS_SCALE_ARCHITECTURE.md)

## 📁 Repository layout (start here)

| Path | What it is |
|------|------------|
| `index.html` | Loads `src/main.js` (shell) and `src/styles/main.css` (styles). |
| `vendor/nostr-tools/` | Vendored **nostr-tools** bundle used by the in-browser Nostr client. |
| `electron-main.js` | Electron **main** process (window, menus, Ollama CORS, `arborito-fetch-url` IPC). |
| `preload.js` | Exposes `arboritoElectron.fetchUrl` for `file://` curriculum fetch. |
| `src/main.js` | Renderer bootstrap: WebTorrent shim, then dynamic `app-entry.js`. |
| `src/app-entry.js` | Imports store, registers web components, theme on `DOMContentLoaded`. |
| `src/store.js`, `src/ui-store.js` | Global state. |
| `src/components/` | Web components (`arborito-*` tags). |
| `src/services/`, `src/stores/`, `src/utils/` | API, persistence, helpers. |
| `src/styles/` | CSS source tree; see `src/styles/README.md`. |
| `locales/` | i18n JSON (`en.json`, `es.json`). |
| `tailwind.config.js`, `postcss.config.js` | Tailwind / PostCSS (no CDN). |
| `NOTICE` | Third-party licenses (e.g. Tailwind MIT). |
| `docs/` | **`dev-onboarding.md`**, **`forking-and-branding.md`** (forks / mirrors / naming), optional notes. |
| `CNAME` | Optional custom domain file for static hosting. |
| `.nojekyll` | Empty marker so **GitHub Pages** does not run Jekyll (otherwise paths like `vendor/.../_assert.js` are dropped and ES modules get `text/html`). |
| `ROADMAP.md` | Planned work. |
| `package.json` | Scripts and **npm dependencies** (Electron, Tailwind, PostCSS…). |
| `package-lock.json` | Exact versions npm installed (reproducible builds). |
| `node_modules/` | **Not** app source — see below. |

## ✨ Features

*   **Visual exploration:** Navigate complex topics like an interactive mind map.
*   **Decentralized:** Load external trees (JSON over HTTPS or Nostr).
*   **Vanilla JS:** ES modules, no app bundler for application code.
*   **Tailwind CSS:** Built locally from `src/styles/main.entry.css` into `src/styles/main.css` (no CDN; run `npm run build:css` after style changes, or use `npm start` / `npm run dist` which compile CSS first).
*   **Open source:** GPL-3.0 License.

## 🚀 How to run

1.  Clone this repository.
2.  **Desktop (recommended):** `npm install` then `npm start` (Electron). CSS is compiled automatically before launch.
3.  **Browser:** From this directory, `npm run serve:http` (or `python3 -m http.server 8000`) so modules load correctly. Ensure `src/styles/main.css` is up to date (`npm run build:css` if you changed styles). Open `http://localhost:8000/` (prefer `localhost` over `127.0.0.1` for passkeys; `boot.js` redirects loopback to `localhost`).

## 🧠 AI integration (Ollama)

Arborito supports local AI via **Ollama**.

### Option A: Using web browser (Chrome/Firefox/Safari)
Due to browser security (CORS), you must configure Ollama to allow requests from the browser:

1.  Stop Ollama.
2.  Run with the origin flag:
    ```bash
    OLLAMA_ORIGINS="*" ollama serve
    ```

### Option B: Using desktop app (Electron)
The desktop version handles permissions automatically. You do **not** need the `OLLAMA_ORIGINS` flag.

1.  Install dependencies: `npm install`
2.  Run app: `npm start`

## 🛠️ Development

Application code uses native ES modules (no Webpack/Vite for JS). **Styles** use Tailwind CSS v3 (`npm run build:css`); `tailwind.config.js` maps selected colors to CSS variables for `var(--…)` in custom CSS. See `src/styles/README.md`.

### What is `node_modules/`?

After **`npm install`**, npm downloads **third-party packages** (Electron, Tailwind, PostCSS, Autoprefixer, etc.) into **`node_modules/`**. That folder is:

*   **Dependencies** listed in `package.json` — libraries you use, not code you wrote.
*   **Large and auto-generated** — do **not** edit files inside it; do **not** commit it (it is in `.gitignore`).
*   **Recreatable** — delete it and run `npm install` again if something looks broken.

Your work lives in **`src/`**, `index.html`, and the **CSS sources** under `src/styles/` (not the generated `main.css`).

### Tips for new contributors

1.  Start with the **Repository layout** table above, then `src/main.js` and `src/store.js`.
2.  **Do not** hand-edit `src/styles/main.css` — change `main.entry.css` / modular CSS and run `npm run build:css`.
3.  **`main.css` line count is normal** — it is compiled Tailwind output (many utility rules). For smaller **file size** in releases, use `npm run build:css:min`.
4.  Use **`CONTRIBUTING.md`** for patterns (components, styling, Tailwind).

*   **`src/`**: Application logic (store, components, services).
*   **`index.html`**: Entry point; links `./src/styles/main.css`.

## 🤝 Contribute

Improvements to the app are welcome via your usual collaboration workflow with the project maintainers.

## ⚖️ Forks, mirrors, and your own site

If you **modify** this code or **host** your own public copy (anything that is **not** an official Treesys release), read **[`docs/forking-and-branding.md`](docs/forking-and-branding.md)**. It explains how to **avoid misleading users** and how to **separate** your deployment from upstream **legally and in branding** (GPL obligations, names, disclaimers). **That file is not legal advice** — it reduces confusion; it does not replace a lawyer where you need one.

## 📄 License

Arborito is licensed under the **GNU General Public License version 3** (SPDX `GPL-3.0`). See `LICENSE`.
