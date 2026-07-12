import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { resolve, dirname, join, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { viteStaticCopy } from 'vite-plugin-static-copy';

import { VENDOR_IMPORT_ALIASES } from './scripts/vendor-import-aliases.mjs';
import { resolveManualChunk } from './scripts/vite-chunk-groups.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));

const STATIC_MIME = {
    '.css': 'text/css',
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.mjs': 'application/javascript',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.wasm': 'application/wasm',
    '.webp': 'image/webp',
};

/** Dev server: locales/, vendor/ (build copies them via viteStaticCopy). */
function serveRootStaticDirs() {
    const mounts = [
        ['/locales', 'locales'],
        ['/vendor', 'vendor'],
    ];
    const faviconFile = resolve(ROOT, 'favicon.svg');
    return {
        name: 'arborito-serve-static-dirs',
        enforce: 'pre',
        configureServer(server) {
            server.middlewares.use('/favicon.ico', (req, res, next) => {
                if (!existsSync(faviconFile)) return next();
                res.setHeader('Content-Type', 'image/svg+xml');
                createReadStream(faviconFile).pipe(res);
            });
            for (const [mount, dir] of mounts) {
                const root = resolve(ROOT, dir);
                server.middlewares.use(mount, (req, res, next) => {
                    const rel = decodeURIComponent((req.url || '/').split('?')[0]);
                    const file = normalize(join(root, rel.replace(/^\//, '')));
                    if (!file.startsWith(root)) return next();
                    if (!existsSync(file)) return next();
                    const st = statSync(file);
                    if (!st.isFile()) return next();
                    // Let Vite transform vendor JS (nostr-tools → @noble/* bare imports).
                    if (mount !== '/locales' && /\.(m?js|cjs)$/i.test(file)) return next();
                    const mime = STATIC_MIME[extname(file).toLowerCase()];
                    if (mime) res.setHeader('Content-Type', mime);
                    createReadStream(file).pipe(res);
                });
            }
        },
    };
}

/** Import-map aliases from index.html — nostr-tools pulls these at runtime. */
const NOBLE_ALIASES = Object.fromEntries(
    Object.entries(VENDOR_IMPORT_ALIASES).map(([find, rel]) => [find, resolve(ROOT, rel)])
);

/** Stamp built index.html so production can be distinguished from raw src/ deploy. */
function stampViteBuild() {
    return {
        name: 'arborito-stamp-vite-build',
        transformIndexHtml(html) {
            if (html.includes('name="arborito:build"')) return html;
            return html.replace('<head>', '<head>\n  <meta name="arborito:build" content="vite-react">');
        },
    };
}

export default defineConfig({
    base: './',
    root: ROOT,
    publicDir: false,
    plugins: [
        react(),
        stampViteBuild(),
        serveRootStaticDirs(),
        viteStaticCopy({
            silent: true,
            targets: [
                { src: 'favicon.svg', dest: '.' },
                { src: 'locales', dest: '.' },
                { src: 'vendor', dest: '.' },
                { src: 'CNAME', dest: '.' },
                { src: '.nojekyll', dest: '.' },
            ],
        }),
    ],
    resolve: {
        alias: Object.entries(NOBLE_ALIASES).map(([find, replacement]) => ({ find, replacement })),
    },
    optimizeDeps: {
        include: [
            '@noble/curves/secp256k1',
            '@noble/hashes/sha256',
            '@noble/hashes/utils',
            '@noble/hashes/hmac',
            '@noble/hashes/hkdf',
            '@noble/hashes/scrypt',
            '@noble/hashes/crypto',
            '@noble/ciphers/aes',
            '@noble/ciphers/chacha',
            '@noble/ciphers/crypto',
            '@noble/ciphers/utils',
            '@scure/base',
        ],
    },
    build: {
        outDir: 'www',
        emptyOutDir: true,
        target: 'es2022',
        sourcemap: true,
        // app-stores is one monolithic chunk (~552 kB): store modules cross-import and cannot be
        // split without circular chunk errors. index/modal-eager/feature-* split separately.
        chunkSizeWarningLimit: 560,
        rollupOptions: {
            input: resolve(ROOT, 'index.html'),
            output: {
                manualChunks(id) {
                    return resolveManualChunk(id);
                },
            },
        },
    },
    server: {
        port: 5173,
        strictPort: false,
        open: false,
    },
    preview: {
        port: 4173,
    },
});
