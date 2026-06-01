/**
 * Global tree directory: publishing per-universe entries, verifying them
 * against the signed `tree_directory_v2` payload, building/merging the
 * snapshot + bump records, and walking the live event stream for clients
 * that haven't consumed a snapshot yet.
 */

import { DIRECTORY_INDEX_TRUSTED_PUBLISHERS } from '../../p2p-webtorrent/directory-index-config.js';
import {
    verifyDirectoryBumpNostr,
    verifyDirectoryIndexSnapshotNostr,
    verifyGlobalTreeDirectoryMetaNostr
} from '../../p2p-webtorrent/directory-index-shared.js';
import { normalizeNostrRelayUrls } from '../nostr-relays-runtime.js';
import {
    KIND_DIRECTORY_BUMP,
    KIND_DIRECTORY_INDEX_SNAPSHOT,
    KIND_TREE_DIRECTORY,
    TAG_APP,
    TAG_APP_VALUE,
    arbRootTag,
    directoryDTag
} from '../nostr-spec.js';
import { QUERY_MS_LONG } from './_shared.js';

export const directoryMixin = {
    _buildTreeDirectoryBody(pair, { universeId, title, shareCode = '', recommendedRelays = null, description = '', authorName = '', languages = null }) {
        const relays = Array.isArray(recommendedRelays) ? normalizeNostrRelayUrls(recommendedRelays) : [];
        const desc = String(description || '').trim().slice(0, 280);
        const author = String(authorName || '').trim().slice(0, 80);
        /* `languages`: list of language codes the published bundle ships. We normalize to
         * ASCII-uppercase, dedupe (keeps insertion order), and cap at 16 entries so a hostile
         * publisher can't bloat the directory payload. Empty arrays are dropped so the field is
         * never an empty `[]` on the wire — verifier matches by string equality only. */
        const normalizedLangs = Array.isArray(languages)
            ? Array.from(
                  new Set(
                      languages
                          .map((c) => String(c || '').trim().toUpperCase())
                          .filter(Boolean)
                  )
              ).slice(0, 16)
            : [];
        return {
            kind: 'tree_directory_v2',
            ownerPub: String(pair.pub),
            universeId: String(universeId),
            title: String(title || 'Arborito').trim() || 'Arborito',
            shareCode: String(shareCode || '').trim(),
            ...(author ? { authorName: author } : {}),
            ...(desc ? { description: desc } : {}),
            ...(normalizedLangs.length ? { languages: normalizedLangs } : {}),
            updatedAt: new Date().toISOString(),
            ...(relays.length ? { recommendedRelays: relays } : {})
        };
    },

    async signGlobalTreeDirectoryEntry(
        pair,
        { universeId, title, shareCode = '', recommendedRelays = null, description = '', authorName = '', languages = null }
    ) {
        const body = this._buildTreeDirectoryBody(pair, {
            universeId,
            title,
            shareCode,
            recommendedRelays,
            description,
            authorName,
            languages
        });
        const d = directoryDTag(pair.pub, universeId);
        const ev = await this._finalize(pair, {
            kind: KIND_TREE_DIRECTORY,
            tags: [['d', d], arbRootTag(pair.pub, universeId), [TAG_APP, TAG_APP_VALUE]],
            content: JSON.stringify(body)
        });
        return { ...body, by: pair.pub, sig: ev };
    },

    async verifyGlobalTreeDirectoryEntry(record) {
        const ev = record && record.sig && typeof record.sig === 'object' ? record.sig : null;
        return verifyGlobalTreeDirectoryMetaNostr(ev, record);
    },

    async putGlobalTreeDirectoryEntry(opts) {
        const { pair, universeId, title, shareCode, recommendedRelays, description, authorName, languages } = opts;
        if (!(pair && pair.pub)) return null;
        const rec = await this.signGlobalTreeDirectoryEntry(pair, {
            universeId,
            title,
            shareCode,
            recommendedRelays,
            description,
            authorName,
            languages
        });
        await this._publish(rec.sig);
        return rec;
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
            tags: [['d', this.directoryBumpDTag(pair.pub, universeId)], arbRootTag(pair.pub, universeId)],
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
            trustedPublishers: DIRECTORY_INDEX_TRUSTED_PUBLISHERS
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
            const raw = JSON.parse(ev.content || 'null');
            const rec = { ...raw, by: ev.pubkey, sig: ev };
            const ok = await this.verifyDirectoryIndexSnapshot(rec);
            return ok ? raw : null;
        } catch {
            return null;
        }
    },

    async listGlobalTreeDirectoryEntriesOnce(opts = {}) {
        const limit = Math.max(1, Math.min(800, Number(opts.limit) || 120));
        const q = String(opts.query || '').trim().toLowerCase();
        const indexed = await this._mergeDirectoryRowsFromSnapshots(limit, q);
        if (indexed.length >= limit) return indexed.slice(0, limit);
        const need = limit - indexed.length;
        const seen = new Set(indexed.map((r) => `${r.ownerPub}/${r.universeId}`));
        const rest = await this._traverseGlobalDirectoryEntries({ limit: need, query: q, excludeKeys: seen });
        return [...indexed, ...rest].slice(0, limit);
    },

    async _mergeDirectoryRowsFromSnapshots(limit, qRaw) {
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
            const description = String(meta.description || '').trim();
            const authorName = String(meta.authorName || '').trim();
            const hay = `${title}\n${description}\n${authorName}`.toLowerCase();
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
            rows.push({
                ownerPub,
                universeId,
                title: String(meta.title || '').trim(),
                shareCode: String(meta.shareCode || ''),
                updatedAt: String(meta.updatedAt || ''),
                description: String(meta.description || ''),
                authorName: String(meta.authorName || ''),
                ...(snapLangs.length ? { languages: snapLangs } : {}),
                ...(snapRelays.length ? { recommendedRelays: snapRelays } : {})
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
        /** @type {Map<string, { ev: import('../../../../vendor/nostr-tools/lib/types/core.js').Event, body: object }>} */
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
        const evs = await this._query({ kinds: [KIND_TREE_DIRECTORY], limit: 800 }, QUERY_MS_LONG);
        const out = [];
        const seen = new Set();
        const rows = this._latestTreeDirectoryRowsFromEvents(evs);
        for (const { ev, body } of rows) {
            if (out.length >= limit) break;
            if (!(await verifyGlobalTreeDirectoryMetaNostr(ev, body))) continue;
            if (body.delisted === true) continue;
            const ownerPub = String(body.ownerPub || '');
            const universeId = String(body.universeId || '');
            const key = `${ownerPub}/${universeId}`;
            if (!ownerPub || !universeId || excludeKeys.has(key) || seen.has(key)) continue;
            if (q) {
                const title = String(body.title || '').trim();
                const description = String(body.description || '').trim();
                const authorName = String(body.authorName || '').trim();
                const hay = `${title}\n${description}\n${authorName}`.toLowerCase();
                if (!hay.includes(q)) continue;
            }
            seen.add(key);
            const relays = Array.isArray(body.recommendedRelays) ? normalizeNostrRelayUrls(body.recommendedRelays) : [];
            const bodyLangs = Array.isArray(body.languages)
                ? body.languages.map((c) => String(c || '').trim().toUpperCase()).filter(Boolean)
                : [];
            out.push({
                ownerPub,
                universeId,
                title: String(body.title || '').trim(),
                shareCode: String(body.shareCode || ''),
                updatedAt: String(body.updatedAt || ''),
                description: String(body.description || ''),
                authorName: String(body.authorName || ''),
                ...(bodyLangs.length ? { languages: bodyLangs } : {}),
                ...(relays.length ? { recommendedRelays: relays } : {})
            });
        }
        return out;
    }
};
