/**
 * Share-code claims (NIP-33 replaceable): sign, verify, resolve, put, revoke.
 * Lives beside `bundlesMixin` so universe publish/load stay under the line budget.
 */

import { verifyEvent } from '../../../../../vendor/nostr-tools/lib/esm/index.js';
import { normalizeTreeShareCode } from '../../../sources/api/share-code.js';
import { normalizeNostrRelayUrls } from '../nostr-relays-runtime.js';
import { KIND_BUNDLE_HEADER, KIND_TREE_CODE, TAG_APP, TAG_APP_VALUE, bundleHeaderDTag, treeCodeDTag } from '../nostr-spec.js';

export const bundleShareCodesMixin = {
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
        if (!v || String(v.kind) !== 'tree_code') return false;
        if (v.revoked) return false;
        return (
            String(v.ownerPub) === String(ev.pubkey) &&
            String(v.code) === String(record.code != null ? record.code : v.code) &&
            String(v.universeId) === String(record.universeId != null ? record.universeId : v.universeId) &&
            String(v.universeId).trim() !== ''
        );
    },

    async loadCodeRecordOnce(code) {
        const norm = normalizeTreeShareCode(code);
        if (!norm) return null;
        const d = treeCodeDTag(norm);
        /* NIP-33 is per-author. First writer owns the code for life: if that
         * author's newest event is a revoke (or gone), the code stays dead —
         * later authors must not inherit it after the owner retracts. */
        const evs = await this._query({ kinds: [KIND_TREE_CODE], '#d': [d], limit: 40 }, 8000);
        const newestByAuthor = new Map();
        let firstAuthor = null;
        let firstAt = Infinity;
        for (const ev of evs || []) {
            const pk = String(ev.pubkey || '');
            if (!pk) continue;
            const prev = newestByAuthor.get(pk);
            if (!prev || (Number(ev.created_at) || 0) > (Number(prev.created_at) || 0)) {
                newestByAuthor.set(pk, ev);
            }
            let body;
            try {
                body = JSON.parse(ev.content || 'null');
            } catch {
                continue;
            }
            if (!body || typeof body !== 'object') continue;
            if (String(body.kind) !== 'tree_code') continue;
            if (String(body.ownerPub || '') !== pk) continue;
            if (normalizeTreeShareCode(body.code) !== norm && String(body.code || '') !== String(code)) {
                continue;
            }
            const at = Number(ev.created_at) || 0;
            if (at < firstAt) {
                firstAt = at;
                firstAuthor = pk;
            }
        }
        if (!firstAuthor) return null;
        const ev = newestByAuthor.get(firstAuthor);
        if (!ev) return null;
        let body;
        try {
            body = JSON.parse(ev.content || 'null');
        } catch {
            return null;
        }
        if (!body || typeof body !== 'object' || body.revoked) return null;
        const rec = { ...body, by: ev.pubkey, sig: ev };
        if (!(await this.verifyTreeCodeClaim(rec))) return null;
        return rec;
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
            if (body.revoked) continue;
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
        if (!raw || raw.revoked || !(await this.verifyTreeCodeClaim(raw))) return null;
        const owner = String(raw.ownerPub || raw.by || '');
        const universeId = String(raw.universeId || '');
        if (!owner || !universeId) return null;
        try {
            if (await this.isUniverseRevoked({ pub: owner, universeId })) return null;
        } catch {
            /* soft-fail on revoke query errors — still probe the newest header below */
        }
        /* Playlist/course may keep a live tree_code claim after revoke when the
         * share-code tombstone failed; newest bundle header is the content truth. */
        try {
            const d = bundleHeaderDTag(owner, universeId);
            const hdrEvs = await this._query(
                { kinds: [KIND_BUNDLE_HEADER], authors: [owner], '#d': [d], limit: 8 },
                5000
            );
            let best = null;
            let bestKey = '';
            for (const ev of hdrEvs || []) {
                if (!ev || String(ev.pubkey) !== owner) continue;
                let updated = '';
                try {
                    updated = String(JSON.parse(ev.content || 'null')?.updatedAt || '').trim();
                } catch {
                    updated = '';
                }
                const created = String(Math.max(0, Number(ev.created_at) || 0)).padStart(16, '0');
                const key = `${updated}\0${created}\0${String(ev.id || '')}`;
                if (!best || key > bestKey) {
                    best = ev;
                    bestKey = key;
                }
            }
            if (best) {
                let meta;
                try {
                    meta = JSON.parse(best.content || 'null');
                } catch {
                    meta = null;
                }
                if (meta && meta.revoked) return null;
            }
        } catch {
            /* header probe is best-effort */
        }
        const relays = Array.isArray(raw.recommendedRelays) ? normalizeNostrRelayUrls(raw.recommendedRelays) : [];
        return { pub: owner, universeId, recommendedRelays: relays };
    },

    async putTreeCodeClaim({ pair, code, universeId, recommendedRelays = null }) {
        const rec = await this.signTreeCodeClaim(pair, code, universeId, recommendedRelays);
        await this._publish(rec.sig);
        return rec;
    },

    /** Owner-signed tombstone for a share code (same `d` replaceable). */
    async revokeTreeShareCode({ pair, code }) {
        const norm = normalizeTreeShareCode(code);
        if (!norm || !pair?.priv) return null;
        const payload = {
            kind: 'tree_code',
            code: String(code),
            universeId: '',
            ownerPub: String(pair.pub),
            revoked: true,
            at: new Date().toISOString()
        };
        const ev = await this._finalize(pair, {
            kind: KIND_TREE_CODE,
            tags: [['d', treeCodeDTag(norm)], [TAG_APP, TAG_APP_VALUE]],
            content: JSON.stringify(payload)
        });
        await this._publish(ev);
        return { ...payload, by: pair.pub, sig: ev };
    }
};
