#!/usr/bin/env node
/**
 * Regresión ligera: lógica de shards y fusión alineada al builder Python.
 * Ejecutar: node scripts/search-regression.mjs
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

async function loadCore() {
    return import(pathToFileURL(join(root, 'src/utils/search-index-core.js')).href);
}

async function main() {
    const {
        buildShardMapFromEntries,
        flattenTreeSearchEntries,
        mergeSearchEntriesById,
        tokenizeForSearch
    } = await loadCore();

    const t = tokenizeForSearch('Hello world test');
    if (!t.includes('hello') || !t.includes('world')) {
        throw new Error('tokenizeForSearch failed');
    }

    const fakeRoot = {
        type: 'root',
        id: 'r1',
        name: 'Root',
        path: 'Root',
        description: 'course',
        children: [
            {
                type: 'leaf',
                id: 'l1',
                name: 'Algebra intro',
                description: 'basics',
                path: 'Root / Algebra intro',
                icon: '📄'
            }
        ]
    };
    const entries = flattenTreeSearchEntries(fakeRoot, 'EN');
    if (!entries.some((e) => e.id === 'l1')) throw new Error('flatten missed leaf');

    const map = buildShardMapFromEntries(entries);
    const keys = Object.keys(map);
    if (keys.length < 1) throw new Error('expected shard keys');

    const merged = mergeSearchEntriesById(
        [{ id: 'a', name: 'old', type: 'leaf' }],
        [{ id: 'a', name: 'new', type: 'leaf' }]
    );
    if (merged[0].name !== 'new') throw new Error('merge overlay should win');

    // Fixture opcional: mini árbol JSON si existe (CI puede ampliar)
    const fixturePath = join(root, 'test-fixtures', 'mini-tree.json');
    try {
        const raw = JSON.parse(readFileSync(fixturePath, 'utf8'));
        if (raw.languages?.EN) {
            const ent = flattenTreeSearchEntries(raw.languages.EN, 'EN');
            const m2 = buildShardMapFromEntries(ent);
            if (Object.keys(m2).length < 1) console.warn('mini-tree: no shards (ok if empty tree)');
        }
    } catch {
        /* fixture opcional */
    }

    console.log('search-regression: OK');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
