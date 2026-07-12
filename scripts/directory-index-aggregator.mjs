#!/usr/bin/env node
/**
 * Nostr directory aggregator: signed recent/top snapshots + optional static
 * search shards (the serverless "search tier" for large catalogs).
 *
 *   ARBORITO_INDEX_PEERS       — comma-separated wss:// relays (required)
 *   ARBORITO_INDEX_PAIR_JSON   — `{"pub":"hex64","priv":"hex64"}` snapshot signer
 *   ARBORITO_INDEX_WAIT_MS     — initial wait (default 4000)
 *   ARBORITO_INDEX_MAX_EVENTS  — directory-event crawl budget (default 20000)
 *   ARBORITO_INDEX_SEARCH_DIR  — if set, write trigram search shards there
 *                                (host the folder statically and point clients
 *                                at it via ARBORITO_GLOBAL_DIRECTORY_SEARCH_URL)
 */

import { register } from 'node:module';
import { mkdir, rm, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DIRECTORY_INDEX_SNAPSHOT_CAP, DIRECTORY_INDEX_TRUSTED_PUBLISHERS } from '../src/features/p2p-webtorrent/api/directory-index-config.js';
import { KIND_DIRECTORY_BUMP, KIND_DIRECTORY_INDEX_SNAPSHOT, KIND_TREE_DIRECTORY } from '../src/features/nostr/api/nostr-spec.js';
import { trigramsFromCatalogRow } from '../src/features/nostr/api/directory-trigram-index.js';
import { DIRECTORY_SEARCH_SHARD_CAP, DIRECTORY_SEARCH_SHARD_VERSION } from '../src/features/p2p-webtorrent/api/directory-search-shared.js';

/* Filename check (not import.meta.url equality): the module is also imported
 * by tests/bundlers for `buildSearchShards`, where main() must not run. */
const isDirectRun = /directory-index-aggregator\.mjs$/.test(String(process.argv[1] || ''));

/* Under plain `node` the vendored nostr-tools uses bare `@noble/*` imports, so
 * the resolve hook must be registered BEFORE loading any module that pulls
 * them in — that's why `directory-index-shared.js` is imported dynamically
 * below instead of statically above. Bundled consumers (tests) already alias. */
if (isDirectRun) register('./node-arborito-resolve.mjs', import.meta.url);
const { verifyDirectoryBumpNostr, verifyGlobalTreeDirectoryMetaNostr } = await import(
    '../src/features/p2p-webtorrent/api/directory-index-shared.js'
);

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

async function loadNostr() {
    const poolPath = pathToFileURL(join(root, 'vendor/nostr-tools/lib/esm/pool.js')).href;
    const utilsPath = pathToFileURL(join(root, 'vendor/deps/noble-hashes/esm/utils.js')).href;
    const [{ SimplePool, finalizeEvent }, { hexToBytes }] = await Promise.all([import(poolPath), import(utilsPath)]);
    return { SimplePool, finalizeEvent, hexToBytes };
}

function normalizeRelays(raw) {
    return String(raw || '')
        .split(',')
        .map((s) => s.trim())
        .filter((s) => /^wss:\/\//i.test(s));
}

function activityTs(meta, bumps, key) {
    const m = Date.parse(String(meta.updatedAt || '')) || 0;
    const b = Date.parse(String(bumps.get(key) || '')) || 0;
    return Math.max(m, b);
}

/**
 * Cursor-paginated crawl: relays cap a single REQ (typically ≤ a few thousand
 * events), so one query cannot see a large catalog. We walk backwards with
 * `until = oldest created_at - 1` until the budget is spent or a page comes
 * back empty. Replaceable events mean one row per (pubkey, d) survives; the
 * newest event per tree key wins below regardless of page order.
 */
async function collectDirectoryRows(pool, relays, maxEvents) {
    /** @type {Map<string, { ev: object, body: object }>} */
    const best = new Map();
    let until = Math.floor(Date.now() / 1000) + 60;
    let fetched = 0;
    const pageLimit = 1000;
    while (fetched < maxEvents) {
        const evs = await pool.querySync(
            relays,
            { kinds: [KIND_TREE_DIRECTORY], until, limit: Math.min(pageLimit, maxEvents - fetched) },
            { maxWait: 12000 }
        );
        if (!evs.length) break;
        fetched += evs.length;
        let oldest = until;
        for (const ev of evs) {
            const ca = Number(ev.created_at) || 0;
            if (ca && ca < oldest) oldest = ca;
            let body;
            try {
                body = JSON.parse(String(ev.content || 'null'));
            } catch {
                continue;
            }
            if (!(await verifyGlobalTreeDirectoryMetaNostr(ev, body))) continue;
            const ownerPub = String(body.ownerPub || '');
            const universeId = String(body.universeId || '');
            if (!ownerPub || !universeId) continue;
            const key = `${ownerPub}/${universeId}`;
            const prev = best.get(key);
            if (!prev || ca > (Number(prev.ev.created_at) || 0)) best.set(key, { ev, body });
        }
        if (oldest >= until) break; // no progress — relay returned the same page
        until = oldest - 1;
    }
    const rows = [];
    for (const { ev, body } of best.values()) {
        if (body.delisted === true) continue;
        rows.push({
            key: `${String(body.ownerPub)}/${String(body.universeId)}`,
            meta: { ...body, sig: ev },
            ownerPub: String(body.ownerPub),
            universeId: String(body.universeId)
        });
    }
    return { rows, fetched };
}

async function collectBumpMap(pool, relays, limit) {
    const evs = await pool.querySync(relays, { kinds: [KIND_DIRECTORY_BUMP], limit: Math.min(2000, limit) }, { maxWait: 10000 });
    const bumps = new Map();
    for (const ev of evs) {
        if (!(await verifyDirectoryBumpNostr(ev))) continue;
        let v;
        try {
            v = JSON.parse(String(ev.content || 'null'));
        } catch {
            continue;
        }
        bumps.set(`${String(v.ownerPub)}/${String(v.universeId)}`, String(v.bumpedAt || ''));
    }
    return bumps;
}

/**
 * Static trigram search shards. Each verified row (with its signed event, so
 * clients re-verify signature + PoW and need not trust the host) lands in the
 * shard file of every trigram it contains. Newest rows win when a shard
 * overflows its cap. Output: `<dir>/<tri>.json` + `<dir>/manifest.json`.
 */
export async function buildSearchShards(rows, { cap = DIRECTORY_SEARCH_SHARD_CAP } = {}) {
    /** @type {Map<string, object[]>} */
    const shards = new Map();
    for (const r of rows) {
        for (const tri of trigramsFromCatalogRow(r.meta)) {
            if (tri.length !== 3) continue;
            let list = shards.get(tri);
            if (!list) {
                list = [];
                shards.set(tri, list);
            }
            list.push(r.meta);
        }
    }
    const updatedAt = new Date().toISOString();
    /** @type {Map<string, object>} */
    const files = new Map();
    for (const [tri, list] of shards) {
        list.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
        files.set(`${tri}.json`, {
            v: DIRECTORY_SEARCH_SHARD_VERSION,
            tri,
            updatedAt,
            entries: list.slice(0, cap)
        });
    }
    files.set('manifest.json', {
        v: DIRECTORY_SEARCH_SHARD_VERSION,
        updatedAt,
        shards: shards.size,
        rows: rows.length
    });
    return files;
}

async function writeSearchShards(dir, files) {
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    for (const [name, payload] of files) {
        await writeFile(join(dir, name), JSON.stringify(payload));
    }
}

async function main() {
    const { SimplePool, finalizeEvent, hexToBytes } = await loadNostr();
    const pool = new SimplePool();
    const relays = normalizeRelays(process.env.ARBORITO_INDEX_PEERS || '');
    if (!relays.length) {
        console.error('[directory-index] Set ARBORITO_INDEX_PEERS to comma-separated wss:// URLs.');
        process.exit(1);
    }
    const pairRaw = String(process.env.ARBORITO_INDEX_PAIR_JSON || '').trim();
    if (!pairRaw) {
        console.error('Missing ARBORITO_INDEX_PAIR_JSON (run: npm run directory-index:keygen).');
        process.exit(1);
    }
    const pair = JSON.parse(pairRaw);
    if (!pair?.pub || !pair?.priv) process.exit(1);
    const sk = hexToBytes(String(pair.priv).toLowerCase());
    if (sk.length !== 32) {
        console.error('priv must be 64 hex chars (32 bytes).');
        process.exit(1);
    }

    if (!DIRECTORY_INDEX_TRUSTED_PUBLISHERS.includes(String(pair.pub))) {
        console.warn(
            '[directory-index] Signer pub not in DIRECTORY_INDEX_TRUSTED_PUBLISHERS — clients will IGNORE these snapshots unless the deploy sets window.ARBORITO_DIRECTORY_INDEX_PUBLISHERS.'
        );
    }

    const waitMs = Math.max(0, Math.min(60000, Number(process.env.ARBORITO_INDEX_WAIT_MS) || 4000));
    const cap = Math.max(50, Math.min(2000, DIRECTORY_INDEX_SNAPSHOT_CAP));
    const maxEvents = Math.max(1000, Math.min(500000, Number(process.env.ARBORITO_INDEX_MAX_EVENTS) || 20000));
    const searchDir = String(process.env.ARBORITO_INDEX_SEARCH_DIR || '').trim();

    await new Promise((r) => setTimeout(r, waitMs));

    const [{ rows, fetched }, bumps] = await Promise.all([
        collectDirectoryRows(pool, relays, maxEvents),
        collectBumpMap(pool, relays, 2000)
    ]);
    console.log(`[directory-index] ${rows.length} directory rows (${fetched} events crawled), ${bumps.size} bumps.`);

    if (rows.length < 1) {
        console.error('[directory-index] No directory events from relays.');
        process.exit(2);
    }

    const enriched = rows.map((r) => ({ ...r, activityTs: activityTs(r.meta, bumps, r.key) }));
    enriched.sort((a, b) => b.activityTs - a.activityTs);
    const recentEntries = enriched.slice(0, cap).map((r) => r.meta);
    /* "top" slot: same recency ordering until per-tree vote/usage metrics are
     * aggregated here; kept as a separate slot so the client contract and the
     * future ranking upgrade need no format change. */
    const topEntries = recentEntries;

    const publish = async (slot, entries) => {
        const payload = {
            kind: 'directory_index_snapshot_v1',
            slot: String(slot),
            updatedAt: new Date().toISOString(),
            maxEntries: cap,
            entries: entries.slice(0, cap)
        };
        const ev = finalizeEvent(
            {
                kind: KIND_DIRECTORY_INDEX_SNAPSHOT,
                created_at: Math.floor(Date.now() / 1000),
                tags: [['d', `arborito:diridx:${slot}:v1`]],
                content: JSON.stringify(payload)
            },
            sk
        );
        await Promise.all(pool.publish(relays, ev));
        console.log(`[directory-index] ${slot}: ${payload.entries.length} entries`);
    };

    try {
        await publish('recent', recentEntries);
        await publish('top', topEntries);
    } catch (e) {
        console.error(e);
        process.exit(3);
    }

    if (searchDir) {
        const files = await buildSearchShards(rows);
        await writeSearchShards(searchDir, files);
        console.log(`[directory-index] search shards: ${files.size - 1} trigrams → ${searchDir}`);
    }

    pool.destroy();
    process.exit(0);
}

if (isDirectRun) {
    main().catch((e) => {
        console.error(e);
        process.exit(1);
    });
}
