/**
 * Explore catalog from bundle headers (kind 30150), then the directory card
 * (kind 30100) for the emoji and description those headers do not carry.
 */

import { directoryRowKey, normalizeCatalogRow } from '../directory-trigram-index.js';
import { KIND_BUNDLE_HEADER, KIND_TREE_DIRECTORY, directoryDTag } from '../nostr-spec.js';
import { QUERY_MS } from './_shared.js';

/**
 * Courses already on the relays, read from bundle headers rather than the
 * kind-30100 tip. Newest header per universe wins; a later revoke/empty
 * header hides the older live one. Unsigned or non-Arborito `d` tags are
 * ignored.
 * @param {object} client
 * @param {{ limit?: number, onPartial?: (rows: object[]) => void }} [opts]
 * @returns {Promise<object[]>}
 */
export async function listCatalogRowsFromBundleHeaders(client, opts = {}) {
    const limit = Math.max(1, Math.min(800, Number(opts.limit) || 200));
    const prefix = 'arborito:bundle:hdr:';
    /** @type {Map<string, { ca: number, row: object | null }>} */
    const best = new Map();
    const seenIds = new Set();

    const ingest = (evs) => {
        for (const ev of evs || []) {
            const id = String(ev?.id || '');
            if (id && seenIds.has(id)) continue;
            if (id) seenIds.add(id);
            const tags = Array.isArray(ev?.tags) ? ev.tags : [];
            const d = String(tags.find((t) => t && t[0] === 'd')?.[1] || '');
            if (!d.startsWith(prefix)) continue;
            const arb = tags.find((t) => t && t[0] === 'arb' && t[1] === 'root' && t.length >= 4);
            let meta;
            try {
                meta = JSON.parse(ev.content || 'null');
            } catch {
                continue;
            }
            if (!meta || typeof meta !== 'object') continue;
            let ownerPub = arb ? String(arb[2] || '').trim() : '';
            let universeId = arb ? String(arb[3] || '').trim() : '';
            if (!ownerPub || !universeId) {
                const rest = d.slice(prefix.length);
                const sep = rest.indexOf(':');
                if (sep > 0) {
                    ownerPub = rest.slice(0, sep);
                    universeId = rest.slice(sep + 1);
                }
            }
            if (!ownerPub || !universeId) continue;
            const ca = Number(ev.created_at) || 0;
            const key = directoryRowKey(ownerPub, universeId);
            const prev = best.get(key);
            if (prev && ca <= prev.ca) continue;
            const chunks = Number(meta.chunkCount);
            const dead =
                meta.revoked === true ||
                meta.delisted === true ||
                (Number.isFinite(chunks) && chunks <= 0);
            if (dead) {
                best.set(key, { ca, row: null });
                continue;
            }
            const row = normalizeCatalogRow({
                ownerPub,
                universeId,
                title: meta.title,
                shareCode: meta.shareCode,
                updatedAt: meta.updatedAt,
                description: meta.description,
                authorName: meta.authorName,
            });
            best.set(key, { ca, row });
        }
    };

    const rowsNow = () =>
        [...best.values()]
            .filter((item) => item.row)
            .sort((a, b) => b.ca - a.ca)
            .slice(0, limit)
            .map((item) => item.row);

    const relays = typeof client._relays === 'function' ? client._relays() : [];
    const pageLimit = Math.min(160, Math.max(limit, 80));
    const filter = { kinds: [KIND_BUNDLE_HEADER], limit: pageLimit };
    /* Paint the first peer that has courses. Keep gathering until the
     * peers that actually store the catalog have answered, without waiting
     * out a relay that takes several seconds to come back empty. */
    const hardMs = 2200;
    const jobs = (relays.length ? relays : [null]).map((relay) => {
        const run =
            relay && typeof client._queryRelayDirect === 'function'
                ? client._queryRelayDirect(relay, filter, hardMs)
                : client._query(filter, hardMs);
        return Promise.resolve(run)
            .then((evs) => (Array.isArray(evs) ? evs : []))
            .catch(() => []);
    });

    let closed = false;
    /** @type {Promise<object[]>|null} */
    let hydratePromise = null;
    let hydratedInputCount = 0;
    await new Promise((resolve) => {
        const finish = () => {
            if (closed) return;
            closed = true;
            clearTimeout(timer);
            resolve();
        };
        const timer = setTimeout(finish, hardMs);
        if (!jobs.length) {
            finish();
            return;
        }
        let open = jobs.length;
        let painted = 0;
        for (const job of jobs) {
            job.then((evs) => {
                if (closed || !evs.length) return;
                ingest(evs);
                const n = rowsNow().length;
                if (n > painted) {
                    painted = n;
                    try {
                        opts.onPartial?.(rowsNow());
                    } catch {
                        /* UI partial paint must not abort the listing. */
                    }
                    if (!hydratePromise && n >= Math.min(limit, 24)) {
                        hydratedInputCount = n;
                        hydratePromise = hydrateCatalogRowsFromDirectory(client, rowsNow(), {
                            timeoutMs: 2200,
                        });
                    }
                    if (n >= limit) finish();
                }
            }).finally(() => {
                open -= 1;
                if (open <= 0) finish();
            });
        }
    });

    const rows = rowsNow();
    const early = hydratePromise ? await hydratePromise : null;
    /* Same header set we already decorated while the other relays answered. */
    if (early && rows.length === hydratedInputCount && early.some((r) => r && r.icon)) return early;
    return hydrateCatalogRowsFromDirectory(client, rows, { timeoutMs: 2200 });
}

/**
 * Copy icon, description and the rest of the directory card onto header rows.
 * A missing or delisted directory event leaves the header row as-is.
 * @param {object} client
 * @param {object[]} rows
 */
export async function hydrateCatalogRowsFromDirectory(client, rows, opts = {}) {
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) return list;
    const timeoutMs = Math.max(400, Math.min(QUERY_MS, Number(opts.timeoutMs) || 2200));
    const dTags = list.map((r) => directoryDTag(r.ownerPub, r.universeId)).filter(Boolean);
    /* The three quickest relays often have the headers and not the directory
     * body. The assigned emoji lives on the peers that stored the publish. */
    const relays =
        typeof client._relays === 'function'
            ? client._relays()
            : typeof client._relaysFastFirst === 'function'
              ? client._relaysFastFirst()
              : [];
    /** @type {object[]} */
    const evs = [];
    const batch = 24;
    const jobs = [];
    for (let i = 0; i < dTags.length; i += batch) {
        const slice = dTags.slice(i, i + batch);
        const filter = { kinds: [KIND_TREE_DIRECTORY], '#d': slice, limit: Math.min(slice.length * 2, 80) };
        if (relays.length && typeof client._queryRelayDirect === 'function') {
            for (const relay of relays) {
                jobs.push(client._queryRelayDirect(relay, filter, timeoutMs).catch(() => []));
            }
        } else {
            jobs.push(client._query(filter, timeoutMs).catch(() => []));
        }
    }
    const wanted = new Set(dTags);
    await new Promise((resolve) => {
        const finish = () => {
            clearTimeout(timer);
            resolve();
        };
        const timer = setTimeout(finish, timeoutMs);
        if (!jobs.length) {
            finish();
            return;
        }
        let open = jobs.length;
        const seenD = new Set();
        for (const job of jobs) {
            job.then((page) => {
                if (!Array.isArray(page) || !page.length) return;
                evs.push(...page);
                for (const ev of page) {
                    const d = String((ev.tags || []).find((t) => t && t[0] === 'd')?.[1] || '');
                    if (wanted.has(d)) seenD.add(d);
                }
                if (seenD.size >= wanted.size) finish();
            }).finally(() => {
                open -= 1;
                if (open <= 0) finish();
            });
        }
    });
    /** @type {Map<string, object>} */
    const richer = new Map();
    /** @type {Set<string>} */
    const dropped = new Set();
    for (const item of client._latestTreeDirectoryRowsFromEvents(evs)) {
        const key = directoryRowKey(item.body?.ownerPub, item.body?.universeId);
        if (item.body?.delisted === true) {
            if (key) dropped.add(key);
            continue;
        }
        const row = await client._directoryRowFromVerifiedEvent(item.ev, item.body);
        if (!row) continue;
        const rk = directoryRowKey(row.ownerPub, row.universeId);
        if (rk) richer.set(rk, row);
    }
    return list
        .filter((prev) => !dropped.has(directoryRowKey(prev.ownerPub, prev.universeId)))
        .map((prev) => {
            const full = richer.get(directoryRowKey(prev.ownerPub, prev.universeId));
            if (!full) return prev;
            return {
                ...prev,
                ...full,
                title: full.title || prev.title,
                shareCode: full.shareCode || prev.shareCode,
                updatedAt: full.updatedAt || prev.updatedAt,
            };
        });
}
