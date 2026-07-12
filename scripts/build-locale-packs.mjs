#!/usr/bin/env node
/**
 * Regenerates `locales/<lang>/pack.json` (the monolithic one-request bundle)
 * from the modular namespace files listed in `locales/manifest.json`.
 *
 * Run after editing any `locales/<lang>/<namespace>.json` file:
 *   npm run locales:pack
 *
 * Output format is deterministic: namespaces merged in manifest order,
 * minified UTF-8 JSON — byte-stable across runs.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCALES = join(ROOT, 'locales');
const LANGS = ['en', 'es'];

const manifest = JSON.parse(await readFile(join(LOCALES, 'manifest.json'), 'utf8'));
const namespaces = manifest.namespaces;
if (!Array.isArray(namespaces) || !namespaces.length) {
    console.error('locales/manifest.json has no namespaces');
    process.exit(1);
}

for (const lang of LANGS) {
    /** @type {Record<string, unknown>} */
    const merged = {};
    for (const ns of namespaces) {
        const part = JSON.parse(await readFile(join(LOCALES, lang, `${ns}.json`), 'utf8'));
        for (const [k, v] of Object.entries(part)) {
            if (k in merged) {
                console.error(`Duplicate key "${k}" while merging ${lang}/${ns}.json`);
                process.exit(1);
            }
            merged[k] = v;
        }
    }
    const out = JSON.stringify(merged);
    await writeFile(join(LOCALES, lang, 'pack.json'), out, 'utf8');
    console.log(`locales/${lang}/pack.json — ${Object.keys(merged).length} keys, ${out.length} bytes`);
}
