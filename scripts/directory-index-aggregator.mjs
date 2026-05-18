#!/usr/bin/env node
/**
 * Nostr directory snapshot aggregator.
 *
 *   ARBORITO_INDEX_PEERS       — comma-separated wss:// relays (required)
 *   ARBORITO_INDEX_PAIR_JSON   — `{"pub":"hex64","priv":"hex64"}` snapshot signer
 *   ARBORITO_INDEX_WAIT_MS    — initial wait (default 4000)
 */

import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DIRECTORY_INDEX_SNAPSHOT_CAP, DIRECTORY_INDEX_TRUSTED_PUBLISHERS } from '../src/config/directory-index.js';
import { KIND_DIRECTORY_BUMP, KIND_DIRECTORY_INDEX_SNAPSHOT, KIND_TREE_DIRECTORY } from '../src/config/nostr-spec.js';
import { verifyDirectoryBumpNostr, verifyGlobalTreeDirectoryMetaNostr } from '../src/utils/directory-index-shared.js';

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

function topScore(votes, used7) {
    return Math.log1p(Math.max(0, votes)) * 72 + Math.log1p(Math.max(0, used7)) * 58;
}

async function collectDirectoryRows(pool, relays, limit) {
    const evs = await pool.querySync(relays, { kinds: [KIND_TREE_DIRECTORY], limit: Math.min(3000, limit) }, { maxWait: 12000 });
    /** @type {Map<string, { ev: object, body: object }>} */
    const best = new Map();
    for (const ev of evs) {
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
        const ca = Number(ev.created_at) || 0;
        const prev = best.get(key);
        if (!prev || ca > (Number(prev.ev.created_at) || 0)) best.set(key, { ev, body });
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
    return rows;
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
        console.error('Missing ARBORITO_INDEX_PAIR_JSON.');
        process.exit(1);
    }
    const pair = JSON.parse(pairRaw);
    if (!pair?.pub || !pair?.priv) process.exit(1);
    const sk = hexToBytes(String(pair.priv).toLowerCase());
    if (sk.length !== 32) {
        console.error('priv must be 64 hex chars (32 bytes).');
        process.exit(1);
    }

    if (DIRECTORY_INDEX_TRUSTED_PUBLISHERS.length && !DIRECTORY_INDEX_TRUSTED_PUBLISHERS.includes(String(pair.pub))) {
        console.warn('[directory-index] Signer pub not in DIRECTORY_INDEX_TRUSTED_PUBLISHERS.');
    }

    const waitMs = Math.max(0, Math.min(60000, Number(process.env.ARBORITO_INDEX_WAIT_MS) || 4000));
    const cap = Math.max(50, Math.min(2000, DIRECTORY_INDEX_SNAPSHOT_CAP));
    const pubBudget = Math.max(20, Math.min(400, Number(process.env.ARBORITO_INDEX_PUB_BUDGET) || 140));

    await new Promise((r) => setTimeout(r, waitMs));

    const [rows, bumps] = await Promise.all([
        collectDirectoryRows(pool, relays, pubBudget * 25),
        collectBumpMap(pool, relays, pubBudget * 25)
    ]);
    console.log(`[directory-index] ${rows.length} directory rows, ${bumps.size} bumps.`);

    if (rows.length < 1) {
        console.error('[directory-index] No directory events from relays.');
        process.exit(2);
    }

    const enriched = rows.map((r) => ({ ...r, activityTs: activityTs(r.meta, bumps, r.key) }));
    enriched.sort((a, b) => b.activityTs - a.activityTs);
    const recentEntries = enriched.slice(0, cap).map((r) => r.meta);

    const scored = enriched.slice(0, Math.min(enriched.length, cap * 3)).map((r) => ({
        meta: r.meta,
        score: topScore(0, 0)
    }));
    scored.sort((a, b) => b.score - a.score);
    const topEntries = scored.slice(0, cap).map((x) => x.meta);

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

    pool.destroy();
    process.exit(0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
