/**
 * Governance / regulatory-flavoured records: legal-report claims with PoW,
 * owner defense statements, and operator-driven delist requests. Each is a
 * replaceable signed payload that downstream consumers (moderation UI,
 * directory snapshot pipeline) read back as a single most-recent record.
 */

import { verifyEvent } from '../../../../vendor/nostr-tools/lib/esm/index.js';
import {
    KIND_APP_SIGNED_PAYLOAD,
    arbRootTag
} from '../nostr-spec.js';
import { hasArbRoot, QUERY_MS_LONG } from './_shared.js';

export const governanceMixin = {
    async putTreeLegalReport(opts) {
        const { pair, ownerPub, universeId, entityName, euAddress, vatId, whereInTree, whatWork, description } = opts;
        const bucket = 'legal';
        const pow = await this._solvePow('tree_legal_report_v1', ownerPub, universeId, bucket, pair.pub, this._powBits('tree_legal_report_v1'));
        const payload = {
            kind: 'tree_legal_report_v1',
            ownerPub: String(ownerPub),
            universeId: String(universeId),
            entityName: String(entityName || ''),
            euAddress: String(euAddress || ''),
            vatId: String(vatId || ''),
            whereInTree: String(whereInTree || ''),
            whatWork: String(whatWork || ''),
            description: String(description || ''),
            powBucket: bucket,
            powBits: pow.powBits,
            powNonce: pow.powNonce,
            at: new Date().toISOString()
        };
        const ev = await this._finalize(pair, {
            kind: KIND_APP_SIGNED_PAYLOAD,
            tags: [arbRootTag(ownerPub, universeId), ['m', this.metricKindName('legal')]],
            content: JSON.stringify(payload)
        });
        await this._publish(ev);
    },

    async verifyTreeLegalReport(record) {
        const ev = record && record.sig && typeof record.sig === 'object' && record.sig.id ? record.sig : record;
        if (!ev || !verifyEvent(ev)) return false;
        let v;
        try {
            v = JSON.parse(String(ev.content || 'null'));
        } catch {
            return false;
        }
        return String(v.kind) === 'tree_legal_report_v1';
    },

    async listTreeLegalReportsOnce({ ownerPub, universeId, max = 400 } = {}) {
        const evs = await this._query(
            {
                kinds: [KIND_APP_SIGNED_PAYLOAD],
                '#m': [this.metricKindName('legal')],
                limit: Math.min(1200, max * 3)
            },
            QUERY_MS_LONG
        );
        const out = [];
        for (const ev of evs) {
            if (!hasArbRoot(ev, ownerPub, universeId)) continue;
            let o;
            try {
                o = JSON.parse(ev.content || 'null');
            } catch {
                continue;
            }
            if (await this.verifyTreeLegalReport({ ...o, sig: ev })) out.push(o);
            if (out.length >= max) break;
        }
        return out;
    },

    async countTreeLegalReportsOnce({ ownerPub, universeId, daysWindow = 90, max = 900 } = {}) {
        const rows = await this.listTreeLegalReportsOnce({ ownerPub, universeId, max });
        const cutoff = Date.now() - Math.max(1, Number(daysWindow) || 90) * 86400000;
        const uniq = new Set();
        for (const r of rows) {
            const t = Date.parse(String(r.at || ''));
            if (!Number.isFinite(t) || t < cutoff) continue;
            uniq.add(String(r.by || ''));
            if (uniq.size >= max) break;
        }
        return uniq.size;
    },

    async putTreeLegalOwnerDefense(opts) {
        const { pair, ownerPub, universeId, latestLegalReportAt, consentJudicialShare } = opts;
        const payload = {
            kind: 'tree_legal_owner_defense_v1',
            ownerPub: String(ownerPub),
            universeId: String(universeId),
            latestLegalReportAt: String(latestLegalReportAt || ''),
            consentJudicialShare: !!consentJudicialShare,
            at: new Date().toISOString()
        };
        const ev = await this._finalize(pair, {
            kind: KIND_APP_SIGNED_PAYLOAD,
            tags: [arbRootTag(ownerPub, universeId), ['m', this.metricKindName('legaldef')], ['d', `legaldef:${ownerPub}:${universeId}`]],
            content: JSON.stringify(payload)
        });
        await this._publish(ev);
        return { ...payload, by: pair.pub, sig: ev };
    },

    async loadTreeLegalOwnerDefenseOnce({ ownerPub, universeId }) {
        const ev = await this._get(
            {
                kinds: [KIND_APP_SIGNED_PAYLOAD],
                authors: [String(ownerPub)],
                '#d': [`legaldef:${ownerPub}:${universeId}`],
                limit: 1
            },
            6000
        );
        if (!ev) return null;
        try {
            return JSON.parse(ev.content || 'null');
        } catch {
            return null;
        }
    },

    async putTreeDelist({ pair, ownerPub, universeId, action = 'delist', reason = 'spam', note = '' }) {
        const payload = {
            kind: 'tree_delist_v1',
            ownerPub: String(ownerPub),
            universeId: String(universeId),
            action: String(action || 'delist'),
            reason: String(reason || ''),
            note: String(note || ''),
            at: new Date().toISOString()
        };
        const ev = await this._finalize(pair, {
            kind: KIND_APP_SIGNED_PAYLOAD,
            tags: [arbRootTag(ownerPub, universeId), ['m', this.metricKindName('delist')], ['d', `delist:${ownerPub}:${universeId}`]],
            content: JSON.stringify(payload)
        });
        await this._publish(ev);
        return { ...payload, by: pair.pub, sig: ev };
    },

    async loadTreeDelistOnce({ ownerPub, universeId }) {
        const ev = await this._get(
            {
                kinds: [KIND_APP_SIGNED_PAYLOAD],
                authors: [String(ownerPub)],
                '#d': [`delist:${ownerPub}:${universeId}`],
                limit: 1
            },
            5000
        );
        if (!ev) return null;
        try {
            return JSON.parse(ev.content || 'null');
        } catch {
            return null;
        }
    }
};
