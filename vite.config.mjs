import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { createReadStream, existsSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { viteStaticCopy } from 'vite-plugin-static-copy';

import { VENDOR_IMPORT_ALIASES } from './scripts/vendor-import-aliases.mjs';
import { resolveManualChunk } from './scripts/vite-chunk-groups.mjs';
import {
    DEMO_MEDIA_REL,
} from './scripts/lib/demo-product-screenshots.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DEMO_MEDIA_ROOT = resolve(ROOT, DEMO_MEDIA_REL);

function readArboritoBuildId() {
    try {
        const src = readFileSync(resolve(ROOT, 'src/core/version.js'), 'utf8');
        const m = src.match(/export const ARBORITO_BUILD_ID\s*=\s*['"]([^'"]+)['"]/);
        return (m && m[1]) || 'dev';
    } catch {
        return 'dev';
    }
}

/** Stamp built index.html + emit unhashed build-id.json for transparent shell refresh. */
function stampViteBuild() {
    const buildId = readArboritoBuildId();
    return {
        name: 'arborito-stamp-vite-build',
        transformIndexHtml(html) {
            let out = html;
            if (!out.includes('name="arborito:build"')) {
                out = out.replace(
                    '<head>',
                    '<head>\n  <meta name="arborito:build" content="vite-react">'
                );
            }
            if (out.includes('name="arborito:build-id"')) {
                out = out.replace(
                    /<meta\s+name="arborito:build-id"\s+content="[^"]*"\s*\/?>/i,
                    `<meta name="arborito:build-id" content="${buildId}">`
                );
            } else {
                out = out.replace(
                    '<meta name="arborito:build" content="vite-react">',
                    `<meta name="arborito:build" content="vite-react">\n  <meta name="arborito:build-id" content="${buildId}">`
                );
            }
            return out;
        },
        closeBundle() {
            const outDir = resolve(ROOT, 'www');
            if (!existsSync(outDir)) return;
            const payload = `${JSON.stringify({ id: buildId })}\n`;
            writeFileSync(resolve(outDir, 'build-id.json'), payload, 'utf8');
        },
    };
}

const STATIC_MIME = {
    '.css': 'text/css',
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.mjs': 'application/javascript',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.flac': 'audio/flac',
    '.opus': 'audio/opus',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ogv': 'video/ogg',
    '.mov': 'video/quicktime',
    '.m4v': 'video/mp4',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.wasm': 'application/wasm',
};

/** Dev server: locales/, vendor/, demo-media/ (lesson + product PNGs). */
function serveRootStaticDirs() {
    const mounts = [
        ['/locales', 'locales'],
        ['/vendor', 'vendor'],
    ];
    const faviconFile = resolve(ROOT, 'favicon.png');
    return {
        name: 'arborito-serve-static-dirs',
        enforce: 'pre',
        configureServer(server) {
            server.middlewares.use('/favicon.ico', (req, res, next) => {
                if (!existsSync(faviconFile)) return next();
                res.setHeader('Content-Type', 'image/png');
                createReadStream(faviconFile).pipe(res);
            });
            server.middlewares.use('/demo-media', (req, res, next) => {
                const rel = decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\//, '');
                if (!rel || rel.endsWith('/')) return next();
                const file = normalize(join(DEMO_MEDIA_ROOT, rel));
                if (!file.startsWith(DEMO_MEDIA_ROOT) || !existsSync(file)) return next();
                const st = statSync(file);
                if (!st.isFile()) return next();
                const mime = STATIC_MIME[extname(file).toLowerCase()] || 'application/octet-stream';
                res.setHeader('Content-Type', mime);
                createReadStream(file).pipe(res);
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
                { src: 'favicon.png', dest: '.' },
                { src: 'locales', dest: '.' },
                { src: 'vendor', dest: '.' },
                { src: 'demo/arborito-demo/media/*', dest: 'demo-media' },
                { src: 'CNAME', dest: '.' },
                { src: '.nojekyll', dest: '.' },
                { src: 'robots.txt', dest: '.' },
                { src: 'sitemap.xml', dest: '.' },
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
        // app-stores is one monolithic chunk (~1.0 MB): store modules cross-import and cannot be
        // split without circular chunk errors. index/modal-eager/feature-* split separately.
        chunkSizeWarningLimit: 1200,
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
