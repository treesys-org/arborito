#!/usr/bin/env node
/**
 * Generate the dedicated Nostr keypair for the directory-index aggregator and
 * print the exact configuration lines. Run once per deployment; keep the priv
 * only on the host that runs `npm run directory-index:build`.
 */

import { register } from 'node:module';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

// Map bare @noble/* imports inside vendored nostr-tools to the vendored deps.
register('./lib/node-arborito-resolve.mjs', import.meta.url);

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const [{ generateSecretKey, getPublicKey }, { bytesToHex }] = await Promise.all([
    import(pathToFileURL(join(root, 'vendor/nostr-tools/lib/esm/pure.js')).href),
    import(pathToFileURL(join(root, 'vendor/deps/noble-hashes/esm/utils.js')).href)
]);

const sk = generateSecretKey();
const pub = getPublicKey(sk);
const priv = bytesToHex(sk);

console.log(`
Directory-index aggregator keypair (KEEP THE priv SECRET)
==========================================================

pub : ${pub}
priv: ${priv}

1) Client trust — either rebuild with the pub in
   src/features/p2p-webtorrent/api/directory-index-config.js:

     export const DIRECTORY_INDEX_TRUSTED_PUBLISHERS = ['${pub}'];

   …or, without rebuilding, add to the deployed index.html:

     <script>window.ARBORITO_DIRECTORY_INDEX_PUBLISHERS = ['${pub}'];</script>

2) Aggregator job env (cron / CI):

     export ARBORITO_INDEX_PAIR_JSON='{"pub":"${pub}","priv":"${priv}"}'
     export ARBORITO_INDEX_PEERS='wss://relay1,…'
     npm run directory-index:build

Until step 1 ships, clients IGNORE all snapshots (fail-closed) and use
relay trigram search + the bounded crawl instead.
`);
