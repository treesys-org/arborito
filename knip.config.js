/**
 * Knip configuration.
 *
 * Knip's built-in Tailwind compiler picks up `@import "…"` directives but
 * NOT `@import url("…")`, which is the form most of `main.entry.css` uses.
 * The custom compiler below covers both syntaxes and emits the exact JS
 * shape knip's resolver expects (`import _$N from '…';`), so the cascade
 * rooted at our two CSS entries below is fully traced.
 *
 * Entries:
 *  - `src/boot.js` / `src/main.js`    — renderer bootstrap.
 *  - `preload.js`                      — Electron preload (referenced as a
 *                                        path string from `electron-main.js`,
 *                                        which knip can't follow).
 *  - `src/styles/main.entry.css`      — Tailwind input + custom CSS chain
 *                                        (compiled to `src/styles/main.css`).
 *  - `src/styles/runtime-overrides/`  — Loaded as a separate `<link>` from
 *      `index.css`                       `boot.js` after `main.css`.
 *
 * `electron-main.js` and the npm script entries (`vendor-wllama.mjs`,
 * `search-regression.mjs`) are auto-detected from `package.json`.
 *
 * NOTE: this file MUST be `knip.config.js` (or `knip.js`) — knip does not
 * recognise `.mjs` or `.cjs` extensions. CommonJS syntax is used here
 * because the package has no `"type": "module"` field.
 */

/** @type {import('knip').KnipConfig} */
const config = {
    entry: [
        'src/boot.js',
        'src/main.js',
        'preload.js',
        'src/shared/styles/main.entry.css',
        'src/shared/styles/runtime-overrides/index.css'
    ],
    ignore: ['vendor/**', '**/*.min.js', 'src/shared/styles/main.css'],
    ignoreBinaries: ['python3'],
    compilers: {
        // Knip's built-in Tailwind compiler matches `@import "..."` only —
        // it ignores `@import url("...")`, which is the form most of our
        // entry uses. Emit the same `import _$N from '…';` shape that
        // knip's tailwind/scss compilers produce, but cover both syntaxes.
        css: (text) =>
            [...text.matchAll(/@import\s+(?:url\(\s*)?["']([^"')]+)["']\s*\)?\s*;/g)]
                .map(([, dep], i) => `import _$${i} from '${dep}';`)
                .join('\n')
    }
};

module.exports = config;
