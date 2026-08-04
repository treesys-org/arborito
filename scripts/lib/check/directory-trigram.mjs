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
} from '../../../src/features/nostr/api/directory-trigram-index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
let fail = 0;

function check(name, ok, detail = '') {
    console.log(ok ? 'OK' : 'FAIL', name, detail ? `: ${detail}` : '');
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
const directoryListJs = readFileSync(
    join(root, 'src/features/nostr/api/client/directory-list.js'),
    'utf8'
);
const directorySrc = `${directoryJs}\n${directoryListJs}`;
check('publish adds t tags', /directoryTrigramTagsForRow/.test(directoryJs));
check('searchGlobalDirectoryByTrigrams', /searchGlobalDirectoryByTrigrams/.test(directoryListJs));
check('#t relay filter', /'#t'/.test(directoryListJs));
/* Relays like nos.lol break multi-tag `#t`+`#app`; app tag is checked client-side. */
check('trigram search does not AND #app on relay', !/'#app':\s*\[TAG_APP_VALUE\]/.test(directorySrc));
check('trigram search checks app tag client-side', /eventHasArboritoAppTag/.test(directoryListJs));
check('search falls back to crawl when thin', /_traverseGlobalDirectoryEntries/.test(directoryListJs));
check(
    'live crawl pages with until',
    /until/.test(directoryListJs) && /DIRECTORY_CLIENT_CRAWL_MAX_EVENTS/.test(directoryListJs)
);
check(
    'live crawl uses per-relay until',
    /untilByRelay/.test(directoryListJs) && /_queryRelays/.test(directoryListJs)
);
check(
    'crawl paints per relay (first response)',
    /crawlRelay/.test(directoryListJs) && /_queryRelayDirect/.test(directoryListJs + '\n' + readFileSync(join(root, 'src/features/nostr/api/client/core.js'), 'utf8'))
);
check(
    'crawl first-wins early exit',
    /filledGate/.test(directoryListJs) && /signalFilled/.test(directoryListJs)
);
check(
    'crawl does not EOSE on timeout-truncated pages',
    /if\s*\(\s*!evs\.length\s*\)\s*exhausted\.add/.test(directoryListJs) &&
        !/evs\.length\s*<\s*budget/.test(directoryListJs)
);
check(
    'crawl streams one row at a time',
    /onPartial\(\[row\]\)/.test(directoryListJs) && /budgetForPage/.test(directoryListJs)
);
check(
    'crawl prioritizes first viewport then fills ahead',
    /FIRST_VIEWPORT_STREAM/.test(directoryListJs)
);
check(
    'crawl invalidates superseded fetches',
    /_directoryCrawlGen/.test(directoryListJs)
);
check(
    'directory list does not await bundle warm before crawl',
    /queueMicrotask/.test(directoryListJs) &&
        /_publishedBundleStateCached\(\)/.test(directoryListJs) &&
        !/await Promise\.all\(\[bundleWarm/.test(directoryListJs) &&
        !/await this\._publishedBundleStateCached\(\)/.test(directoryListJs)
);
check('on-demand search (no live subscribe stub)', !/startDirectoryLiveSubscribe/.test(directorySrc));

check('shard files removed', !readFileSync(join(root, 'package.json'), 'utf8').includes('directory-catalog:build'));

console.log(fail ? '\nRESULT: FAIL' : '\nRESULT: PASS');
process.exit(fail ? 1 : 0);
