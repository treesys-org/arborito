/**
 * Global tree directory: publishing per-universe entries, verifying them
 * against the signed `tree_directory_v2` payload, and loading snapshot /
 * bump records. Live crawl + Discover merge live in `directory-list.js`.
 */

import {
    getConfiguredDirectoryIndexPublishers,
} from '../../../p2p-webtorrent/api/directory-index-config.js';
import {
    directoryTrigramTagsForRow,
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

    /**
     * Newest bundle header per universe wins across lagging relays.
     * An older live header must not keep a revoked playlist/course “published”.
     * @returns {{ live: Set<string>, known: Set<string> }}
     */
    _publishedBundleStateFromHeaderEvents(evs) {
        /** @type {Map<string, { rank: string, live: boolean }>} */
        const best = new Map();
        for (const ev of evs || []) {
            const arb = (ev.tags || []).find((t) => t && t[0] === 'arb' && t[1] === 'root' && t.length >= 4);
            if (!arb) continue;
            let meta;
            try {
                meta = JSON.parse(ev.content || 'null');
            } catch {
                continue;
            }
            if (!meta || typeof meta !== 'object') continue;
            const ownerPub = String(arb[2] || '').trim();
            const universeId = String(arb[3] || '').trim();
            if (!ownerPub || !universeId) continue;
            const key = `${ownerPub}/${universeId}`;
            const updated = String(meta.updatedAt || '').trim();
            const created = String(Math.max(0, Number(ev.created_at) || 0)).padStart(16, '0');
            const rank = `${updated}\0${created}\0${String(ev.id || '')}`;
            const prev = best.get(key);
            if (prev && rank <= prev.rank) continue;
            const live =
                !meta.revoked && Math.max(0, Number(meta.chunkCount) || 0) > 0;
            best.set(key, { rank, live });
        }
        /** @type {Set<string>} */
        const live = new Set();
        /** @type {Set<string>} */
        const known = new Set();
        for (const [key, state] of best) {
            known.add(key);
            if (state.live) live.add(key);
        }
        return { live, known };
    },

    _publishedBundleKeysFromHeaderEvents(evs) {
        return this._publishedBundleStateFromHeaderEvents(evs).live;
    },

    async _filterDirectoryRowsWithPublishedBundle(rows) {
        if (!Array.isArray(rows) || !rows.length) return [];
        const { live, known } = await this._publishedBundleStateCached();
        /* No header intel → keep catalog (slow / empty relays). At scale the
         * header sample is tiny vs millions of listings — unknown must stay. */
        if (!known.size) return rows;
        return rows.filter((r) => {
            const k = `${String(r.ownerPub || '')}/${String(r.universeId || '')}`;
            if (!known.has(k)) return true;
            /* Newest header is revoked / empty → drop (dead playlist or course). */
            return live.has(k);
        });
    },

    async _publishedBundleStateCached() {
        const now = Date.now();
        const ttl = 10 * 60 * 1000;
        if (
            this._bundleStateCache?.live instanceof Set &&
            this._bundleStateCache?.known instanceof Set &&
            now - (this._bundleKeysCacheAt || 0) < ttl
        ) {
            return this._bundleStateCache;
        }
        const hdrEvs = await this._query({ kinds: [KIND_BUNDLE_HEADER], limit: 400 }, QUERY_MS_LONG);
        this._bundleStateCache = this._publishedBundleStateFromHeaderEvents(hdrEvs);
        this._bundleKeysCache = this._bundleStateCache.live;
        this._bundleKeysCacheAt = now;
        return this._bundleStateCache;
    },

    async _publishedBundleKeysCached() {
        const state = await this._publishedBundleStateCached();
        return state.live;
    },

    /** True when the newest known bundle header for this listing is revoked/empty. */
    _isKnownDeadDirectoryKey(ownerPub, universeId) {
        const key = `${String(ownerPub || '').trim()}/${String(universeId || '').trim()}`;
        if (!key || key === '/') return false;
        const cache = this._bundleStateCache;
        if (!(cache?.known instanceof Set) || !cache.known.size) return false;
        return cache.known.has(key) && !(cache.live instanceof Set && cache.live.has(key));
    }
};
