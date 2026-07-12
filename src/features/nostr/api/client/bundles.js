/**
 * Universe bundle lifecycle: revocation tombstones, multi-chunk bundle
 * publish/load, the per-slot helper chunks (lessons, snapshots, search,
 * forum), and the share-code resolver. The publish path mirrors
 * `prepareNostrSplitBundleV2` chunking, UTF-8-safe slices of the main JSON
 * plus one chunk event per lesson / snapshot / search / forum slot.
 */

import { verifyEvent } from '../../../../../vendor/nostr-tools/lib/esm/index.js';
import { normalizeTreeShareCode } from '../../../sources/api/share-code.js';
import { normalizeNostrRelayUrls } from '../nostr-relays-runtime.js';
import { prepareNostrSplitBundleV2 } from '../nostr-bundle-chunks.js';
import {
    KIND_BUNDLE_CHUNK_JSON,
    KIND_BUNDLE_HEADER,
    KIND_TREE_CODE,
    KIND_UNIVERSE_REVOKE,
    TAG_APP,
    TAG_APP_VALUE,
    arbRootTag,
    bundleHeaderDTag,
    bundleMainChunkDTag,
    revokeDTag,
    treeCodeDTag
} from '../nostr-spec.js';
import { shouldShowMobileUI } from '../../../../shared/ui/breakpoints.js';
import { hasArbRoot, splitUtf8Chunks, tagValue, QUERY_MS_LONG } from './_shared.js';

function nostrBundleLoadTimeouts() {
    const mobile = shouldShowMobileUI();
    return {
        headerMs: mobile ? 8000 : 3500,
        headerRetryMs: mobile ? 10000 : 5000,
        headerFinalMs: mobile ? 12000 : 8000,
        chunkMs: mobile ? 8000 : 3500,
        chunkRetryMs: mobile ? 10000 : 5000,
        chunkFinalMs: mobile ? 12000 : 10000,
    };
}

export const bundlesMixin = {
    async isUniverseRevoked({ pub, universeId }) {
        const rec = await this.loadRevocationRecord({ pub, universeId });
        if (!rec) return false;
        return this.verifyRevocationRecord({ record: rec, expectedPub: pub, universeId });
    },

    async loadRevocationRecord({ pub, universeId }) {
        const d = revokeDTag(pub, universeId);
        const ev = await this._get({ kinds: [KIND_UNIVERSE_REVOKE], authors: [String(pub)], '#d': [d], limit: 1 }, 5000);
        if (!ev) return null;
        try {
            const body = JSON.parse(ev.content || 'null');
            if (!body || typeof body !== 'object') return null;
            return { ...body, by: ev.pubkey, sig: ev };
        } catch {
            return null;
        }
    },

    async verifyRevocationRecord({ record, expectedPub, universeId }) {
        try {
            if (!record || typeof record !== 'object') return false;
            const ev = record.sig && typeof record.sig === 'object' && record.sig.id ? record.sig : null;
            if (!ev || !verifyEvent(ev)) return false;
            const inner = JSON.parse(String(ev.content || 'null'));
            if (!inner || typeof inner !== 'object') return false;
            return (
                String(inner.kind) === 'revoke_universe' &&
                String(inner.universeId) === String(universeId) &&
                String(inner.ownerPub) === String(expectedPub) &&
                String(ev.pubkey) === String(expectedPub) &&
                typeof inner.revokedAt === 'string'
            );
        } catch {
            return false;
        }
    },

    async revokeUniverse({ pair, universeId, reason }) {
        const payload = {
            kind: 'revoke_universe',
            universeId: String(universeId),
            ownerPub: String(pair.pub),
            revokedAt: new Date().toISOString(),
            reason: reason != null && String(reason).trim() ? String(reason).trim() : ''
        };
        const d = revokeDTag(pair.pub, universeId);
        const tomb = await this._finalize(pair, {
            kind: KIND_UNIVERSE_REVOKE,
            tags: [['d', d], arbRootTag(pair.pub, universeId)],
            content: JSON.stringify(payload)
        });
        await this._publish(tomb);
        const hdr = await this._get({
            kinds: [KIND_BUNDLE_HEADER],
            authors: [String(pair.pub)],
            '#d': [bundleHeaderDTag(pair.pub, universeId)],
            limit: 1
        });
        if (hdr) {
            const cleared = await this._finalize(pair, {
                kind: KIND_BUNDLE_HEADER,
                tags: [...(hdr.tags || [])],
                content: JSON.stringify({ revoked: true, updatedAt: new Date().toISOString() })
            });
            await this._publish(cleared);
        }
        return { ...payload, by: pair.pub, sig: tomb };
    },

    async loadNostrUniverseBundle({ pub, universeId }) {
        const revoked = await this.isUniverseRevoked({ pub, universeId });
        if (revoked) return { revoked: true, bundle: null };
        const t = nostrBundleLoadTimeouts();
        const headerFilter = {
            kinds: [KIND_BUNDLE_HEADER],
            authors: [String(pub)],
            '#d': [bundleHeaderDTag(pub, universeId)],
            limit: 1
        };
        let hdr = await this._getFast(headerFilter, t.headerMs);
        if (!hdr) {
            this._unpauseAllRelaysIfAllCoolingDown();
            hdr = await this._get(headerFilter, t.headerRetryMs);
        }
        if (!hdr) {
            this._unpauseAllRelaysIfAllCoolingDown();
            hdr = await this._get(headerFilter, t.headerFinalMs);
        }
        if (!hdr) return { revoked: false, bundle: null };
        /* The pool already verified the signature; bind the author explicitly so
         * a hostile relay cannot answer our `authors:[pub]` filter with a
         * validly-signed header from a different key. */
        if (String(hdr.pubkey) !== String(pub)) return { revoked: false, bundle: null };
        let meta;
        try {
            meta = JSON.parse(hdr.content || 'null');
        } catch {
            return { revoked: false, bundle: null };
        }
        if (meta && meta.revoked) return { revoked: true, bundle: null };
        const n = Math.max(0, Number(meta.chunkCount) || 0);
        if (!n) return { revoked: false, bundle: null };

        const cacheKey = `${String(pub)}:${String(universeId)}`;
        const cacheStamp = `${hdr.id}:${String(meta?.updatedAt || '')}`;
        if (
            this._bundleLoadCache &&
            this._bundleLoadCache.key === cacheKey &&
            this._bundleLoadCache.stamp === cacheStamp &&
            this._bundleLoadCache.bundle
        ) {
            return { revoked: false, bundle: this._bundleLoadCache.bundle };
        }

        const since = Math.max(0, Math.floor(Date.now() / 1000) - 120);

        const collectParts = async (ms) => {
            const fastMs = Math.min(ms, 3000);
            const parts = new Array(n);
            const missing = [];
            const dHits = await Promise.all(
                Array.from({ length: n }, async (_, idx) => {
                    const d = bundleMainChunkDTag(pub, universeId, idx);
                    const ev = await this._getFast(
                        {
                            kinds: [KIND_BUNDLE_CHUNK_JSON],
                            authors: [String(pub)],
                            '#d': [d],
                            limit: 1,
                            since
                        },
                        fastMs
                    );
                    return { idx, ev };
                })
            );
            for (const { idx, ev } of dHits) {
                if (!ev || String(ev.pubkey) !== String(pub)) continue;
                if (!hasArbRoot(ev, pub, universeId)) continue;
                parts[idx] = String(ev.content || '');
            }
            for (let i = 0; i < n; i++) {
                if (parts[i] == null) missing.push(i);
            }
            if (!missing.length) return parts;

            const chunkEvs = await this._queryFast(
                {
                    kinds: [KIND_BUNDLE_CHUNK_JSON],
                    authors: [String(pub)],
                    '#e': [hdr.id],
                    limit: Math.min(8000, n + 50),
                    since
                },
                fastMs
            );
            for (const ev of chunkEvs) {
                if (String(ev.pubkey) !== String(pub)) continue;
                if (!hasArbRoot(ev, pub, universeId)) continue;
                const idx = Number(tagValue(ev, 'i'));
                if (!Number.isFinite(idx) || idx < 0 || idx >= n) continue;
                parts[idx] = String(ev.content || '');
            }
            for (let i = 0; i < n; i++) {
                if (parts[i] != null) continue;
                const d = bundleMainChunkDTag(pub, universeId, i);
                const ev = await this._get(
                    { kinds: [KIND_BUNDLE_CHUNK_JSON], authors: [String(pub)], '#d': [d], limit: 1, since },
                    ms
                );
                if (!ev || String(ev.pubkey) !== String(pub)) continue;
                if (!hasArbRoot(ev, pub, universeId)) continue;
                parts[i] = String(ev.content || '');
            }
            return parts;
        };

        let parts = await collectParts(t.chunkMs);
        if (parts.some((p) => p == null)) {
            this._unpauseAllRelaysIfAllCoolingDown();
            const again = await collectParts(t.chunkRetryMs);
            for (let i = 0; i < n; i++) {
                if (parts[i] == null && again[i] != null) parts[i] = again[i];
            }
        }
        if (parts.some((p) => p == null)) {
            this._unpauseAllRelaysIfAllCoolingDown();
            const final = await collectParts(t.chunkFinalMs);
            for (let i = 0; i < n; i++) {
                if (parts[i] == null && final[i] != null) parts[i] = final[i];
            }
        }
        if (parts.some((p) => p == null)) return { revoked: false, bundle: null };
        let bundle;
        try {
            bundle = JSON.parse(parts.join(''));
        } catch {
            return { revoked: false, bundle: null };
        }
        if (bundle && typeof bundle === 'object') {
            bundle.meta = bundle.meta && typeof bundle.meta === 'object' ? bundle.meta : {};
            const hdrCode = String(meta?.shareCode || '').trim();
            if (hdrCode && !String(bundle.meta.shareCode || '').trim()) {
                bundle.meta.shareCode = hdrCode;
            }
            this._bundleLoadCache = { key: cacheKey, stamp: cacheStamp, bundle };
        }
        return { revoked: false, bundle: bundle && typeof bundle === 'object' ? bundle : null };
    },

    async loadNostrLessonChunk({ pub, universeId, contentKey }) {
        const d = `arborito:lesson:${String(pub)}:${String(universeId)}:${String(contentKey || '').trim()}`;
        const ev = await this._get({ kinds: [KIND_BUNDLE_CHUNK_JSON], authors: [String(pub)], '#d': [d], limit: 1 }, 10000);
        if (!ev || String(ev.pubkey) !== String(pub)) return null;
        try {
            return JSON.parse(ev.content || 'null');
        } catch {
            return null;
        }
    },

    async loadNostrSnapshotChunk({ pub, universeId, snapshotKey }) {
        const d = `arborito:snap:${String(pub)}:${String(universeId)}:${String(snapshotKey || '').trim()}`;
        const ev = await this._get({ kinds: [KIND_BUNDLE_CHUNK_JSON], authors: [String(pub)], '#d': [d], limit: 1 }, 10000);
        if (!ev || String(ev.pubkey) !== String(pub)) return null;
        try {
            return JSON.parse(ev.content || 'null');
        } catch {
            return null;
        }
    },

    async loadNostrSearchPack({ pub, universeId }) {
        const d = `arborito:search:${String(pub)}:${String(universeId)}`;
        const ev = await this._get({ kinds: [KIND_BUNDLE_CHUNK_JSON], authors: [String(pub)], '#d': [d], limit: 1 }, 10000);
        if (!ev || String(ev.pubkey) !== String(pub)) return { version: 1, entries: [] };
        try {
            const raw = JSON.parse(ev.content || 'null');
            if (raw && Array.isArray(raw.entries)) return raw;
            const arr = JSON.parse(String(raw?.entriesJson || '[]'));
            return { version: 1, entries: Array.isArray(arr) ? arr : [] };
        } catch {
            return { version: 1, entries: [] };
        }
    },

    async loadNostrForumPack({ pub, universeId }) {
        const d = `arborito:forum:${String(pub)}:${String(universeId)}`;
        const ev = await this._get({ kinds: [KIND_BUNDLE_CHUNK_JSON], authors: [String(pub)], '#d': [d], limit: 1 }, 10000);
        if (!ev || String(ev.pubkey) !== String(pub)) return { version: 1, threads: [], messages: [], moderationLog: [] };
        try {
            return JSON.parse(ev.content || 'null');
        } catch {
            return { version: 1, threads: [], messages: [], moderationLog: [] };
        }
    },

    async loadBundle({ pub, universeId }) {
        const r = await this.loadNostrUniverseBundle({ pub, universeId });
        if (r.revoked) return null;
        return r.bundle;
    },

    async publishBundle({ pair, universeId, bundle, includeForum = true } = {}) {
        this._bundlePublishRelay = null;
        const { slimBundle, lessonChunks, snapshotChunks, searchPack, forumSplit } = prepareNostrSplitBundleV2(
            bundle,
            { includeForum: includeForum !== false }
        );
        const mainJson = JSON.stringify(slimBundle);
        const parts = splitUtf8Chunks(mainJson);
        const meta = {
            v: 3,
            chunkCount: parts.length,
            title: ((slimBundle && slimBundle.meta) ? slimBundle.meta.title : undefined) || 'Arborito',
            updatedAt: new Date().toISOString(),
            format: (slimBundle && slimBundle.format) || 'arborito-bundle',
            shareCode: ((slimBundle && slimBundle.meta) ? slimBundle.meta.shareCode : undefined) || null
        };
        const headerEv = this._finalize(pair, {
            kind: KIND_BUNDLE_HEADER,
            created_at: Math.floor(Date.now() / 1000),
            tags: [['d', bundleHeaderDTag(pair.pub, universeId)], arbRootTag(pair.pub, universeId), [TAG_APP, TAG_APP_VALUE]],
            content: JSON.stringify(meta)
        });
        await this._publish(headerEv);
        const mainChunkEvents = parts.map((content, i) =>
            this._finalize(pair, {
                kind: KIND_BUNDLE_CHUNK_JSON,
                created_at: Math.floor(Date.now() / 1000),
                tags: [
                    ['d', bundleMainChunkDTag(pair.pub, universeId, i)],
                    ['e', headerEv.id, '', 'root'],
                    ['i', String(i)],
                    ['n', String(parts.length)],
                    arbRootTag(pair.pub, universeId)
                ],
                content
            })
        );
        await this._publishBurst(mainChunkEvents, 5);

        const makeJsonChunkEvent = (slot, key, obj) => {
            const d = `arborito:${slot}:${String(pair.pub)}:${String(universeId)}:${String(key)}`;
            let text;
            try {
                text = JSON.stringify(obj != null ? obj : {});
            } catch (e) {
                throw new Error(`Nostr bundle chunk JSON failed (${slot}/${key}): ${String((e && e.message) || e)}`);
            }
            if (typeof text !== 'string') {
                throw new Error(`Nostr bundle chunk stringify produced non-string (${slot}/${key})`);
            }
            return this._finalize(pair, {
                kind: KIND_BUNDLE_CHUNK_JSON,
                created_at: Math.floor(Date.now() / 1000),
                tags: [['d', d], arbRootTag(pair.pub, universeId), ['slot', slot]],
                content: text
            });
        };

        const lessonEvents = Object.keys(lessonChunks).map((key) =>
            makeJsonChunkEvent('lesson', key, lessonChunks[key])
        );
        if (lessonEvents.length) await this._publishBurst(lessonEvents, 5);

        const snapEvents = Object.keys(snapshotChunks).map((sk2) =>
            makeJsonChunkEvent('snap', sk2, snapshotChunks[sk2])
        );
        if (snapEvents.length) await this._publishBurst(snapEvents, 5);

        const entries = searchPack && typeof searchPack === 'object' && Array.isArray(searchPack.entries) ? searchPack.entries : [];
        await this._publish(makeJsonChunkEvent('search', 'v1', { version: 1, entriesJson: JSON.stringify(entries) }));
        if (includeForum !== false) {
            const forumPayload = {
                version: 1,
                threads: forumSplit?.threads || [],
                messages: (forumSplit?.messageParts || []).flat(),
                moderationLog: forumSplit?.moderationLog || []
            };
            await this._publish(makeJsonChunkEvent('forum', 'v1', forumPayload));
        }
        return { pub: pair.pub, universeId };
    },

    async signTreeCodeClaim(pair, code, universeId, recommendedRelays = null) {
        const relays = Array.isArray(recommendedRelays) ? normalizeNostrRelayUrls(recommendedRelays) : [];
        const payload = {
            kind: 'tree_code',
            code: String(code),
            universeId: String(universeId),
            ownerPub: String(pair.pub),
            at: new Date().toISOString(),
            ...(relays.length ? { recommendedRelays: relays } : {})
        };
        const norm = normalizeTreeShareCode(code);
        const ev = await this._finalize(pair, {
            kind: KIND_TREE_CODE,
            tags: [['d', treeCodeDTag(norm || String(code))], [TAG_APP, TAG_APP_VALUE]],
            content: JSON.stringify(payload)
        });
        return { ...payload, by: pair.pub, sig: ev };
    },

    async verifyTreeCodeClaim(record) {
        const ev = record && record.sig && typeof record.sig === 'object' && record.sig.id ? record.sig : null;
        if (!ev || !verifyEvent(ev)) return false;
        let v;
        try {
            v = JSON.parse(String(ev.content || 'null'));
        } catch {
            return false;
        }
        return (
            !!v &&
            String(v.kind) === 'tree_code' &&
            String(v.ownerPub) === String(ev.pubkey) &&
            String(v.code) === String(record.code != null ? record.code : v.code) &&
            String(v.universeId) === String(record.universeId != null ? record.universeId : v.universeId)
        );
    },

    async loadCodeRecordOnce(code) {
        const norm = normalizeTreeShareCode(code);
        if (!norm) return null;
        const d = treeCodeDTag(norm);
        const ev = await this._get({ kinds: [KIND_TREE_CODE], '#d': [d], limit: 5 }, 6000);
        if (!ev) return null;
        try {
            const body = JSON.parse(ev.content || 'null');
            if (!body || typeof body !== 'object') return null;
            return { ...body, by: ev.pubkey, sig: ev };
        } catch {
            return null;
        }
    },

    /** Reverse lookup: find share code claim for a published universe (first publish only). */
    async loadTreeShareCodeForUniverse({ pub, universeId }) {
        const owner = String(pub || '').trim();
        const uid = String(universeId || '').trim();
        if (!owner || !uid) return null;
        const evs = await this._query({ kinds: [KIND_TREE_CODE], authors: [owner], limit: 80 }, 8000);
        for (const ev of evs) {
            if (String(ev.pubkey) !== owner) continue;
            let body;
            try {
                body = JSON.parse(ev.content || 'null');
            } catch {
                continue;
            }
            if (!body || typeof body !== 'object') continue;
            if (String(body.universeId || '') !== uid) continue;
            const code = String(body.code || '').trim();
            if (!code) continue;
            if (!(await this.verifyTreeCodeClaim({ ...body, sig: ev }))) continue;
            return normalizeTreeShareCode(code) || code;
        }
        return null;
    },

    async resolveTreeShareCode(input) {
        const norm = normalizeTreeShareCode(input);
        if (!norm) return null;
        const raw = await this.loadCodeRecordOnce(norm);
        if (!raw || !(await this.verifyTreeCodeClaim(raw))) return null;
        const relays = Array.isArray(raw.recommendedRelays) ? normalizeNostrRelayUrls(raw.recommendedRelays) : [];
        return { pub: String(raw.ownerPub || raw.by), universeId: String(raw.universeId), recommendedRelays: relays };
    },

    async putTreeCodeClaim({ pair, code, universeId, recommendedRelays = null }) {
        const rec = await this.signTreeCodeClaim(pair, code, universeId, recommendedRelays);
        await this._publish(rec.sig);
        return rec;
    }
};
