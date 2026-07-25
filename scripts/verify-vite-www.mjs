#!/usr/bin/env node
/** Fail CI if www/ looks like a raw src/ deploy instead of Vite output. */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WWW = join(dirname(fileURLToPath(import.meta.url)), '..', 'www');
const INDEX = join(WWW, 'index.html');

function fail(msg) {
    console.error(`[verify-vite-www] ${msg}`);
    process.exit(1);
}

if (!existsSync(INDEX)) {
    fail('missing www/index.html : run npm run build');
}

const html = readFileSync(INDEX, 'utf8');

if (existsSync(join(WWW, 'src'))) {
    fail('www/src/ must not exist (raw source tree : wrong artifact)');
}

if (!/assets\/[^"']+\.js/.test(html)) {
    fail('index.html has no assets/*.js bundle script');
}

if (/\/src\/boot\.js|src="\.?\/src\/boot\.js"|src="\.?\/src\/main\.jsx"/.test(html)) {
    fail('index.html still references dev entry (/src/boot.js or /src/main.jsx), not Vite build');
}

if (!html.includes('content="vite-react"')) {
    fail('missing <meta name="arborito:build" content="vite-react"> stamp');
}

if (!/name="arborito:build-id"\s+content="[^"]+"/.test(html)) {
    fail('missing <meta name="arborito:build-id" content="…"> stamp');
}

const buildIdPath = join(WWW, 'build-id.json');
if (!existsSync(buildIdPath)) {
    fail('missing www/build-id.json (transparent shell refresh)');
}
try {
    const buildIdDoc = JSON.parse(readFileSync(buildIdPath, 'utf8'));
    if (!buildIdDoc || typeof buildIdDoc.id !== 'string' || !buildIdDoc.id.trim()) {
        fail('www/build-id.json must be { "id": "…" }');
    }
    const metaId = (html.match(/name="arborito:build-id"\s+content="([^"]+)"/) || [])[1];
    if (metaId && metaId !== buildIdDoc.id) {
        fail(`build-id meta (${metaId}) !== build-id.json (${buildIdDoc.id})`);
    }
} catch (e) {
    fail(`www/build-id.json invalid JSON: ${e?.message || e}`);
}

const top = readdirSync(WWW);
console.log('[verify-vite-www] OK : Vite artifact looks valid');
console.log('[verify-vite-www] www/ top-level:', top.join(', '));
const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
console.log('[verify-vite-www] script src:', scripts.join(', ') || '(none)');
