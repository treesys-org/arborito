/**
 * Universe bundle lifecycle: revocation tombstones, multi-chunk bundle
 * publish/load, the per-slot helper chunks (lessons, snapshots, search,
 * forum), and the share-code resolver. The publish path mirrors
 * `prepareNostrSplitBundleV2` chunking — UTF-8-safe slices of the main JSON
 * plus one chunk event per lesson / snapshot / search / forum slot.
 */

import { verifyEvent } from '../../../../vendor/nostr-tools/lib/esm/index.js';
import { normalizeTreeShareCode } from '../../sources/share-code.js';
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
    revokeDTag,
    treeCodeDTag
} from '../nostr-spec.js';
import { hasArbRoot, splitUtf8Chunks, tagValue, QUERY_MS_LONG } from './_shared.js';

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
        const hdr = await this._get(
            {
                kinds: [KIND_BUNDLE_HEADER],
                authors: [String(pub)],
                '#d': [bundleHeaderDTag(pub, universeId)],
                limit: 1
            },
            12000
        );
        if (!hdr) return { revoked: false, bundle: null };
        let meta;
        try {
            meta = JSON.parse(hdr.content || 'null');
        } catch {
            return { revoked: false, bundle: null };
        }
        if (meta && meta.revoked) return { revoked: true, bundle: null };
        const n = Math.max(0, Number(meta.chunkCount) || 0);
        if (!n) return { revoked: false, bundle: null };

        const collectParts = async (ms) => {
            const chunkEvs = await this._query(
                {
                    kinds: [KIND_BUNDLE_CHUNK_JSON],
                    authors: [String(pub)],
                    '#e': [hdr.id],
                    limit: Math.min(8000, n + 50)
                },
                ms
            );
            const parts = new Array(n);
            for (const ev of chunkEvs) {
                if (!hasArbRoot(ev, pub, universeId)) continue;
                const idx = Number(tagValue(ev, 'i'));
                if (!Number.isFinite(idx) || idx < 0 || idx >= n) continue;
                parts[idx] = String(ev.content || '');
            }
            return parts;
        };

        let parts = await collectParts(QUERY_MS_LONG);
        if (parts.some((p) => p == null)) {
            const again = await collectParts(Math.min(45000, QUERY_MS_LONG * 2 + 8000));
            for (let i = 0; i < n; i++) {
                if (parts[i] == null && again[i] != null) parts[i] = again[i];
            }
        }
        if (parts.some((p) => p == null)) return { revoked: false, bundle: null };
        let bundle;
        try {
            bundle = JSON.parse(parts.join(''));
        } catch {
            return { revoked: false, bundle: null };
        }
        return { revoked: false, bundle: bundle && typeof bundle === 'object' ? bundle : null };
    },

    async loadNostrLessonChunk({ pub, universeId, contentKey }) {
        const d = `arborito:lesson:${String(pub)}:${String(universeId)}:${String(contentKey || '').trim()}`;
        const ev = await this._get({ kinds: [KIND_BUNDLE_CHUNK_JSON], authors: [String(pub)], '#d': [d], limit: 1 }, 12000);
        if (!ev) return null;
        try {
            return JSON.parse(ev.content || 'null');
        } catch {
            return null;
        }
    },

    async loadNostrSnapshotChunk({ pub, universeId, snapshotKey }) {
        const d = `arborito:snap:${String(pub)}:${String(universeId)}:${String(snapshotKey || '').trim()}`;
        const ev = await this._get({ kinds: [KIND_BUNDLE_CHUNK_JSON], authors: [String(pub)], '#d': [d], limit: 1 }, 15000);
        if (!ev) return null;
        try {
            return JSON.parse(ev.content || 'null');
        } catch {
            return null;
        }
    },

    async loadNostrSearchPack({ pub, universeId }) {
        const d = `arborito:search:${String(pub)}:${String(universeId)}`;
        const ev = await this._get({ kinds: [KIND_BUNDLE_CHUNK_JSON], authors: [String(pub)], '#d': [d], limit: 1 }, 20000);
        if (!ev) return { version: 1, entries: [] };
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
        const ev = await this._get({ kinds: [KIND_BUNDLE_CHUNK_JSON], authors: [String(pub)], '#d': [d], limit: 1 }, 12000);
        if (!ev) return { version: 1, threads: [], messages: [], moderationLog: [] };
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

    async publishBundle({ pair, universeId, bundle }) {
        const { slimBundle, lessonChunks, snapshotChunks, searchPack, forumSplit } = prepareNostrSplitBundleV2(bundle);
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
        for (let i = 0; i < parts.length; i++) {
            const ev = this._finalize(pair, {
                kind: KIND_BUNDLE_CHUNK_JSON,
                created_at: Math.floor(Date.now() / 1000),
                tags: [
                    ['e', headerEv.id, '', 'root'],
                    ['i', String(i)],
                    ['n', String(parts.length)],
                    arbRootTag(pair.pub, universeId)
                ],
                content: parts[i]
            });
            await this._publish(ev);
        }
        const putJsonChunk = async (slot, key, obj) => {
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
            const ev = this._finalize(pair, {
                kind: KIND_BUNDLE_CHUNK_JSON,
                created_at: Math.floor(Date.now() / 1000),
                tags: [['d', d], arbRootTag(pair.pub, universeId), ['slot', slot]],
                content: text
            });
            await this._publish(ev);
        };
        for (const key of Object.keys(lessonChunks)) {
            await putJsonChunk('lesson', key, lessonChunks[key]);
        }
        for (const sk2 of Object.keys(snapshotChunks)) {
            await putJsonChunk('snap', sk2, snapshotChunks[sk2]);
        }
        const entries = searchPack && typeof searchPack === 'object' && Array.isArray(searchPack.entries) ? searchPack.entries : [];
        await putJsonChunk('search', 'v1', { version: 1, entriesJson: JSON.stringify(entries) });
        const forumPayload = {
            version: 1,
            threads: forumSplit?.threads || [],
            messages: (forumSplit?.messageParts || []).flat(),
            moderationLog: forumSplit?.moderationLog || []
        };
        await putJsonChunk('forum', 'v1', forumPayload);
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
