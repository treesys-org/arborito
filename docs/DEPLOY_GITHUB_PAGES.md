# Deploying the web build (GitHub Pages)

The live alpha at **[arborito.org](https://arborito.org)** is the Vite production bundle deployed from this repo via GitHub Pages.

## What visitors get

After `npm run build`, the `www/` folder is a **static site**: HTML, hashed JS/CSS assets, `vendor/`, `locales/`, etc. Visitors do **not** need Node or `npm`, only a modern browser.

## Build steps (maintainer)

```bash
cd arborito
npm install
npm run vendor:emoji    # included in prebuild; run explicitly if needed
npm run build           # → www/
```

Verify output:

```bash
node ./scripts/verify-vite-www.mjs
npm run preview         # smoke-test locally
```

## `.nojekyll` (GitHub Pages)

The published artifact root must contain **`.nojekyll`**. Without it, GitHub Pages runs **Jekyll**, which skips paths with underscore segments (e.g. `vendor/deps/noble-ciphers/esm/_assert.js`) and ES modules fail with MIME errors.

The repo includes `arborito/.nojekyll`; keep it in the deployed artifact.

## GitHub Actions (monorepo)

Workflow [`.github/workflows/arborito-pages.yml`](../../.github/workflows/arborito-pages.yml):

1. Installs dependencies in `arborito/`
2. Runs `npm run vendor:emoji`
3. Stamps `ARBORITO_BUILD_ID` in `src/core/version.js`
4. Runs `npm run build` (Vite → `www/`)
5. Uploads `arborito/www` to GitHub Pages

Triggered on pushes to `main` that touch `arborito/**`, or manually via `workflow_dispatch`.

If `arborito/` is not the repository root, adjust `defaults.run.working-directory` and workflow paths accordingly.

## CSS during development

Tailwind compiles `src/shared/styles/main.entry.css` → `src/shared/styles/main.css`. Vite bundles CSS through `src/main.jsx`. After editing CSS sources:

```bash
npm run build:css:min
```

Do **not** hand-edit `main.css`.

## Nostr relays

If users publish or load `nostr://` curricula, the browser must reach `wss://` relays. Default list and overrides: [`NOSTR_RELAYS_CONFIGURATION.md`](NOSTR_RELAYS_CONFIGURATION.md).

## Summary

| Role | Needs `npm`? |
|------|----------------|
| Visitor | No, static `www/` only |
| Maintainer (local dev) | Yes, `npm run dev` |
| Maintainer (deploy) | Yes, `npm run build`, then upload `www/` or use the Pages workflow |
