#!/usr/bin/env node
/**
 * Quick relay latency probe (read-only REQ).
 *
 *   ARBORITO_NOSTR_RELAYS  — comma-separated wss:// URLs (default: public relays below)
 *   ARBORITO_BENCH_WAIT_MS — per-relay max wait (default 8000)
 *
 * Use results to tune `NOSTR_CHUNK_CONTENT_MAX` in `src/config/nostr-spec.js` if needed.
 */

import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const DEFAULT_RELAYS = [
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://relay.snort.social',
    'wss://nostr.wine'
];

function relayListFromEnv() {
    const raw = process.env.ARBORITO_NOSTR_RELAYS || process.env.ARBORITO_INDEX_PEERS || '';
    const fromEnv = String(raw)
        .split(',')
        .map((s) => s.trim())
        .filter((s) => /^wss:\/\//i.test(s));
    return fromEnv.length ? fromEnv : DEFAULT_RELAYS;
}

async function loadPool() {
    const poolPath = pathToFileURL(join(root, 'vendor/nostr-tools/lib/esm/pool.js')).href;
    const { SimplePool } = await import(poolPath);
    return SimplePool;
}

async function benchOne(SimplePool, url, maxWait) {
    const pool = new SimplePool();
    const t0 = Date.now();
    let ok = false;
    let err = '';
    try {
        const evs = await pool.querySync([url], { kinds: [1], limit: 1 }, { maxWait });
        ok = Array.isArray(evs);
    } catch (e) {
        err = String(e && e.message ? e.message : e);
    } finally {
        try {
            pool.close([url]);
        } catch {
            /* ignore */
        }
    }
    const ms = Date.now() - t0;
    return { url, ok, ms, err };
}

async function main() {
    const relays = relayListFromEnv();
    const maxWait = Math.max(2000, Math.min(60_000, Number(process.env.ARBORITO_BENCH_WAIT_MS) || 8000));
    const SimplePool = await loadPool();
    console.log(`Probing ${relays.length} relay(s), maxWait=${maxWait}ms\n`);
    const rows = [];
    for (const url of relays) {
        rows.push(await benchOne(SimplePool, url, maxWait));
    }
    rows.sort((a, b) => a.ms - b.ms);
    for (const r of rows) {
        const status = r.ok ? 'ok' : 'fail';
        const extra = r.err ? `  (${r.err.slice(0, 120)})` : '';
        console.log(`${status.padEnd(4)} ${String(r.ms).padStart(5)}ms  ${r.url}${extra}`);
    }
    const okn = rows.filter((r) => r.ok).length;
    console.log(`\n${okn}/${rows.length} reachable`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
