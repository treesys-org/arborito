/**
 * Global tree directory — Discover list path: maintainer blocklist, live delist
 * reconcile, snapshot merge, trigram search, and bounded relay crawl.
 */

import {
    DIRECTORY_CLIENT_CRAWL_MAX_AGE_SEC,
    DIRECTORY_CLIENT_CRAWL_MAX_EVENTS,
    DIRECTORY_CLIENT_CRAWL_PAGE_SIZE,
    DIRECTORY_CLIENT_FETCH_PAGE,
    getConfiguredDirectoryIndexPublishers,
} from '../../../p2p-webtorrent/api/directory-index-config.js';
import {
    catalogRowMatchesQuery,
    directoryRowKey,
    rankTrigramsForSearch,
    trigramsFromQuery,
} from '../directory-trigram-index.js';
import { verifyGlobalTreeDirectoryMetaNostr } from '../../../p2p-webtorrent/api/directory-index-shared.js';
import { normalizeNostrRelayUrls } from '../nostr-relays-runtime.js';
import {
    KIND_TREE_DIRECTORY,
    TAG_APP,
    TAG_APP_VALUE,
    directoryDTag,
} from '../nostr-spec.js';
import { isNostrTreeMaintainerBlocked } from '../maintainer-nostr-tree-blocklist.js';
import { QUERY_MS } from './_shared.js';

/** True when the signed event carries `["app","arborito"]` (client-side filter). */
function eventHasArboritoAppTag(ev) {
    const tags = Array.isArray(ev?.tags) ? ev.tags : [];
    return tags.some(
        (t) => Array.isArray(t) && String(t[0]) === TAG_APP && String(t[1]) === TAG_APP_VALUE
    );
}

export const directoryListMixin = {
    /**
     * Drop maintainer-blocked rows as early as the directory list path.
     * Relays/snapshots may still ship them; clients must not paint them.
     * @param {object[]} rows
     * @returns {object[]}
     */
    _filterMaintainerBlockedDirectoryRows(rows) {
        const list = Array.isArray(rows) ? rows : [];
        if (!list.length) return list;
        return list.filter(
            (r) => !isNostrTreeMaintainerBlocked(r?.ownerPub, r?.universeId)
        );
    },

    /**
     * Snapshot / torrent mirrors can lag behind owner delist replaceables.
     * Probe live kind-30100 rows by `d` tag and return keys whose newest body is delisted.
     * Missing relay answers do not tombstone (incomplete intel must not empty Discover).
     * @param {object[]} rows
     * @returns {Promise<Set<string>>}
     */
    async _collectLiveDirectoryDelistKeys(rows) {
        /** @type {Set<string>} */
        const delisted = new Set();
        const list = Array.isArray(rows) ? rows : [];
        if (!list.length) return delisted;

        /** @type {{ key: string, ownerPub: string, d: string }[]} */
        const targets = [];
        const seen = new Set();
        for (const r of list) {
            const ownerPub = String(r?.ownerPub || '').trim();
            const universeId = String(r?.universeId || '').trim();
            const key = directoryRowKey(ownerPub, universeId);
            if (!ownerPub || !universeId || !key || key === '/' || seen.has(key)) continue;
            seen.add(key);
            targets.push({ key, ownerPub, d: directoryDTag(ownerPub, universeId) });
        }
        if (!targets.length) return delisted;

        const BATCH = 24;
        for (let i = 0; i < targets.length; i += BATCH) {
            const batch = targets.slice(i, i + BATCH);
            const dTags = batch.map((t) => t.d);
            const authors = [...new Set(batch.map((t) => t.ownerPub))];
            let evs = [];
            try {
                evs = await this._query(
                    {
                        kinds: [KIND_TREE_DIRECTORY],
                        authors,
                        '#d': dTags,
                        limit: Math.min(200, Math.max(batch.length * 2, 40)),
                    },
                    QUERY_MS
                );
            } catch {
                evs = [];
            }
            /** @type {Map<string, object>} */
            const newestBody = new Map();
            for (const { body } of this._latestTreeDirectoryRowsFromEvents(evs || [])) {
                const k = directoryRowKey(body?.ownerPub, body?.universeId);
                if (k && k !== '/') newestBody.set(k, body);
            }
            for (const t of batch) {
                const body = newestBody.get(t.key);
                if (body && body.delisted === true) delisted.add(t.key);
            }
        }
        return delisted;
    },

    /**
     * Remove tombstoned keys from a working list + seen set; remember for mirror merges.
     * @param {object[]} rows
     * @param {Set<string>} seen
     * @param {Set<string>} delistedKeys
     * @returns {object[]}
     */
    _purgeDirectoryDelistKeys(rows, seen, delistedKeys) {
        if (!(delistedKeys instanceof Set) || !delistedKeys.size) return rows;
        for (const k of delistedKeys) {
            seen?.delete?.(k);
            this._lastDirectoryTombstoneKeys?.add?.(k);
        }
        return rows.filter((r) => {
            const k = directoryRowKey(r?.ownerPub, r?.universeId);
            return !k || !delistedKeys.has(k);
        });
    },

    async listGlobalTreeDirectoryEntriesOnce(opts = {}) {
        const limit = Math.max(1, Math.min(800, Number(opts.limit) || 120));
        const q = String(opts.query || '').trim();
        const qLower = q.toLowerCase();
        /** Keys confirmed delisted live — mirrors must not re-inject them. */
        this._lastDirectoryTombstoneKeys = new Set();
        const onPartial = typeof opts.onPartial === 'function' ? opts.onPartial : null;
        const emitPartial = (rows) => {
            if (!onPartial || !rows.length) return;
            try {
                onPartial(this._filterMaintainerBlockedDirectoryRows(rows).slice(0, limit));
            } catch {
                /* UI partial paint must not abort the listing. */
            }
        };
        /*
         * Bundle-header warm used to gate the whole list (QUERY_MS_LONG) even when
         * snapshots were empty — Discover waited seconds before the first crawl
         * REQ. Defer warm to a microtask so the first crawl page claims query
         * slots first; `_isKnownDeadDirectoryKey` starts filtering as the cache
         * lands, and Discover still runs `_filterDirectoryRowsWithPublishedBundle`
         * once at the end. Incomplete intel must not empty / delay the catalog.
         */
        queueMicrotask(() => {
            void this._publishedBundleStateCached().catch(() => null);
        });
        const indexed = await this._mergeDirectoryRowsFromSnapshots(limit, qLower);
        let merged = this._filterMaintainerBlockedDirectoryRows(
            indexed.filter((r) => !this._isKnownDeadDirectoryKey(r?.ownerPub, r?.universeId))
        );
        /** @type {Set<string>} */
        const seen = new Set(
            merged.map((r) => directoryRowKey(r.ownerPub, r.universeId)).filter(Boolean)
        );
        /*
         * Snapshots / shards can retain a pre-delist meta until the aggregator
         * rebuilds. Crawl used to `excludeKeys: seen`, so a full snapshot never
         * learned about newer delist replaceables — ghosts stayed in Discover.
         * Reconcile before the first paint so delisted rows never flash.
         */
        if (merged.length) {
            try {
                const snapDelists = await this._collectLiveDirectoryDelistKeys(merged);
                if (snapDelists.size) {
                    merged = this._purgeDirectoryDelistKeys(merged, seen, snapDelists);
                }
            } catch {
                /* relay probe failed — keep snapshot rows; crawl may still help */
            }
        }
        /* Snapshot index is the fast path — paint Discover before crawl/trigram. */
        emitPartial(merged);

        /** @type {Set<string>} */
        const crawlDelists = new Set();

        if (q.length >= 3) {
            const tagRows = await this.searchGlobalDirectoryByTrigrams({
                query: q,
                limit,
                excludeKeys: seen,
            });
            for (const r of this._filterMaintainerBlockedDirectoryRows(tagRows)) {
                if (this._isKnownDeadDirectoryKey(r?.ownerPub, r?.universeId)) continue;
                const k = directoryRowKey(r.ownerPub, r.universeId);
                if (!seen.has(k)) {
                    seen.add(k);
                    merged.push(r);
                }
            }
            emitPartial(merged);
            /* Some relays ignore or fail multi-tag filters (`#t` + `#app`).
             * When trigram search is thin, fall back to the bounded crawl and
             * match titles client-side so listings do not vanish on search. */
            if (merged.length < limit) {
                const need = limit - merged.length;
                const rest = await this._traverseGlobalDirectoryEntries({
                    limit: need,
                    query: q,
                    excludeKeys: seen,
                    delistedKeys: crawlDelists,
                    onPartial: (pageRows) => {
                        for (const r of this._filterMaintainerBlockedDirectoryRows(pageRows)) {
                            if (this._isKnownDeadDirectoryKey(r?.ownerPub, r?.universeId)) continue;
                            const k = directoryRowKey(r.ownerPub, r.universeId);
                            if (seen.has(k)) continue;
                            seen.add(k);
                            merged.push(r);
                        }
                        emitPartial(merged);
                    },
                });
                for (const r of this._filterMaintainerBlockedDirectoryRows(rest)) {
                    if (this._isKnownDeadDirectoryKey(r?.ownerPub, r?.universeId)) continue;
                    const k = directoryRowKey(r.ownerPub, r.universeId);
                    if (seen.has(k)) continue;
                    seen.add(k);
                    merged.push(r);
                }
                if (crawlDelists.size) {
                    merged = this._purgeDirectoryDelistKeys(merged, seen, crawlDelists);
                }
                emitPartial(merged);
            }
        } else if (merged.length < limit) {
            const need = limit - merged.length;
            const rest = await this._traverseGlobalDirectoryEntries({
                limit: need,
                query: qLower,
                excludeKeys: seen,
                delistedKeys: crawlDelists,
                onPartial: (pageRows) => {
                    const batch = [...merged];
                    for (const r of this._filterMaintainerBlockedDirectoryRows(pageRows)) {
                        if (this._isKnownDeadDirectoryKey(r?.ownerPub, r?.universeId)) continue;
                        const k = directoryRowKey(r.ownerPub, r.universeId);
                        if (seen.has(k)) continue;
                        seen.add(k);
                        batch.push(r);
                    }
                    merged = batch;
                    emitPartial(merged);
                },
            });
            for (const r of this._filterMaintainerBlockedDirectoryRows(rest)) {
                if (this._isKnownDeadDirectoryKey(r?.ownerPub, r?.universeId)) continue;
                const k = directoryRowKey(r.ownerPub, r.universeId);
                if (seen.has(k)) continue;
                seen.add(k);
                merged.push(r);
            }
            if (crawlDelists.size) {
                merged = this._purgeDirectoryDelistKeys(merged, seen, crawlDelists);
            }
            emitPartial(merged);
        }

        return this._filterMaintainerBlockedDirectoryRows(merged).slice(0, limit);
    },

    /**
     * Relay search via Nostr `#t` tags (publish-time index). Requires query length ≥ 3.
     * @param {{ query?: string, limit?: number, excludeKeys?: Set<string> }} [opts]
     */
    async searchGlobalDirectoryByTrigrams(opts = {}) {
        const limit = Math.max(1, Math.min(800, Number(opts.limit) || 120));
        const q = String(opts.query || '').trim();
        if (q.length < 3) return [];
        const excludeKeys = opts.excludeKeys instanceof Set ? opts.excludeKeys : new Set();

        const cacheKey = `${q.toLowerCase()}|${limit}`;
        const now = Date.now();
        if (this._trigramSearchCacheKey === cacheKey && now - (this._trigramSearchCacheAt || 0) < 45_000) {
            return (this._trigramSearchCacheRows || []).filter(
                (r) => !excludeKeys.has(directoryRowKey(r.ownerPub, r.universeId))
            );
        }

        const tris = rankTrigramsForSearch(trigramsFromQuery(q));
        if (!tris.length) return [];

        const relayLimit = Math.min(200, Math.max(limit * 2, 80));
        const since = Math.floor(Date.now() / 1000) - 180 * 86400;

        /** @type {Map<string, { ev: object, body: object }>} */
        const best = new Map();

        const runTri = async (tri) => {
            /* Query `#t` only. Several public relays (e.g. nos.lol) return
             * empty sets for multi-tag filters that also require `#app`, even
             * when the event carries `["app","arborito"]`. Enforce the app
             * tag client-side after the fetch instead. */
            const evs = await this._query(
                {
                    kinds: [KIND_TREE_DIRECTORY],
                    '#t': [tri],
                    since,
                    limit: relayLimit,
                },
                QUERY_MS
            );
            for (const { ev, body } of this._latestTreeDirectoryRowsFromEvents(evs || [])) {
                if (!eventHasArboritoAppTag(ev)) continue;
                const ownerPub = String(body.ownerPub || '');
                const universeId = String(body.universeId || '');
                const key = directoryRowKey(ownerPub, universeId);
                if (!ownerPub || !universeId || excludeKeys.has(key)) continue;
                const ca = Number(ev.created_at) || 0;
                const prev = best.get(key);
                if (!prev || ca > (Number(prev.ev.created_at) || 0)) best.set(key, { ev, body });
            }
        };

        await runTri(tris[0]);
        if (best.size < limit && tris.length > 1) await runTri(tris[1]);

        const out = [];
        for (const { ev, body } of best.values()) {
            if (out.length >= limit) break;
            if (isNostrTreeMaintainerBlocked(body?.ownerPub, body?.universeId)) continue;
            const row = await this._directoryRowFromVerifiedEvent(ev, body);
            if (row && catalogRowMatchesQuery(q, row)) out.push(row);
        }

        /* Do not cache empty misses — relays flake and multi-tag bugs used to
         * stick a blank result for 45s, making listings look gone forever. */
        if (out.length) {
            this._trigramSearchCacheKey = cacheKey;
            this._trigramSearchCacheAt = now;
            this._trigramSearchCacheRows = out;
        }
        return out.slice(0, limit);
    },

    /**
     * @param {import('core.js').Event} ev
     * @param {object} body
     */
    async _directoryRowFromVerifiedEvent(ev, body) {
        if (!(await verifyGlobalTreeDirectoryMetaNostr(ev, body))) return null;
        if (body.delisted === true) return null;
        const ownerPub = String(body.ownerPub || '');
        const universeId = String(body.universeId || '');
        if (!ownerPub || !universeId) return null;
        const relays = Array.isArray(body.recommendedRelays) ? normalizeNostrRelayUrls(body.recommendedRelays) : [];
        const bodyLangs = Array.isArray(body.languages)
            ? body.languages.map((c) => String(c || '').trim().toUpperCase()).filter(Boolean)
            : [];
        const bodyTitles =
            body.titles && typeof body.titles === 'object' && !Array.isArray(body.titles)
                ? Object.fromEntries(
                      Object.entries(body.titles)
                          .map(([k, v]) => [
                              String(k || '')
                                  .trim()
                                  .toUpperCase(),
                              String(v || '').trim(),
                          ])
                          .filter(([k, v]) => k && v)
                          .slice(0, 16)
                  )
                : {};
        const bodyDescriptions =
            body.descriptions && typeof body.descriptions === 'object' && !Array.isArray(body.descriptions)
                ? Object.fromEntries(
                      Object.entries(body.descriptions)
                          .map(([k, v]) => [
                              String(k || '')
                                  .trim()
                                  .toUpperCase(),
                              String(v || '').trim(),
                          ])
                          .filter(([k, v]) => k && v)
                          .slice(0, 16)
                  )
                : {};
        const contentKind = String(body.contentKind || '').trim();
        const branchSetHash = String(body.branchSetHash || '').trim();
        const forkOfUrl = String(body.forkOfUrl || '').trim();
        const icon = String(body.icon || '').trim().slice(0, 32);
        return {
            ownerPub,
            universeId,
            title: String(body.title || '').trim(),
            shareCode: String(body.shareCode || ''),
            updatedAt: String(body.updatedAt || ''),
            description: String(body.description || ''),
            authorName: String(body.authorName || ''),
            ...(Object.keys(bodyTitles).length ? { titles: bodyTitles } : {}),
            ...(Object.keys(bodyDescriptions).length ? { descriptions: bodyDescriptions } : {}),
            ...(bodyLangs.length ? { languages: bodyLangs } : {}),
            ...(relays.length ? { recommendedRelays: relays } : {}),
            ...(contentKind ? { contentKind } : {}),
            ...(branchSetHash ? { branchSetHash } : {}),
            ...(forkOfUrl ? { forkOfUrl } : {}),
            ...(icon ? { icon } : {}),
        };
    },

    async _mergeDirectoryRowsFromSnapshots(limit, qRaw) {
        /* No trusted publisher configured → snapshots can never verify
         * (fail-closed), so skip the relay round-trips entirely. */
        if (!getConfiguredDirectoryIndexPublishers().length) return [];
        const q = String(qRaw || '').trim().toLowerCase();
        const [recentSnap, topSnap] = await Promise.all([
            this.loadDirectoryIndexSnapshotOnce('recent'),
            this.loadDirectoryIndexSnapshotOnce('top')
        ]);
        const sanitize = async (snap) => {
            if (!snap || !(await this.verifyDirectoryIndexSnapshot(snap))) return [];
            const arr = Array.isArray(snap.entries) ? snap.entries : [];
            const ok = [];
            for (const meta of arr) {
                if (meta && typeof meta === 'object' && (await verifyGlobalTreeDirectoryMetaNostr(meta.sig, meta))) ok.push(meta);
            }
            return ok;
        };
        const recent = await sanitize(recentSnap);
        const top = await sanitize(topSnap);
            const matches = (meta) => {
            if (!q) return true;
            const title = String(meta.title || '').trim();
            const titlesBlob = meta.titles && typeof meta.titles === 'object'
                ? Object.values(meta.titles).map((v) => String(v || '').trim()).filter(Boolean).join('\n')
                : '';
            const description = String(meta.description || '').trim();
            const authorName = String(meta.authorName || '').trim();
            const shareCode = String(meta.shareCode || '').trim();
            const hay = `${title}\n${titlesBlob}\n${description}\n${authorName}\n${shareCode}`.toLowerCase();
            return hay.includes(q);
        };
        const seen = new Set();
        /** @type {{ ownerPub: string, universeId: string, title: string, shareCode: string, updatedAt: string, description?: string, authorName?: string }[]} */
        const rows = [];
        const push = (meta) => {
            if (meta && meta.delisted === true) return;
            const ownerPub = String(meta.ownerPub || '');
            const universeId = String(meta.universeId || '');
            const key = `${ownerPub}/${universeId}`;
            if (!ownerPub || !universeId || seen.has(key)) return;
            if (isNostrTreeMaintainerBlocked(ownerPub, universeId)) return;
            if (!matches(meta)) return;
            seen.add(key);
            const snapRelays =
                Array.isArray(meta.recommendedRelays) ? normalizeNostrRelayUrls(meta.recommendedRelays) : [];
            const snapLangs = Array.isArray(meta.languages)
                ? meta.languages.map((c) => String(c || '').trim().toUpperCase()).filter(Boolean)
                : [];
            const snapTitles =
                meta.titles && typeof meta.titles === 'object' && !Array.isArray(meta.titles)
                    ? Object.fromEntries(
                          Object.entries(meta.titles)
                              .map(([k, v]) => [
                                  String(k || '')
                                      .trim()
                                      .toUpperCase(),
                                  String(v || '').trim(),
                              ])
                              .filter(([k, v]) => k && v)
                              .slice(0, 16)
                      )
                    : {};
            const contentKind = String(meta.contentKind || '').trim();
            const branchSetHash = String(meta.branchSetHash || '').trim();
            const forkOfUrl = String(meta.forkOfUrl || '').trim();
            const icon = String(meta.icon || '').trim().slice(0, 32);
            const snapDescriptions =
                meta.descriptions && typeof meta.descriptions === 'object' && !Array.isArray(meta.descriptions)
                    ? Object.fromEntries(
                          Object.entries(meta.descriptions)
                              .map(([k, v]) => [
                                  String(k || '')
                                      .trim()
                                      .toUpperCase(),
                                  String(v || '').trim(),
                              ])
                              .filter(([k, v]) => k && v)
                              .slice(0, 16)
                      )
                    : {};
            rows.push({
                ownerPub,
                universeId,
                title: String(meta.title || '').trim(),
                shareCode: String(meta.shareCode || ''),
                updatedAt: String(meta.updatedAt || ''),
                description: String(meta.description || ''),
                authorName: String(meta.authorName || ''),
                ...(Object.keys(snapTitles).length ? { titles: snapTitles } : {}),
                ...(Object.keys(snapDescriptions).length ? { descriptions: snapDescriptions } : {}),
                ...(snapLangs.length ? { languages: snapLangs } : {}),
                ...(snapRelays.length ? { recommendedRelays: snapRelays } : {}),
                ...(contentKind ? { contentKind } : {}),
                ...(branchSetHash ? { branchSetHash } : {}),
                ...(forkOfUrl ? { forkOfUrl } : {}),
                ...(icon ? { icon } : {}),
            });
        };
        for (const meta of recent) {
            push(meta);
            if (rows.length >= limit) return rows;
        }
        for (const meta of top) {
            push(meta);
            if (rows.length >= limit) return rows;
        }
        return rows;
    },

    /**
     * Same `ownerPub/universeId` may have several replacements (publish → delist). Keep the newest `created_at`.
     */
    _latestTreeDirectoryRowsFromEvents(evs) {
        /** @type {Map<string, { ev: import('core.js').Event, body: object }>} */
        const best = new Map();
        for (const ev of evs) {
            let body;
            try {
                body = JSON.parse(ev.content || 'null');
            } catch {
                continue;
            }
            if (!body || typeof body !== 'object') continue;
            if (String(body.kind) !== 'tree_directory_v2') continue;
            const ownerPub = String(body.ownerPub || '');
            const universeId = String(body.universeId || '');
            if (!ownerPub || !universeId) continue;
            const key = `${ownerPub}/${universeId}`;
            const ca = Number(ev.created_at) || 0;
            const prev = best.get(key);
            if (!prev || ca > (Number(prev.ev.created_at) || 0)) best.set(key, { ev, body });
        }
        return [...best.values()];
    },

    /**
     * Live Discover crawl — **first relay to deliver a course wins that row**.
     *
     * Each peer pages its own `until` cursor independently (no shared page
     * barrier). Queries bypass the global concurrency gate so slow/cooling
     * relays cannot serialize the race. Rows paint **one at a time** via
     * `onPartial([row])` as soon as each body verifies. A newer replaceable may
     * still upgrade `best` for the final return.
     *
     * First REQ uses `limit:1` so the catalog never waits for a 48-event EOSE
     * before the first card. Later pages widen (8 → fetch-page → crawl page).
     *
     * Scale invariant (millions of listings): never per-row relay revoke checks.
     * Budget is `DIRECTORY_CLIENT_CRAWL_MAX_EVENTS` + age cap. Deep catalog is
     * snapshot index + `#t` / share-code search — not an unbounded client crawl.
     */
    async _traverseGlobalDirectoryEntries(opts) {
        const limit = Math.max(1, Math.min(800, Number(opts.limit) || 120));
        const q = String(opts.query || '').trim().toLowerCase();
        const excludeKeys = opts.excludeKeys instanceof Set ? opts.excludeKeys : new Set();
        /** Optional out-set: newest directory body for a key is `delisted: true`. */
        const delistedKeys = opts.delistedKeys instanceof Set ? opts.delistedKeys : null;
        const onPartial = typeof opts.onPartial === 'function' ? opts.onPartial : null;
        const pageSize = Math.max(50, Math.min(500, Number(DIRECTORY_CLIENT_CRAWL_PAGE_SIZE) || 200));
        const widenPage = Math.max(
            8,
            Math.min(pageSize, Number(DIRECTORY_CLIENT_FETCH_PAGE) || 48)
        );
        const maxEvents = Math.max(pageSize, Math.min(20000, Number(DIRECTORY_CLIENT_CRAWL_MAX_EVENTS) || 3000));
        const maxAgeSec = Math.max(86400, Number(DIRECTORY_CLIENT_CRAWL_MAX_AGE_SEC) || 180 * 86400);
        const oldestAllowed = Math.floor(Date.now() / 1000) - maxAgeSec;
        const nowUntil = Math.floor(Date.now() / 1000) + 60;
        /**
         * Cold first REQ stays snappy; later pages use the full query budget so
         * Pages cold-load does not timeout mid-batch and falsely EOSE the peer.
         */
        const FIRST_WAIT_MS = Math.min(QUERY_MS, 3500);
        const NEXT_WAIT_MS = QUERY_MS;
        const maxPagesPerRelay = Math.ceil(maxEvents / 1) + 2;

        /* Invalidate older Discover crawls still finishing after an early exit. */
        const crawlGen = (this._directoryCrawlGen = (this._directoryCrawlGen || 0) + 1);
        const crawlCurrent = () => this._directoryCrawlGen === crawlGen;

        const noteDelistBody = (body) => {
            if (!delistedKeys || !body || body.delisted !== true) return;
            const k = directoryRowKey(body.ownerPub, body.universeId);
            if (k && k !== '/') delistedKeys.add(k);
        };

        const relays =
            typeof this._relaysFastFirst === 'function'
                ? this._relaysFastFirst()
                : typeof this._relays === 'function'
                  ? this._relays()
                  : [];
        if (!relays.length) return [];

        /** @type {Map<string, number>} */
        const untilByRelay = new Map(relays.map((r) => [r, nowUntil]));
        /** @type {Set<string>} */
        const exhausted = new Set();

        /** @type {Map<string, { ev: import('core.js').Event, body: object }>} */
        const best = new Map();
        /** @type {Set<string>} */
        const emittedKeys = new Set();
        /** @type {Map<string, object>} verified rows already painted — skip re-verify on return */
        const verifiedByKey = new Map();
        /** Dedup event ids across the race. */
        const seenEventIds = new Set();
        let fetched = 0;
        let stopAll = false;
        /** Resolve when first-wins filled the page so slow peers cannot hold Discover open. */
        let resolveFilled = null;
        const filledGate = new Promise((resolve) => {
            resolveFilled = resolve;
        });

        const liveUniqueCount = () => {
            let n = 0;
            for (const { body } of best.values()) {
                if (!body || body.delisted === true) continue;
                if (this._isKnownDeadDirectoryKey(body.ownerPub, body.universeId)) continue;
                n += 1;
            }
            return n;
        };

        const filledEnough = () => {
            if (q) return false;
            /* Prefer painted/verified count when streaming; otherwise raw live bodies. */
            if (onPartial) return emittedKeys.size >= limit;
            return liveUniqueCount() >= limit;
        };

        const shouldStop = () =>
            stopAll || !crawlCurrent() || fetched >= maxEvents || filledEnough();

        const signalFilled = () => {
            if (!filledEnough()) return;
            stopAll = true;
            resolveFilled?.();
            resolveFilled = null;
        };

        /**
         * Verify + paint **one row at a time** so Discover streams even when a
         * single relay returns a batch. First viewport yields a frame per card
         * (enter animation); past that, fill the ahead-buffer without waiting
         * on rAF so scroll-ahead stays warm.
         */
        const FIRST_VIEWPORT_STREAM = 16;
        const emitNewRows = async () => {
            if (!onPartial) {
                signalFilled();
                return;
            }
            const rows = [...best.values()].sort(
                (a, b) => (Number(b.ev.created_at) || 0) - (Number(a.ev.created_at) || 0)
            );
            for (const { ev, body } of rows) {
                if (shouldStop() && emittedKeys.size >= limit) break;
                if (emittedKeys.size >= limit) break;
                const key = directoryRowKey(String(body?.ownerPub || ''), String(body?.universeId || ''));
                if (!key || excludeKeys.has(key) || emittedKeys.has(key)) continue;
                if (this._isKnownDeadDirectoryKey(body?.ownerPub, body?.universeId)) continue;
                if (body?.delisted === true) continue;
                const row = await this._directoryRowFromVerifiedEvent(ev, body);
                if (!crawlCurrent()) return;
                if (!row) continue;
                const rk = directoryRowKey(row.ownerPub, row.universeId) || key;
                if (excludeKeys.has(rk) || emittedKeys.has(rk)) continue;
                if (q && !catalogRowMatchesQuery(q, row)) continue;
                emittedKeys.add(rk);
                verifiedByKey.set(rk, row);
                try {
                    onPartial([row]);
                } catch {
                    /* UI partial paint must not abort the crawl. */
                }
                if (emittedKeys.size <= FIRST_VIEWPORT_STREAM) {
                    await new Promise((resolve) => {
                        requestAnimationFrame(() => resolve());
                    });
                    if (!crawlCurrent()) return;
                }
                if (emittedKeys.size >= limit) break;
            }
            signalFilled();
        };

        /**
         * Serialize merge of concurrent relay replies (map mutations), then paint.
         * First body for a key wins the paint; newer replaceables still update `best`.
         * @type {Promise<void>}
         */
        let mergeTail = Promise.resolve();
        /**
         * @param {{ relay: string, until: number, evs: object[] }} page
         */
        const mergeRelayPage = (page) => {
            const run = async () => {
                if (!crawlCurrent()) return;
                if (shouldStop() && !page.evs?.length) {
                    exhausted.add(page.relay);
                    return;
                }
                /* Still ingest the page that just arrived even if another peer
                 * already filled the limit — then stop. Dropping it lost rows on
                 * the second open when a stale crawl flipped stopAll mid-flight. */
                const { relay, until, evs } = page;
                /*
                 * Empty page = real EOSE for this until-cursor.
                 * Do **not** treat a short page (fewer events than the REQ limit)
                 * as EOSE: querySync resolves on maxWait with a partial batch
                 * (common on GitHub Pages cold WS). That used to exhaust every
                 * peer after page 2 (budget 8), leave Discover with ~7 network
                 * rows, and freeze widen (hitCap false). True end-of-history
                 * still yields [] on the next page, or trips the stagnant
                 * counter when events repeat without new keys.
                 */
                if (!evs.length) exhausted.add(relay);
                let oldest = until;
                for (const ev of evs) {
                    const ca = Number(ev.created_at) || 0;
                    if (ca && ca < oldest) oldest = ca;
                    const id = String(ev?.id || '');
                    if (id && !seenEventIds.has(id)) {
                        seenEventIds.add(id);
                        fetched += 1;
                    }
                }
                if (oldest <= oldestAllowed) exhausted.add(relay);
                if (evs.length) untilByRelay.set(relay, Math.max(oldestAllowed, oldest - 1));
                for (const item of this._latestTreeDirectoryRowsFromEvents(evs)) {
                    const key = `${String(item.body.ownerPub || '')}/${String(item.body.universeId || '')}`;
                    const prev = best.get(key);
                    const ca = Number(item.ev.created_at) || 0;
                    if (!prev || ca > (Number(prev.ev.created_at) || 0)) {
                        best.set(key, item);
                        noteDelistBody(item.body);
                        if (prev && delistedKeys && item.body?.delisted !== true) {
                            delistedKeys.delete(key);
                        }
                    }
                }
                await emitNewRows();
                if (shouldStop()) exhausted.add(relay);
            };
            mergeTail = mergeTail.then(run, () => run());
            return mergeTail;
        };

        const queryRelayPage = async (relay, filter, ms) => {
            if (!crawlCurrent() || shouldStop()) return [];
            try {
                if (typeof this._queryRelayDirect === 'function') {
                    return await this._queryRelayDirect(relay, filter, ms);
                }
                if (typeof this._queryRelays === 'function') {
                    return await this._queryRelays([relay], filter, ms);
                }
                return await this._query(filter, ms);
            } catch {
                return [];
            }
        };

        /** @param {number} page 1-based */
        const budgetForPage = (page) => {
            if (page === 1) return 1;
            if (page === 2) return Math.min(8, widenPage);
            if (page === 3) return widenPage;
            return pageSize;
        };

        /**
         * One worker per relay — pages alone, never waits for peers.
         * First peer with events paints Discover; others only fill missing keys.
         * @param {string} relay
         */
        const crawlRelay = async (relay) => {
            let stagnant = 0;
            let prevLiveForRelay = 0;
            for (let page = 1; page <= maxPagesPerRelay; page += 1) {
                if (shouldStop() || exhausted.has(relay) || !crawlCurrent()) break;
                const budget = Math.min(budgetForPage(page), Math.max(0, maxEvents - fetched));
                if (budget <= 0) break;
                const until = untilByRelay.get(relay) || nowUntil;
                const evs = await queryRelayPage(
                    relay,
                    { kinds: [KIND_TREE_DIRECTORY], until, limit: budget },
                    page === 1 ? FIRST_WAIT_MS : NEXT_WAIT_MS
                );
                if (!crawlCurrent()) break;
                const beforeKeys = best.size;
                await mergeRelayPage({
                    relay,
                    until,
                    evs: Array.isArray(evs) ? evs : [],
                });
                if (shouldStop() || exhausted.has(relay) || !crawlCurrent()) break;
                const live = liveUniqueCount();
                if (live <= prevLiveForRelay && best.size <= beforeKeys) {
                    stagnant += 1;
                } else {
                    stagnant = 0;
                }
                prevLiveForRelay = live;
                /* This peer has nothing new — leave the race; others keep going. */
                if (page >= 2 && stagnant >= 2) {
                    exhausted.add(relay);
                    break;
                }
            }
            exhausted.add(relay);
        };

        await Promise.race([Promise.all(relays.map((r) => crawlRelay(r))), filledGate]);
        stopAll = true;
        resolveFilled = null;
        await mergeTail;
        if (!crawlCurrent()) {
            /* Superseded by a newer Discover fetch — return what we painted. */
            return [...verifiedByKey.values()].slice(0, limit);
        }

        const out = [];
        const seen = new Set();
        const rows = [...best.values()].sort(
            (a, b) => (Number(b.ev.created_at) || 0) - (Number(a.ev.created_at) || 0)
        );
        for (const { ev, body } of rows) {
            noteDelistBody(body);
            if (out.length >= limit) break;
            if (this._isKnownDeadDirectoryKey(body?.ownerPub, body?.universeId)) continue;
            if (isNostrTreeMaintainerBlocked(body?.ownerPub, body?.universeId)) continue;
            const keyGuess = directoryRowKey(String(body?.ownerPub || ''), String(body?.universeId || ''));
            let row = keyGuess ? verifiedByKey.get(keyGuess) : null;
            if (!row) {
                row = await this._directoryRowFromVerifiedEvent(ev, body);
            }
            if (!row) continue;
            const key = directoryRowKey(row.ownerPub, row.universeId);
            if (excludeKeys.has(key) || seen.has(key)) continue;
            if (q) {
                if (!catalogRowMatchesQuery(q, row)) continue;
            }
            seen.add(key);
            out.push(row);
        }
        return out;
    }
};
