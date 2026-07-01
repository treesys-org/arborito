#!/usr/bin/env node
/**
 * Static checks for Nostr trigram directory index.
 * Run: node scripts/test-directory-trigram-tags.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    catalogRowMatchesQuery,
    directoryTrigramTagsForRow,
    rankTrigramsForSearch,
    trigramsFromQuery,
} from '../src/features/nostr/api/directory-trigram-index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let fail = 0;

function check(name, ok, detail = '') {
    console.log(ok ? 'OK' : 'FAIL', name, detail ? `— ${detail}` : '');
    if (!ok) fail++;
}

const tris = trigramsFromQuery('álgebra');
check('trigramsFromQuery finds alg', tris.includes('alg'), tris.join(','));

const tags = directoryTrigramTagsForRow({
    title: 'Curso de Álgebra',
    description: 'Números y ecuaciones',
    authorName: 'Ana',
});
check('directoryTrigramTagsForRow non-empty', tags.length >= 3, String(tags.length));
check('tags capped at 40', tags.length <= 40);

const ranked = rankTrigramsForSearch(['ing', 'alg', 'xyz']);
check('rankTrigrams prefers rare', ranked[0] === 'xyz' || ranked[0] === 'alg', ranked.join(','));

check(
    'catalogRowMatchesQuery accent fold',
    catalogRowMatchesQuery('algebra', { title: 'Álgebra básica' })
);

const directoryJs = readFileSync(join(root, 'src/features/nostr/api/client/directory.js'), 'utf8');
check('publish adds t tags', /directoryTrigramTagsForRow/.test(directoryJs));
check('searchGlobalDirectoryByTrigrams', /searchGlobalDirectoryByTrigrams/.test(directoryJs));
check('#t relay filter', /'#t'/.test(directoryJs));
check('on-demand search (no live subscribe stub)', !/startDirectoryLiveSubscribe/.test(directoryJs));

check('shard files removed', !readFileSync(join(root, 'package.json'), 'utf8').includes('directory-catalog:build'));

console.log(fail ? '\nRESULT: FAIL' : '\nRESULT: PASS');
process.exit(fail ? 1 : 0);
