/**
 * Global tree directory: publishing per-universe entries, verifying them
 * against the signed `tree_directory_v2` payload, building/merging the
 * snapshot + bump records, and walking the live event stream for clients
 * that haven't consumed a snapshot yet.
 */

import { getConfiguredDirectoryIndexPublishers } from '../../../p2p-webtorrent/api/directory-index-config.js';
import {
    catalogRowMatchesQuery,
    directoryRowKey,
    directoryTrigramTagsForRow,
    rankTrigramsForSearch,
    trigramsFromQuery,
} from '../directory-trigram-index.js';
import {
    verifyDirectoryBumpNostr,
    verifyDirectoryIndexSnapshotNostr,
    verifyGlobalTreeDirectoryMetaNostr
} from '../../../p2p-webtorrent/api/directory-index-shared.js';
import { normalizeNostrRelayUrls } from '../nostr-relays-runtime.js';
import {
    KIND_BUNDLE_HEADER,
    KIND_DIRECTORY_BUMP,
    KIND_DIRECTORY_INDEX_SNAPSHOT,
    KIND_TREE_DIRECTORY,
    TAG_APP,
    TAG_APP_VALUE,
    arbRootTag,
    directoryDTag,
    directoryIndexChunkDTag
} from '../nostr-spec.js';
import { QUERY_MS_LONG, QUERY_MS, truncateUtf8 } from './_shared.js';

/** True when the signed event carries `["app","arborito"]` (client-side filter). */
function eventHasArboritoAppTag(ev) {
    const tags = Array.isArray(ev?.tags) ? ev.tags : [];
    return tags.some(
        (t) => Array.isArray(t) && String(t[0]) === TAG_APP && String(t[1]) === TAG_APP_VALUE
    );
}

export const directoryMixin = {
    _buildTreeDirectoryBody(pair, { universeId, title, titles = null, shareCode = '', recommendedRelays = null, description = '', descriptions = null, authorName = '', languages = null, contentKind = null, branchSetHash = null, forkOfUrl = null, icon = null, pow = null }) {
        const relays = Array.isArray(recommendedRelays) ? normalizeNostrRelayUrls(recommendedRelays) : [];
        const desc = truncateUtf8(String(description || '').trim(), 280);
        const author = truncateUtf8(String(authorName || '').trim(), 80);
        const catalogIcon = truncateUtf8(String(icon || '').trim(), 64);
        /* `languages`: list of language codes the published bundle ships. We normalize to
         * ASCII-uppercase, dedupe (keeps insertion order), and cap at 16 entries so a hostile
         * publisher can't bloat the directory payload. Empty arrays are dropped so the field is
         * never an empty `[]` on the wire, verifier matches by string equality only. */
        const normalizedLangs = Array.isArray(languages)
            ? Array.from(
                  new Set(
                      languages
                          .map((c) => String(c || '').trim().toUpperCase())
                          .filter(Boolean)
                  )
              ).slice(0, 16)
            : [];
        const normalizedTitles =
            titles && typeof titles === 'object' && !Array.isArray(titles)
                ? Object.fromEntries(
                      Object.entries(titles)
                          .map(([k, v]) => [
                              String(k || '')
                                  .trim()
                                  .toUpperCase(),
                              truncateUtf8(String(v || '').trim(), 200),
                          ])
                          .filter(([k, v]) => k && v)
                          .slice(0, 16)
                  )
                : {};
        const normalizedDescriptions =
            descriptions && typeof descriptions === 'object' && !Array.isArray(descriptions)
                ? Object.fromEntries(
                      Object.entries(descriptions)
                          .map(([k, v]) => [
                              String(k || '')
                                  .trim()
                                  .toUpperCase(),
                              truncateUtf8(String(v || '').trim(), 280),
                          ])
                          .filter(([k, v]) => k && v)
                          .slice(0, 16)
                  )
                : {};
        return {
            kind: 'tree_directory_v2',
            ownerPub: String(pair.pub),
            universeId: String(universeId),
            title: truncateUtf8(String(title || 'Arborito').trim() || 'Arborito', 200),
            shareCode: String(shareCode || '').trim(),
            ...(author ? { authorName: author } : {}),
            ...(desc ? { description: desc } : {}),
            ...(catalogIcon ? { icon: catalogIcon } : {}),
            ...(Object.keys(normalizedTitles).length ? { titles: normalizedTitles } : {}),
            ...(Object.keys(normalizedDescriptions).length ? { descriptions: normalizedDescriptions } : {}),
            ...(normalizedLangs.length ? { languages: normalizedLangs } : {}),
            ...(contentKind ? { contentKind: String(contentKind) } : {}),
            ...(branchSetHash ? { branchSetHash: String(branchSetHash) } : {}),
            ...(String(forkOfUrl || '').trim() ? { forkOfUrl: String(forkOfUrl).trim() } : {}),
            ...(pow ? { powBits: pow.powBits, powNonce: pow.powNonce } : {}),
            updatedAt: new Date().toISOString(),
            ...(relays.length ? { recommendedRelays: relays } : {})
        };
    },

    async signGlobalTreeDirectoryEntry(
        pair,
        { universeId, title, titles = null, shareCode = '', recommendedRelays = null, description = '', descriptions = null, authorName = '', languages = null, contentKind = null, branchSetHash = null, forkOfUrl = null, icon = null }
    ) {
        /* Every listed row costs CPU: readers (client + Node aggregator)
         * refuse rows without a valid PoW bound to ownerPub/universeId, so a
         * bot cannot flood the public catalog for free. */
        const pow = await this._solvePow(
            'tree_directory_v2',
            pair.pub,
            universeId,
            'directory',
            pair.pub,
            this._powBits('tree_directory_v2')
        );
        const body = this._buildTreeDirectoryBody(pair, {
            universeId,
            title,
            titles,
            shareCode,
            recommendedRelays,
            description,
            descriptions,
            authorName,
            languages,
            contentKind,
            branchSetHash,
            forkOfUrl,
            icon,
            pow,
        });
        const d = directoryDTag(pair.pub, universeId);
        const searchTags = directoryTrigramTagsForRow(body).map((t) => ['t', t]);
        const ev = await this._finalize(pair, {
            kind: KIND_TREE_DIRECTORY,
            tags: [['d', d], arbRootTag(pair.pub, universeId), [TAG_APP, TAG_APP_VALUE], ...searchTags],
            content: JSON.stringify(body)
        });
        return { ...body, by: pair.pub, sig: ev };
    },

    async verifyGlobalTreeDirectoryEntry(record) {
        const ev = record && record.sig && typeof record.sig === 'object' ? record.sig : null;
        return verifyGlobalTreeDirectoryMetaNostr(ev, record);
    },

    async putGlobalTreeDirectoryEntry(opts) {
        const { pair, universeId, title, titles, shareCode, recommendedRelays, description, descriptions, authorName, languages, contentKind, branchSetHash, forkOfUrl, icon } = opts;
        if (!(pair && pair.pub)) return null;
        const rec = await this.signGlobalTreeDirectoryEntry(pair, {
            universeId,
            title,
            titles,
            shareCode,
            recommendedRelays,
            description,
            descriptions,
            authorName,
            languages,
            contentKind,
            branchSetHash,
            forkOfUrl,
            icon,
        });
        await this._publish(rec.sig);
        return rec;
    },

    /** Load the latest signed directory row for one published tree. */
    async loadGlobalTreeDirectoryEntryOnce({ pub, universeId }) {
        const owner = String(pub || '').trim();
        const uid = String(universeId || '').trim();
        if (!owner || !uid) return null;
        const d = directoryDTag(owner, uid);
        const ev = await this._get({ kinds: [KIND_TREE_DIRECTORY], authors: [owner], '#d': [d], limit: 1 }, QUERY_MS);
        if (!ev || String(ev.pubkey) !== owner) return null;
        let body;
        try {
            body = JSON.parse(ev.content || 'null');
        } catch {
            return null;
        }
        return this._directoryRowFromVerifiedEvent(ev, body);
    },

    /**
     * Same `d` tag as `putGlobalTreeDirectoryEntry`: replaces the row so honest clients hide this tree from discovery.
     */
    async putGlobalTreeDirectoryDelist({ pair, universeId }) {
        if (!(pair && pair.pub) || !universeId) return null;
        const body = {
            kind: 'tree_directory_v2',
            ownerPub: String(pair.pub),
            universeId: String(universeId),
            delisted: true,
            updatedAt: new Date().toISOString()
        };
        const d = directoryDTag(pair.pub, universeId);
        const ev = await this._finalize(pair, {
            kind: KIND_TREE_DIRECTORY,
            tags: [['d', d], arbRootTag(pair.pub, universeId), [TAG_APP, TAG_APP_VALUE]],
            content: JSON.stringify(body)
        });
        await this._publish(ev);
        return { ...body, by: pair.pub, sig: ev };
    },

    directoryBumpDTag(ownerPub, universeId) {
        return `arborito:dirbump:${String(ownerPub)}:${String(universeId)}:${Date.now().toString(36)}`;
    },

    async putDirectoryBumpForPublishedTree(pair, universeId) {
        if (!(pair && pair.pub) || !universeId) return null;
        const bumpedAt = new Date().toISOString();
        const payload = {
            kind: 'directory_bump_v1',
            ownerPub: String(pair.pub),
            universeId: String(universeId),
            bumpedAt
        };
        const ev = await this._finalize(pair, {
            kind: KIND_DIRECTORY_BUMP,
            tags: [['d', this.directoryBumpDTag(pair.pub, universeId)], arbRootTag(pair.pub, universeId), [TAG_APP, TAG_APP_VALUE]],
            content: JSON.stringify(payload)
        });
        await this._publish(ev);
        return { ...payload, by: pair.pub, sig: ev };
    },

    async verifyDirectoryBumpRecord(record) {
        const ev = record && record.sig && typeof record.sig === 'object' && record.sig.id ? record.sig : record;
        return verifyDirectoryBumpNostr(ev);
    },

    async verifyDirectoryIndexSnapshot(record) {
        return verifyDirectoryIndexSnapshotNostr(record, {
            trustedPublishers: getConfiguredDirectoryIndexPublishers()
        });
    },

    async loadDirectoryIndexSnapshotOnce(slot) {
        const s = String(slot || '').trim();
        if (s !== 'recent' && s !== 'top') return null;
        const ev = await this._get(
            {
                kinds: [KIND_DIRECTORY_INDEX_SNAPSHOT],
                '#d': [`arborito:diridx:${s}:v1`],
                limit: 5
            },
            6500
        );
        if (!ev) return null;
        try {
            let raw = JSON.parse(ev.content || 'null');
            if (!raw || typeof raw !== 'object') return null;
            const n = Math.max(0, Math.floor(Number(raw.chunkCount)) || 0);
            if (n > 0) {
                const parts = new Array(n);
                await Promise.all(
                    Array.from({ length: n }, async (_, i) => {
                        const pev = await this._get(
                            {
                                kinds: [KIND_DIRECTORY_INDEX_SNAPSHOT],
                                authors: [String(ev.pubkey)],
                                '#d': [directoryIndexChunkDTag(s, i)],
                                limit: 1
                            },
                            6500
                        );
                        if (pev && String(pev.pubkey) === String(ev.pubkey)) {
                            parts[i] = String(pev.content || '');
                        }
                    })
                );
                if (parts.some((p) => p == null)) return null;
                raw = JSON.parse(parts.join(''));
            }
            const rec = { ...raw, by: ev.pubkey, sig: ev };
            const ok = await this.verifyDirectoryIndexSnapshot(rec);
            return ok ? raw : null;
        } catch {
            return null;
        }
    },

    _publishedBundleKeysFromHeaderEvents(evs) {
        /** @type {Set<string>} */
        const keys = new Set();
        for (const ev of evs || []) {
            const arb = (ev.tags || []).find((t) => t && t[0] === 'arb' && t[1] === 'root' && t.length >= 4);
            if (!arb) continue;
            let meta;
            try {
                meta = JSON.parse(ev.content || 'null');
            } catch {
                continue;
            }
            if (!meta || typeof meta !== 'object' || meta.revoked) continue;
            if (!(Math.max(0, Number(meta.chunkCount) || 0) > 0)) continue;
            const ownerPub = String(arb[2] || '').trim();
            const universeId = String(arb[3] || '').trim();
            if (ownerPub && universeId) keys.add(`${ownerPub}/${universeId}`);
        }
        return keys;
    },

    async _filterDirectoryRowsWithPublishedBundle(rows) {
        if (!Array.isArray(rows) || !rows.length) return [];
        const published = await this._publishedBundleKeysCached();
        if (!published.size) return rows;
        const filtered = rows.filter((r) =>
            published.has(`${String(r.ownerPub || '')}/${String(r.universeId || '')}`)
        );
        /* Incomplete relay index must not hide the whole catalog, keep rows when
         * the filter would remove most listings (common on slow / partial relays). */
        if (!filtered.length) return rows;
        if (filtered.length < rows.length * 0.35) return rows;
        return filtered;
    },

    async _publishedBundleKeysCached() {
        const now = Date.now();
        const ttl = 10 * 60 * 1000;
        if (this._bundleKeysCache instanceof Set && now - (this._bundleKeysCacheAt || 0) < ttl) {
            return this._bundleKeysCache;
        }
        const hdrEvs = await this._query({ kinds: [KIND_BUNDLE_HEADER], limit: 400 }, QUERY_MS_LONG);
        this._bundleKeysCache = this._publishedBundleKeysFromHeaderEvents(hdrEvs);
        this._bundleKeysCacheAt = now;
        return this._bundleKeysCache;
    },

    async listGlobalTreeDirectoryEntriesOnce(opts = {}) {
        const limit = Math.max(1, Math.min(800, Number(opts.limit) || 120));
        const q = String(opts.query || '').trim();
        const qLower = q.toLowerCase();
        const indexed = await this._mergeDirectoryRowsFromSnapshots(limit, qLower);
        /** @type {Set<string>} */
        const seen = new Set(indexed.map((r) => directoryRowKey(r.ownerPub, r.universeId)));
        let merged = [...indexed];

        if (q.length >= 3) {
            const tagRows = await this.searchGlobalDirectoryByTrigrams({
                query: q,
                limit,
                excludeKeys: seen,
            });
            for (const r of tagRows) {
                const k = directoryRowKey(r.ownerPub, r.universeId);
                if (!seen.has(k)) {
                    seen.add(k);
                    merged.push(r);
                }
            }
            /* Some relays ignore or fail multi-tag filters (`#t` + `#app`).
             * When trigram search is thin, fall back to the bounded crawl and
             * match titles client-side so listings do not vanish on search. */
            if (merged.length < limit) {
                const need = limit - merged.length;
                const rest = await this._traverseGlobalDirectoryEntries({
                    limit: need,
                    query: q,
                    excludeKeys: seen,
                });
                for (const r of rest) {
                    const k = directoryRowKey(r.ownerPub, r.universeId);
                    if (seen.has(k)) continue;
                    seen.add(k);
                    merged.push(r);
                }
            }
        } else if (merged.length < limit) {
            const need = limit - merged.length;
            const rest = await this._traverseGlobalDirectoryEntries({ limit: need, query: qLower, excludeKeys: seen });
            merged = [...merged, ...rest];
        }

        return merged.slice(0, limit);
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
            const hay = `${title}\n${titlesBlob}\n${description}\n${authorName}`.toLowerCase();
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

    async _traverseGlobalDirectoryEntries(opts) {
        const limit = Math.max(1, Math.min(800, Number(opts.limit) || 120));
        const q = String(opts.query || '').trim().toLowerCase();
        const excludeKeys = opts.excludeKeys instanceof Set ? opts.excludeKeys : new Set();
        const evs = await this._query({ kinds: [KIND_TREE_DIRECTORY], limit: Math.min(200, limit * 2) }, QUERY_MS);
        const out = [];
        const seen = new Set();
        const rows = this._latestTreeDirectoryRowsFromEvents(evs);
        for (const { ev, body } of rows) {
            if (out.length >= limit) break;
            const row = await this._directoryRowFromVerifiedEvent(ev, body);
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
