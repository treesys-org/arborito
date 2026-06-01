/**
 * PoW-protected tree metrics: usage pings, votes, content reports, urgent
 * user messages. Each kind shares the same shape — sign a JSON payload with
 * a PoW nonce, publish, then verify on read.
 */

import { verifyEvent } from '../../../../vendor/nostr-tools/lib/esm/index.js';
import {
    KIND_APP_SIGNED_PAYLOAD,
    arbRootTag
} from '../nostr-spec.js';
import { hasArbRoot, QUERY_MS_LONG } from './_shared.js';

export const metricsMixin = {
    async putTreeUsagePing({ pair, ownerPub, universeId, dayKey = null }) {
        const dk = dayKey || new Date().toISOString().slice(0, 10);
        const bucket = `usage:${dk}`;
        const pow = await this._solvePow('tree_usage_v1', ownerPub, universeId, bucket, pair.pub, this._powBits('tree_usage_v1'));
        const payload = {
            kind: 'tree_usage_v1',
            ownerPub: String(ownerPub),
            universeId: String(universeId),
            dayKey: String(dk),
            powBits: pow.powBits,
            powNonce: pow.powNonce,
            at: new Date().toISOString()
        };
        const ev = await this._finalize(pair, {
            kind: KIND_APP_SIGNED_PAYLOAD,
            tags: [
                arbRootTag(ownerPub, universeId),
                ['m', this.metricKindName('usage')],
                ['d', `usage:${ownerPub}:${universeId}:${dk}:${pair.pub}`]
            ],
            content: JSON.stringify(payload)
        });
        await this._publish(ev);
    },

    async verifyTreeUsagePing(record) {
        const ev = record && record.sig && typeof record.sig === 'object' && record.sig.id ? record.sig : record;
        if (!ev || !verifyEvent(ev)) return false;
        let v;
        try {
            v = JSON.parse(String(ev.content || 'null'));
        } catch {
            return false;
        }
        if (!v || String(v.kind) !== 'tree_usage_v1') return false;
        const by = String(ev.pubkey || '');
        return (
            String(v.ownerPub) === String(record.ownerPub || v.ownerPub) &&
            String(v.universeId) === String(record.universeId || v.universeId) &&
            String(v.dayKey || '') &&
            (await this._verifyPow('tree_usage_v1', v.ownerPub, v.universeId, `usage:${v.dayKey}`, by, v.powBits, v.powNonce))
        );
    },

    async countTreeUsageUniqueLastNDaysOnce({ ownerPub, universeId, days = 7, maxUsersPerDay = 800 } = {}) {
        const evs = await this._query(
            {
                kinds: [KIND_APP_SIGNED_PAYLOAD],
                '#m': [this.metricKindName('usage')],
                limit: Math.min(4000, maxUsersPerDay * Math.max(1, days) * 4)
            },
            QUERY_MS_LONG
        );
        const dayKeys = new Set();
        const now = Date.now();
        for (let d = 0; d < Math.max(1, Number(days) || 7); d++) {
            const t = new Date(now - d * 86400000);
            dayKeys.add(t.toISOString().slice(0, 10));
        }
        const perDay = new Map();
        for (const ev of evs) {
            if (!hasArbRoot(ev, ownerPub, universeId)) continue;
            let v;
            try {
                v = JSON.parse(ev.content || 'null');
            } catch {
                continue;
            }
            if (!(await this.verifyTreeUsagePing({ ...v, sig: ev }))) continue;
            const dk = String(v.dayKey || '');
            if (!dayKeys.has(dk)) continue;
            if (!perDay.has(dk)) perDay.set(dk, new Set());
            perDay.get(dk).add(String(ev.pubkey || ''));
        }
        let sum = 0;
        for (const s of perDay.values()) sum += s.size;
        return sum;
    },

    async putTreeVote({ pair, ownerPub, universeId, vote = true }) {
        const value = vote ? 1 : -1;
        const bucket = `vote:${value > 0 ? 'up' : 'down'}`;
        const pow = await this._solvePow('tree_vote_v1', ownerPub, universeId, bucket, pair.pub, this._powBits('tree_vote_v1'));
        const payload = {
            kind: 'tree_vote_v1',
            ownerPub: String(ownerPub),
            universeId: String(universeId),
            value,
            powBucket: bucket,
            powBits: pow.powBits,
            powNonce: pow.powNonce,
            at: new Date().toISOString()
        };
        const ev = await this._finalize(pair, {
            kind: KIND_APP_SIGNED_PAYLOAD,
            tags: [
                arbRootTag(ownerPub, universeId),
                ['m', this.metricKindName('vote')],
                ['d', `vote:${ownerPub}:${universeId}:${pair.pub}`]
            ],
            content: JSON.stringify(payload)
        });
        await this._publish(ev);
    },

    async verifyTreeVote(record) {
        const ev = record && record.sig && typeof record.sig === 'object' && record.sig.id ? record.sig : record;
        if (!ev || !verifyEvent(ev)) return false;
        let v;
        try {
            v = JSON.parse(String(ev.content || 'null'));
        } catch {
            return false;
        }
        if (!v || String(v.kind) !== 'tree_vote_v1') return false;
        const by = String(ev.pubkey || '');
        return (
            String(v.ownerPub) === String(record.ownerPub || v.ownerPub) &&
            String(v.universeId) === String(record.universeId || v.universeId) &&
            (await this._verifyPow('tree_vote_v1', v.ownerPub, v.universeId, v.powBucket, by, v.powBits, v.powNonce))
        );
    },

    async countTreeVotesOnce({ ownerPub, universeId, max = 2500 } = {}) {
        /* The `#U` (uppercase, custom) tag is not indexed by stricter relays
         * (primal.net, tchncs.de) and they answer with `bad req: unindexed
         * tag filter` while keeping the REQ open until eoseTimeout, which
         * snowballs into "too many concurrent REQs". The broad query (no
         * `#U`) returns the same data at slightly higher cost, so we just
         * use that. We still filter by `#m` (single-letter, NIP-12-style)
         * and validate `arbRoot` client-side. */
        const broad = await this._query(
            {
                kinds: [KIND_APP_SIGNED_PAYLOAD],
                '#m': [this.metricKindName('vote')],
                limit: Math.min(8000, max * 2)
            },
            QUERY_MS_LONG
        );
        const byId = new Map();
        for (const ev of broad) {
            if (ev && ev.id) byId.set(ev.id, ev);
        }
        let n = 0;
        for (const ev of byId.values()) {
            if (!hasArbRoot(ev, ownerPub, universeId)) continue;
            let o;
            try {
                o = JSON.parse(ev.content || 'null');
            } catch {
                continue;
            }
            if (await this.verifyTreeVote({ ...o, sig: ev })) n += Number(o.value) > 0 ? 1 : -1;
        }
        return n;
    },

    async putTreeReport({ pair, ownerPub, universeId, reason, note = '' }) {
        const bucket = `report:${String(reason || '')}`;
        const pow = await this._solvePow('tree_report_v1', ownerPub, universeId, bucket, pair.pub, this._powBits('tree_report_v1'));
        const payload = {
            kind: 'tree_report_v1',
            ownerPub: String(ownerPub),
            universeId: String(universeId),
            reason: String(reason || ''),
            note: String(note || ''),
            powBucket: bucket,
            powBits: pow.powBits,
            powNonce: pow.powNonce,
            at: new Date().toISOString()
        };
        const ev = await this._finalize(pair, {
            kind: KIND_APP_SIGNED_PAYLOAD,
            tags: [arbRootTag(ownerPub, universeId), ['m', this.metricKindName('report')]],
            content: JSON.stringify(payload)
        });
        await this._publish(ev);
    },

    async verifyTreeReport(record) {
        const ev = record && record.sig && typeof record.sig === 'object' && record.sig.id ? record.sig : record;
        if (!ev || !verifyEvent(ev)) return false;
        let v;
        try {
            v = JSON.parse(String(ev.content || 'null'));
        } catch {
            return false;
        }
        if (!v || String(v.kind) !== 'tree_report_v1') return false;
        const by = String(ev.pubkey || '');
        return (
            String(v.ownerPub) === String(record.ownerPub || v.ownerPub) &&
            String(v.universeId) === String(record.universeId || v.universeId) &&
            (await this._verifyPow('tree_report_v1', v.ownerPub, v.universeId, v.powBucket, by, v.powBits, v.powNonce))
        );
    },

    async listTreeReportsOnce({ ownerPub, universeId, max = 600 } = {}) {
        const evs = await this._query(
            {
                kinds: [KIND_APP_SIGNED_PAYLOAD],
                '#m': [this.metricKindName('report')],
                limit: Math.min(2000, max * 3)
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
            if (await this.verifyTreeReport({ ...o, sig: ev })) out.push(o);
            if (out.length >= max) break;
        }
        return out;
    },

    async countTreeReportsOnce({ ownerPub, universeId, daysWindow = 14, max = 1200 } = {}) {
        const rows = await this.listTreeReportsOnce({ ownerPub, universeId, max });
        const cutoff = Date.now() - Math.max(1, Number(daysWindow) || 14) * 86400000;
        let n = 0;
        for (const r of rows) {
            const t = Date.parse(String(r.at || ''));
            if (!Number.isFinite(t) || t < cutoff) continue;
            n++;
            if (n >= max) break;
        }
        return n;
    },

    async putTreeUrgentUserMessage({ pair, ownerPub, universeId, message, contactLine = '' }) {
        const bucket = 'urgent';
        const pow = await this._solvePow('tree_urgent_user_message_v1', ownerPub, universeId, bucket, pair.pub, this._powBits('tree_report_v1'));
        const payload = {
            kind: 'tree_urgent_user_message_v1',
            ownerPub: String(ownerPub),
            universeId: String(universeId),
            message: String(message || ''),
            contactLine: String(contactLine || ''),
            powBucket: bucket,
            powBits: pow.powBits,
            powNonce: pow.powNonce,
            at: new Date().toISOString()
        };
        const ev = await this._finalize(pair, {
            kind: KIND_APP_SIGNED_PAYLOAD,
            tags: [arbRootTag(ownerPub, universeId), ['m', this.metricKindName('urgent')]],
            content: JSON.stringify(payload)
        });
        await this._publish(ev);
        return { ...payload, by: pair.pub, sig: ev };
    },

    async verifyTreeUrgentUserMessage(record) {
        const ev = record && record.sig && typeof record.sig === 'object' && record.sig.id ? record.sig : record;
        if (!ev || !verifyEvent(ev)) return false;
        let v;
        try {
            v = JSON.parse(String(ev.content || 'null'));
        } catch {
            return false;
        }
        return String(v.kind) === 'tree_urgent_user_message_v1';
    },

    async listTreeUrgentUserMessagesOnce({ ownerPub, universeId, max = 200 } = {}) {
        const evs = await this._query(
            {
                kinds: [KIND_APP_SIGNED_PAYLOAD],
                '#m': [this.metricKindName('urgent')],
                limit: Math.min(800, max * 4)
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
            if (await this.verifyTreeUrgentUserMessage({ ...o, sig: ev })) out.push(o);
            if (out.length >= max) break;
        }
        return out;
    }
};
