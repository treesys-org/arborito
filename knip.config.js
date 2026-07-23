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
 *  - `src/main.jsx`                     — React renderer bootstrap.
 *  - `preload.js`                      — Electron preload (referenced as a
 *                                        path string from `electron-main.js`,
 *                                        which knip can't follow).
 *  - `src/shared/styles/main.entry.css`      — Tailwind input + custom CSS chain
 *                                        (compiled to `src/shared/styles/main.css`).
 *  - `src/shared/styles/runtime-overrides/index.css` — Loaded from `main.jsx`.
 *
 * `electron-main.js` and npm script entries (e.g. `search-regression.mjs`) are auto-detected from `package.json`.
 *
 * NOTE: this file MUST be `knip.config.js` (or `knip.js`) — knip does not
 * recognise `.mjs` or `.cjs` extensions. CommonJS syntax is used here
 * because the package has no `"type": "module"` field.
 */

/** @type {import('knip').KnipConfig} */
const config = {
    entry: [
        'index.html',
        'vite.config.mjs',
        'src/main.jsx',
        'src/app/App.jsx',
        'src/app/startup.js',
        'preload.js',
        'src/stores/attach-actions.js',
        /* Invoked via dynamic path from release-build / build-android-apk. */
        'scripts/preflight-wine.mjs',
        'scripts/prepare-capacitor-www.mjs',
        'src/shared/styles/main.entry.css',
        'src/shared/styles/runtime-overrides/index.css',
        /* Lazy-loaded at runtime via `lazy-stylesheet.js` (not in main.entry.css). */
        'src/features/learning/styles/sage-guide.css',
        'src/features/learning/styles/learning/index.css',
        'src/features/tour/styles/product-tour.css',
        'src/features/editor/styles/index.css',
        'src/features/sources/styles/sources.css',
        'src/features/garden-progress/styles/index.css'
    ],
    ignoreDependencies: [
        '@capacitor/android',
        '@capacitor/cli',
        '@capacitor/core',
        '@fontsource/noto-color-emoji',
        'twemoji'
    ],
    ignore: ['vendor/**', '**/*.min.js', 'src/shared/styles/main.css'],
    ignoreBinaries: ['python3'],
    /* Mixins attach via Object.assign in store-mixin-loader; electron IPC surface. */
    ignoreIssues: {
        'src/features/**/actions/**': ['exports'],
        'src/features/p2p-webtorrent/directory-index-config.js': ['exports'],
        'electron-llama-bin.cjs': ['exports'],
        'electron-llama-chat.cjs': ['exports'],
        'electron-sage-voice.js': ['exports'],
        'electron-user-data.cjs': ['exports'],
        'electron-whisper-stt.cjs': ['exports']
    },
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
