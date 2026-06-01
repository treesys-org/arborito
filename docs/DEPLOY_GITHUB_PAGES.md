# Deploying Arborito on GitHub Pages (no `npm` required for visitors)

## What the end user sees

- They open the Pages URL and receive **HTML + JavaScript that already exist** in the repo (`index.html`, `src/**/*.js`, `vendor/`, etc.).
- They do **not** need Node, `npm install`, or `npm run build` in the browser: the app is **native ES modules** served as static files.

## `.nojekyll` file (required on GitHub Pages)

The root of the published artifact (this `arborito/` folder) must contain **`.nojekyll`**. Without it, GitHub Pages runs **Jekyll**, which **does not publish** paths containing underscore segments (`_`), for example `vendor/deps/noble-ciphers/esm/_assert.js`. The browser then receives a 404 HTML page with type `text/html`, and ES modules fail with "disallowed MIME type".

The repo includes an empty `arborito/.nojekyll`; don't delete it if you deploy with Pages.

## What the maintainer does

1. **CSS source (does go to GitHub):** edit the cross-feature partials in `src/shared/styles/` and the feature-scoped partials in `src/features/{feature}/styles/`. The Tailwind input chain is `src/shared/styles/main.entry.css`. Do **not** hand-edit `src/shared/styles/main.css` — it is Tailwind output.

2. **Compiled CSS (`main.css`):** after editing the source styles, regenerate it and **commit it**:

   ```bash
   npm run build:css:min
   git add src/shared/styles/main.css
   ```

   Without `main.css` in the repo, a Pages deployment from the branch serves HTML without Tailwind (it looks "unstyled"). The `arborito-pages.yml` workflow also generates it in CI if you use **GitHub Actions** as your Pages source.

3. **There is no application bundler** in this project: there is no `npm run build` step that packages all the JS. The runtime is the source code as-is.

## GitHub Actions (optional)

At the root of the monorepo, [`.github/workflows/arborito-css.yml`](../../.github/workflows/arborito-css.yml) verifies that Tailwind compiles in CI. [`.github/workflows/arborito-pages.yml`](../../.github/workflows/arborito-pages.yml) builds minified CSS and deploys Pages with `main.css` included in the artifact (without committing it back to the repo).

### Monorepo

If `arborito/` isn't the repository root, change `defaults.run.working-directory` and the workflow paths to point at that folder.

## Nostr relays (optional)

If you publish or load `nostr://` curricula, the browser needs to reach `wss://` relays. The default list and the ways to override it (`index.html`, `localStorage`, etc.) live in [`NOSTR_RELAYS_CONFIGURATION.md`](NOSTR_RELAYS_CONFIGURATION.md).

## Summary

| Role | `npm` / terminal |
|------|------------------|
| Visitor | No |
| Maintainer (CSS source) | Commit `src/shared/styles/**` and `src/features/**/styles/**` except `main.css`; locally: `npm run build:css` |
| GitHub Pages (deploy) | Actions generates `main.css` in the published artifact |
