/**
 * Nostr-backed “universe” service: relays, signed events, chunked bundles.
 */

import {
    SimplePool,
    finalizeEvent,
    verifyEvent,
    getPublicKey,
    generateSecretKey,
    verifiedSymbol
} from '../../vendor/nostr-tools/lib/esm/index.js';
import { bytesToHex, hexToBytes } from '../../vendor/deps/noble-hashes/esm/utils.js';
import { normalizeTreeShareCode } from '../config/share-code.js';
import { DIRECTORY_INDEX_TRUSTED_PUBLISHERS } from '../config/directory-index.js';
import { randomUUIDSafe } from '../utils/secure-web-crypto.js';
import { prepareNostrSplitBundleV2 } from '../utils/nostr-bundle-chunks.js';
import {
    verifyDirectoryBumpNostr,
    verifyDirectoryIndexSnapshotNostr,
    verifyGlobalTreeDirectoryMetaNostr
} from '../utils/directory-index-shared.js';
import { DEFAULT_NOSTR_RELAYS, normalizeNostrRelayUrls } from '../config/nostr-relays-runtime.js';
import {
    KIND_APP_SIGNED_PAYLOAD,
    KIND_AUTH_CREDENTIAL,
    KIND_BUNDLE_CHUNK_JSON,
    KIND_BUNDLE_HEADER,
    KIND_DIRECTORY_BUMP,
    KIND_DIRECTORY_INDEX_SNAPSHOT,
    KIND_FORUM_BUCKET,
    KIND_PRESENCE_PING,
    KIND_QR_SIGNAL_AUTH,
    KIND_QR_SIGNAL_REQUEST,
    KIND_TREE_CODE,
    KIND_TREE_DIRECTORY,
    KIND_UNIVERSE_REVOKE,
    KIND_USER_PROGRESS,
    NOSTR_CHUNK_CONTENT_MAX,
    TAG_APP,
    TAG_APP_VALUE,
    arbRootTag,
    bundleHeaderDTag,
    directoryDTag,
    qrAuthDTag,
    qrSignalDTag,
    revokeDTag,
    treeCodeDTag
} from '../config/nostr-spec.js';

const QUERY_MS = 4500;
const QUERY_MS_LONG = 16000;

function tagValue(ev, name) {
    const t = (ev.tags || []).find((x) => x && x[0] === name);
    return t && t.length > 1 ? String(t[1]) : '';
}

function hasArbRoot(ev, pub, universeId) {
    const want = arbRootTag(pub, universeId);
    return (ev.tags || []).some((t) => t.length >= 4 && t[0] === want[0] && t[1] === want[1] && t[2] === want[2] && t[3] === want[3]);
}

function splitUtf8Chunks(s, max = NOSTR_CHUNK_CONTENT_MAX) {
    const str = String(s);
    const maxBytes = Math.max(1, Math.floor(Number(max)) || NOSTR_CHUNK_CONTENT_MAX);
    const out = [];
    let i = 0;
    while (i < str.length) {
        let end = Math.min(str.length, i + maxBytes);
        while (end > i && (str.codePointAt(end - 1) & 0xfc00) === 0xdc00) end--;
        if (end <= i) end = i + 1;
        out.push(str.slice(i, end));
        i = end;
    }
    if (!out.length) out.push('');
    return out;
}

function pairSecretKey(pair) {
    const h = String(pair.priv || '').trim();
    if (!/^[0-9a-fA-F]{64}$/.test(h)) throw new Error('Invalid publisher secret key (expect 64 hex).');
    return hexToBytes(h);
}

/** @param {{ priv: string }} pair */
export async function createNostrPair() {
    const sk = generateSecretKey();
    return { pub: getPublicKey(sk), priv: bytesToHex(sk) };
}

export function isNostrNetworkAvailable() {
    try {
        return typeof WebSocket !== 'undefined';
    } catch {
        return false;
    }
}

export class NostrUniverseService {
    constructor({ peers = DEFAULT_NOSTR_RELAYS } = {}) {
        this.peers = normalizeNostrRelayUrls(peers);
        this._pool = new SimplePool();
        /** @type {{ queue: Promise<void> }} */
        this._publishChain = { queue: Promise.resolve() };
        this._forumEditorsCache = null;
    }

    get available() {
        return isNostrNetworkAvailable() && this.peers.length > 0;
    }

    setPeers(peers) {
        this.peers = normalizeNostrRelayUrls(peers);
    }

    /** Effective URLs to publish / query (never empty: minimum fallback relays). */
    getPublishRelayUrls() {
        return [...this._relays()];
    }

    _relays() {
        const raw = this.peers.length ? this.peers : DEFAULT_NOSTR_RELAYS;
        const n = normalizeNostrRelayUrls(raw);
        return n.length ? n : ['wss://nos.lol'];
    }

    /**
     * @param {import('../../vendor/nostr-tools/lib/types/core.js').Event} ev
     */
    async _publish(ev) {
        const relays = this._relays();
        const chain = this._publishChain.queue.then(async () => {
            const attempts = this._pool.publish(relays, ev);
            const settled = await Promise.allSettled(attempts);
            const anyOk = settled.some((s) => s.status === 'fulfilled');
            if (!anyOk) {
                const reasons = settled
                    .filter((s) => s.status === 'rejected')
                    .map((s) => String((s.reason && s.reason.message) || s.reason || 'reject'));
                throw new Error(reasons.length ? reasons.join('; ') : 'publish failed on all relays');
            }
        });
        this._publishChain.queue = chain.catch(() => {});
        await chain;
    }

    async _query(filter, ms = QUERY_MS) {
        const relays = this._relays();
        if (!relays.length) return [];
        return this._pool.querySync(relays, filter, { maxWait: ms });
    }

    async _get(filter, ms = QUERY_MS) {
        const relays = this._relays();
        if (!relays.length) return null;
        return this._pool.get(relays, filter, { maxWait: ms });
    }

    /**
     * Ensures templates compatible with nostr-tools `validateEvent` (tags without `null`/objects,
     * `content` always string, numeric `kind`). Without this, e.g. `null` in a tag triggers
     * «can't serialize event with wrong or missing properties» before talking to relays.
     */
    _finalize(pair, tpl) {
        const kind = Number((tpl && tpl.kind) ?? NaN);
        if (!Number.isFinite(kind)) {
            throw new Error(`Invalid Nostr event kind: ${String(tpl && tpl.kind)}`);
        }
        let content = tpl && tpl.content;
        if (typeof content !== 'string') {
            if (content === undefined || content === null) content = '';
            else {
                try {
                    content = JSON.stringify(content);
                } catch {
                    content = '';
                }
            }
        }
        const tagsRaw = tpl && tpl.tags;
        const tags = Array.isArray(tagsRaw)
            ? tagsRaw.map((row) =>
                  Array.isArray(row)
                      ? row.map((cell) => {
                            if (cell == null) return '';
                            const t = typeof cell;
                            if (t === 'string') return cell;
                            if (t === 'number' || t === 'boolean' || t === 'bigint') return String(cell);
                            return '';
                        })
                      : []
              )
            : [];
        const created_at =
            typeof (tpl && tpl.created_at) === 'number' && Number.isFinite(tpl.created_at)
                ? tpl.created_at
                : Math.floor(Date.now() / 1000);
        const base = { ...(tpl || {}) };
        delete base.id;
        delete base.sig;
        delete base.pubkey;
        try {
            delete base[verifiedSymbol];
        } catch {
            /* ignore */
        }
        return finalizeEvent(
            {
                ...base,
                kind,
                tags,
                content,
                created_at
            },
            pairSecretKey(pair)
        );
    }

    async _signJsonPayload(pair, payload) {
        const content = JSON.stringify(payload);
        return this._finalize(pair, {
            kind: KIND_APP_SIGNED_PAYLOAD,
            tags: [
                [TAG_APP, TAG_APP_VALUE],
                ['pk', String(pair.pub)]
            ],
            content
        });
    }

    async _verifyJsonPayloadEvent(ev) {
        try {
            if (!ev || !verifyEvent(ev)) return null;
            if (Number(ev.kind) !== KIND_APP_SIGNED_PAYLOAD) return null;
            const o = JSON.parse(String(ev.content || 'null'));
            return o && typeof o === 'object' ? o : null;
        } catch {
            return null;
        }
    }

    async _verify(sig, pub) {
        const ev = typeof sig === 'object' && sig && sig.sig ? sig : null;
        if (!ev) return null;
        if (!verifyEvent(ev)) return null;
        if (String(ev.pubkey) !== String(pub)) return null;
        return this._verifyJsonPayloadEvent(ev);
    }

    async _sign(payload, pair) {
        return this._signJsonPayload(pair, payload);
    }

    async encryptForSelf({ pair, data }) {
        const { nip04 } = await import('../../vendor/nostr-tools/lib/esm/nip04.js');
        return nip04.encrypt(pair.pub, JSON.stringify(data), pairSecretKey(pair));
    }

    async decryptForSelf({ pair, encrypted }) {
        const { nip04 } = await import('../../vendor/nostr-tools/lib/esm/nip04.js');
        const txt = await nip04.decrypt(pair.pub, String(encrypted), pairSecretKey(pair));
        return JSON.parse(txt);
    }

    // --- Directory ---

    _buildTreeDirectoryBody(pair, { universeId, title, shareCode = '', recommendedRelays = null, description = '', authorName = '' }) {
        const relays = Array.isArray(recommendedRelays) ? normalizeNostrRelayUrls(recommendedRelays) : [];
        const desc = String(description || '').trim().slice(0, 280);
        const author = String(authorName || '').trim().slice(0, 80);
        return {
            kind: 'tree_directory_v2',
            ownerPub: String(pair.pub),
            universeId: String(universeId),
            title: String(title || 'Arborito').trim() || 'Arborito',
            shareCode: String(shareCode || '').trim(),
            ...(author ? { authorName: author } : {}),
            ...(desc ? { description: desc } : {}),
            updatedAt: new Date().toISOString(),
            ...(relays.length ? { recommendedRelays: relays } : {})
        };
    }

    async signGlobalTreeDirectoryEntry(
        pair,
        { universeId, title, shareCode = '', recommendedRelays = null, description = '', authorName = '' }
    ) {
        const body = this._buildTreeDirectoryBody(pair, {
            universeId,
            title,
            shareCode,
            recommendedRelays,
            description,
            authorName
        });
        const d = directoryDTag(pair.pub, universeId);
        const ev = await this._finalize(pair, {
            kind: KIND_TREE_DIRECTORY,
            tags: [['d', d], arbRootTag(pair.pub, universeId), [TAG_APP, TAG_APP_VALUE]],
            content: JSON.stringify(body)
        });
        return { ...body, by: pair.pub, sig: ev };
    }

    async verifyGlobalTreeDirectoryEntry(record) {
        const ev = record && record.sig && typeof record.sig === 'object' ? record.sig : null;
        return verifyGlobalTreeDirectoryMetaNostr(ev, record);
    }

    async putGlobalTreeDirectoryEntry(opts) {
        const { pair, universeId, title, shareCode, recommendedRelays, description, authorName } = opts;
        if (!(pair && pair.pub)) return null;
        const rec = await this.signGlobalTreeDirectoryEntry(pair, {
            universeId,
            title,
            shareCode,
            recommendedRelays,
            description,
            authorName
        });
        await this._publish(rec.sig);
        return rec;
    }

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
    }

    directoryBumpDTag(ownerPub, universeId) {
        return `arborito:dirbump:${String(ownerPub)}:${String(universeId)}:${Date.now().toString(36)}`;
    }

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
    }

    async verifyDirectoryBumpRecord(record) {
        const ev = record && record.sig && typeof record.sig === 'object' && record.sig.id ? record.sig : record;
        return verifyDirectoryBumpNostr(ev);
    }

    async verifyDirectoryIndexSnapshot(record) {
        return verifyDirectoryIndexSnapshotNostr(record, {
            trustedPublishers: DIRECTORY_INDEX_TRUSTED_PUBLISHERS
        });
    }

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
    }

    async listGlobalTreeDirectoryEntriesOnce(opts = {}) {
        const limit = Math.max(1, Math.min(800, Number(opts.limit) || 120));
        const q = String(opts.query || '').trim().toLowerCase();
        const indexed = await this._mergeDirectoryRowsFromSnapshots(limit, q);
        if (indexed.length >= limit) return indexed.slice(0, limit);
        const need = limit - indexed.length;
        const seen = new Set(indexed.map((r) => `${r.ownerPub}/${r.universeId}`));
        const rest = await this._traverseGlobalDirectoryEntries({ limit: need, query: q, excludeKeys: seen });
        return [...indexed, ...rest].slice(0, limit);
    }

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
            rows.push({
                ownerPub,
                universeId,
                title: String(meta.title || '').trim(),
                shareCode: String(meta.shareCode || ''),
                updatedAt: String(meta.updatedAt || ''),
                description: String(meta.description || ''),
                authorName: String(meta.authorName || ''),
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
    }

    /**
     * Same `ownerPub/universeId` may have several replacements (publish → delist). Keep the newest `created_at`.
     */
    _latestTreeDirectoryRowsFromEvents(evs) {
        /** @type {Map<string, { ev: import('../../vendor/nostr-tools/lib/types/core.js').Event, body: object }>} */
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
    }

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
            out.push({
                ownerPub,
                universeId,
                title: String(body.title || '').trim(),
                shareCode: String(body.shareCode || ''),
                updatedAt: String(body.updatedAt || ''),
                description: String(body.description || ''),
                authorName: String(body.authorName || ''),
                ...(relays.length ? { recommendedRelays: relays } : {})
            });
        }
        return out;
    }

    // --- PoW metrics (votes, usage, reports) — same payloads, Nostr-signed events ---

    _powBits(kind) {
        if (kind === 'tree_usage_v1') return 16;
        if (kind === 'tree_vote_v1') return 18;
        if (kind === 'tree_report_v1') return 20;
        if (kind === 'tree_legal_report_v1') return 22;
        return 0;
    }

    async _solvePow(kind, ownerPub, universeId, bucket, actorPub, bits) {
        const b = Math.max(0, Math.min(24, Number(bits) || 0));
        if (!b) return { powBits: 0, powNonce: '' };
        const ch = `${String(kind)}|${String(ownerPub)}|${String(universeId)}|${String(bucket)}|${String(actorPub)}`;
        const enc = new TextEncoder();
        const subtle = globalThis.crypto?.subtle;
        if (!subtle) return { powBits: b, powNonce: '' };
        const countLeadingZeroBits = (bytes) => {
            let n = 0;
            for (let i = 0; i < bytes.length; i++) {
                const by = bytes[i];
                if (by === 0) {
                    n += 8;
                    continue;
                }
                for (let bit = 7; bit >= 0; bit--) {
                    if ((by >> bit) & 1) return n;
                    n += 1;
                }
                return n;
            }
            return n;
        };
        const maxIters = 220000;
        for (let i = 0; i < maxIters; i++) {
            const nonce = `${i.toString(16)}:${Math.random().toString(16).slice(2, 10)}`;
            const h = new Uint8Array(await subtle.digest('SHA-256', enc.encode(`${ch}|${nonce}`)));
            if (countLeadingZeroBits(h) >= b) return { powBits: b, powNonce: nonce };
            if (i % 2000 === 0) await new Promise((r) => setTimeout(r, 0));
        }
        return { powBits: b, powNonce: '' };
    }

    async _verifyPow(kind, ownerPub, universeId, bucket, actorPub, powBits, powNonce) {
        const b = Math.max(0, Math.min(24, Number(powBits) || 0));
        if (!b) return true;
        const nonce = String(powNonce || '');
        if (!nonce) return false;
        const ch = `${String(kind)}|${String(ownerPub)}|${String(universeId)}|${String(bucket)}|${String(actorPub)}`;
        const enc = new TextEncoder();
        try {
            const h = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', enc.encode(`${ch}|${nonce}`)));
            let n = 0;
            for (let i = 0; i < h.length; i++) {
                const by = h[i];
                if (by === 0) {
                    n += 8;
                    continue;
                }
                for (let bit = 7; bit >= 0; bit--) {
                    if ((by >> bit) & 1) return n >= b;
                    n += 1;
                }
            }
            return n >= b;
        } catch {
            return false;
        }
    }

    metricKindName(base) {
        return `a:${base}`;
    }

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
    }

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
    }

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
    }

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
        const scope = `${String(ownerPub)}:${String(universeId)}`;
        const ev = await this._finalize(pair, {
            kind: KIND_APP_SIGNED_PAYLOAD,
            tags: [
                arbRootTag(ownerPub, universeId),
                /** Index for relays: `#U` + value (NIP-01 tag filter matches tag[1]). */
                ['U', scope],
                ['m', this.metricKindName('vote')],
                ['d', `vote:${ownerPub}:${universeId}:${pair.pub}`]
            ],
            content: JSON.stringify(payload)
        });
        await this._publish(ev);
    }

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
    }

    async countTreeVotesOnce({ ownerPub, universeId, max = 2500 } = {}) {
        const scope = `${String(ownerPub)}:${String(universeId)}`;
        const base = {
            kinds: [KIND_APP_SIGNED_PAYLOAD],
            '#m': [this.metricKindName('vote')],
            limit: Math.min(8000, max * 2)
        };
        const [scoped, broad] = await Promise.all([
            this._query({ ...base, '#U': [scope], limit: Math.min(5000, max * 2) }, QUERY_MS_LONG),
            this._query(base, QUERY_MS_LONG)
        ]);
        const byId = new Map();
        for (const ev of scoped) {
            if (ev && ev.id) byId.set(ev.id, ev);
        }
        for (const ev of broad) {
            if (ev && ev.id && !byId.has(ev.id)) byId.set(ev.id, ev);
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
    }

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
    }

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
    }

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
    }

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
    }

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
    }

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
    }

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
    }

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
    }

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
    }

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
    }

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
    }

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
    }

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
    }

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

    // --- Auth / recovery / identity (per-username; filter #u) ---

    _authWriterPair() {
        try {
            const raw = localStorage.getItem('arborito-nostr-auth-writer-v1');
            if (raw) {
                const o = JSON.parse(raw);
                if (o && o.priv && o.pub) return o;
            }
        } catch {
            /* ignore */
        }
        const sk = generateSecretKey();
        const p = { pub: getPublicKey(sk), priv: bytesToHex(sk) };
        try {
            localStorage.setItem('arborito-nostr-auth-writer-v1', JSON.stringify(p));
        } catch {
            /* ignore */
        }
        return p;
    }

    authUserFilter(username) {
        const u = String(username || '').trim();
        return { kinds: [KIND_AUTH_CREDENTIAL], '#u': [u], limit: 200 };
    }

    async loadAuthUserMetaOnce(username) {
        const evs = await this._query(this.authUserFilter(username), 3000);
        return { v: 1, username: String(username || '').trim(), updatedAt: evs[0] ? new Date(evs[0].created_at * 1000).toISOString() : '' };
    }

    async listAuthCredentialsOnce(username) {
        const evs = await this._query(this.authUserFilter(username), 4000);
        const out = [];
        for (const ev of evs) {
            try {
                const c = JSON.parse(ev.content || 'null');
                if (c && typeof c === 'object' && c.id && c.publicKeyJwk) out.push(c);
            } catch {
                /* ignore */
            }
        }
        out.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        return out;
    }

    putAuthCredential({ username, credential }) {
        const u = String(username || '').trim();
        if (!u || !credential || typeof credential !== 'object') return false;
        const id = String(credential.id || '').trim();
        if (!id) return false;
        const w = this._authWriterPair();
        const ev = finalizeEvent(
            {
                kind: KIND_AUTH_CREDENTIAL,
                created_at: Math.floor(Date.now() / 1000),
                tags: [
                    [TAG_APP, TAG_APP_VALUE],
                    ['u', u],
                    ['cid', id]
                ],
                content: JSON.stringify(credential)
            },
            pairSecretKey(w)
        );
        void this._publish(ev);
        return true;
    }

    async loadSyncLoginRecordOnce(username) {
        const ev = await this._get(
            {
                kinds: [KIND_AUTH_CREDENTIAL],
                '#u': [String(username || '').trim()],
                '#cid': ['sync-login-v1'],
                limit: 1
            },
            6000
        );
        if (!ev) return null;
        try {
            const raw = JSON.parse(ev.content || 'null');
            const h = String(raw?.hash || '').trim();
            if (!h) return null;
            return { v: Number(raw.v) || 1, hash: h, updatedAt: String(raw.updatedAt || '') };
        } catch {
            return null;
        }
    }

    putSyncLoginHash({ username, hash }) {
        const u = String(username || '').trim();
        const h = String(hash || '').trim();
        if (!u || !h) return false;
        const w = this._authWriterPair();
        const rec = { v: 1, hash: h, updatedAt: new Date().toISOString() };
        const ev = finalizeEvent(
            {
                kind: KIND_AUTH_CREDENTIAL,
                created_at: Math.floor(Date.now() / 1000),
                tags: [
                    [TAG_APP, TAG_APP_VALUE],
                    ['u', u],
                    ['cid', 'sync-login-v1']
                ],
                content: JSON.stringify(rec)
            },
            pairSecretKey(w)
        );
        void this._publish(ev);
        return true;
    }

    clearSyncLoginRecord(username) {
        return this.putSyncLoginHash({ username, hash: '' });
    }

    putIdentityClaim({ username, record }) {
        const u = String(username || '').trim();
        if (!u || !record || typeof record !== 'object') return false;
        const w = this._authWriterPair();
        const ev = finalizeEvent(
            {
                kind: KIND_AUTH_CREDENTIAL,
                created_at: Math.floor(Date.now() / 1000),
                tags: [
                    [TAG_APP, TAG_APP_VALUE],
                    ['u', u],
                    ['cid', 'identity-v1']
                ],
                content: JSON.stringify(record)
            },
            pairSecretKey(w)
        );
        void this._publish(ev);
        return true;
    }

    async loadIdentityClaimOnce(username) {
        const ev = await this._get(
            {
                kinds: [KIND_AUTH_CREDENTIAL],
                '#u': [String(username || '').trim()],
                '#cid': ['identity-v1'],
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

    recoveryFilter(username) {
        return { kinds: [KIND_AUTH_CREDENTIAL], '#u': [String(username || '').trim()], '#cid': ['recovery-code'] };
    }

    async listRecoveryCodeRecordsOnce(username, ms = 8000) {
        const evs = await this._query(
            {
                kinds: [KIND_AUTH_CREDENTIAL],
                '#u': [String(username || '').trim()],
                limit: 500
            },
            ms
        );
        const out = [];
        for (const ev of evs) {
            if (!ev.tags.some((t) => t[0] === 'cid' && String(t[1]).startsWith('recovery:'))) continue;
            try {
                const v = JSON.parse(ev.content || 'null');
                if (v && v.hash) out.push({ ...v, id: tagValue(ev, 'cid').replace(/^recovery:/, '') });
            } catch {
                /* ignore */
            }
        }
        return out;
    }

    async replaceRecoveryCodeRecords({ username, records }) {
        const u = String(username || '').trim();
        if (!u || !Array.isArray(records)) return false;
        const w = this._authWriterPair();
        for (const rec of records) {
            const id = String(rec.id || '').trim();
            if (!id) continue;
            const row = {
                v: 1,
                id,
                hash: String(rec.hash || ''),
                createdAt: String(rec.createdAt || new Date().toISOString()),
                usedAt: rec.usedAt != null && String(rec.usedAt).trim() ? String(rec.usedAt) : null
            };
            const ev = finalizeEvent(
                {
                    kind: KIND_AUTH_CREDENTIAL,
                    created_at: Math.floor(Date.now() / 1000),
                    tags: [
                        [TAG_APP, TAG_APP_VALUE],
                        ['u', u],
                        ['cid', `recovery:${id}`]
                    ],
                    content: JSON.stringify(row)
                },
                pairSecretKey(w)
            );
            await this._publish(ev);
        }
        return true;
    }

    async consumeRecoveryCodeIfHashMatches(username, hashB64u) {
        const want = String(hashB64u || '').trim();
        if (!want) return null;
        const list = await this.listRecoveryCodeRecordsOnce(username, 8000);
        for (const rec of list) {
            if (rec.usedAt) continue;
            if (String(rec.hash || '') !== want) continue;
            const id = String(rec.id || '').trim();
            if (!id) continue;
            const usedAt = new Date().toISOString();
            const w = this._authWriterPair();
            const row = {
                v: 1,
                id,
                hash: String(rec.hash || ''),
                createdAt: String(rec.createdAt || ''),
                usedAt
            };
            const ev = finalizeEvent(
                {
                    kind: KIND_AUTH_CREDENTIAL,
                    created_at: Math.floor(Date.now() / 1000),
                    tags: [
                        [TAG_APP, TAG_APP_VALUE],
                        ['u', String(username || '').trim()],
                        ['cid', `recovery:${id}`]
                    ],
                    content: JSON.stringify(row)
                },
                pairSecretKey(w)
            );
            await this._publish(ev);
            return { id };
        }
        return null;
    }

    // --- Revocation + bundle ---

    async isUniverseRevoked({ pub, universeId }) {
        const rec = await this.loadRevocationRecord({ pub, universeId });
        if (!rec) return false;
        return this.verifyRevocationRecord({ record: rec, expectedPub: pub, universeId });
    }

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
    }

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
    }

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
    }

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
    }

    async loadNostrLessonChunk({ pub, universeId, contentKey }) {
        const d = `arborito:lesson:${String(pub)}:${String(universeId)}:${String(contentKey || '').trim()}`;
        const ev = await this._get({ kinds: [KIND_BUNDLE_CHUNK_JSON], authors: [String(pub)], '#d': [d], limit: 1 }, 12000);
        if (!ev) return null;
        try {
            return JSON.parse(ev.content || 'null');
        } catch {
            return null;
        }
    }

    async loadNostrSnapshotChunk({ pub, universeId, snapshotKey }) {
        const d = `arborito:snap:${String(pub)}:${String(universeId)}:${String(snapshotKey || '').trim()}`;
        const ev = await this._get({ kinds: [KIND_BUNDLE_CHUNK_JSON], authors: [String(pub)], '#d': [d], limit: 1 }, 15000);
        if (!ev) return null;
        try {
            return JSON.parse(ev.content || 'null');
        } catch {
            return null;
        }
    }

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
    }

    async loadNostrForumPack({ pub, universeId }) {
        const d = `arborito:forum:${String(pub)}:${String(universeId)}`;
        const ev = await this._get({ kinds: [KIND_BUNDLE_CHUNK_JSON], authors: [String(pub)], '#d': [d], limit: 1 }, 12000);
        if (!ev) return { version: 1, threads: [], messages: [], moderationLog: [] };
        try {
            return JSON.parse(ev.content || 'null');
        } catch {
            return { version: 1, threads: [], messages: [], moderationLog: [] };
        }
    }

    async loadBundle({ pub, universeId }) {
        const r = await this.loadNostrUniverseBundle({ pub, universeId });
        if (r.revoked) return null;
        return r.bundle;
    }

    async verifyCollaboratorInviteRecord(record, ownerPub) {
        const v = await this._verify(record.sig, record.by);
        if (!v) return false;
        const roleOk = String(v.role) === 'editor' || String(v.role) === 'proposer';
        return (
            String(v.kind) === 'collab_invite' &&
            roleOk &&
            String(v.ownerPub) === String(ownerPub) &&
            String(v.universeId) === String(record.universeId) &&
            String(v.inviteePub) === String(record.inviteePub)
        );
    }

    async loadCollaboratorInvites({ ownerPub, universeId }) {
        const evs = await this._query(
            {
                kinds: [KIND_APP_SIGNED_PAYLOAD],
                authors: [String(ownerPub)],
                '#m': [this.metricKindName('collab')],
                limit: 500
            },
            8000
        );
        const out = [];
        for (const ev of evs) {
            if (!hasArbRoot(ev, ownerPub, universeId)) continue;
            let v;
            try {
                v = JSON.parse(ev.content || 'null');
            } catch {
                continue;
            }
            if (!v || typeof v !== 'object') continue;
            const ok = await this.verifyCollaboratorInviteRecord(v, ownerPub);
            if (!ok) continue;
            out.push({
                inviteePub: String(v.inviteePub),
                role: String(v.role),
                invitedAt: typeof v.invitedAt === 'string' ? v.invitedAt : ''
            });
        }
        return out;
    }

    async putCollaboratorInvite({ ownerPair, universeId, inviteePub, role }) {
        const r = role === 'proposer' ? 'proposer' : 'editor';
        const payload = {
            kind: 'collab_invite',
            ownerPub: String(ownerPair.pub),
            universeId: String(universeId),
            inviteePub: String(inviteePub).trim(),
            role: r,
            invitedAt: new Date().toISOString()
        };
        const inner = await this._signJsonPayload(ownerPair, payload);
        const ev = await this._finalize(ownerPair, {
            kind: KIND_APP_SIGNED_PAYLOAD,
            tags: [
                arbRootTag(ownerPair.pub, universeId),
                ['m', this.metricKindName('collab')],
                ['d', `collab:${ownerPair.pub}:${universeId}:${inviteePub}`]
            ],
            content: JSON.stringify({ ...payload, by: ownerPair.pub, sig: inner.id })
        });
        await this._publish(ev);
    }

    async removeCollaboratorInvite({ ownerPair, universeId, inviteePub }) {
        const payload = {
            kind: 'collab_invite',
            ownerPub: String(ownerPair.pub),
            universeId: String(universeId),
            inviteePub: String(inviteePub).trim(),
            role: 'none',
            invitedAt: new Date().toISOString()
        };
        const inner = await this._signJsonPayload(ownerPair, payload);
        const ev = await this._finalize(ownerPair, {
            kind: KIND_APP_SIGNED_PAYLOAD,
            tags: [
                arbRootTag(ownerPair.pub, universeId),
                ['m', this.metricKindName('collab')],
                ['d', `collab:${ownerPair.pub}:${universeId}:${inviteePub}`]
            ],
            content: JSON.stringify({ ...payload, by: ownerPair.pub, sig: inner.id })
        });
        await this._publish(ev);
    }

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
    }

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
    }

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
    }

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
    }

    async resolveTreeShareCode(input) {
        const norm = normalizeTreeShareCode(input);
        if (!norm) return null;
        const raw = await this.loadCodeRecordOnce(norm);
        if (!raw || !(await this.verifyTreeCodeClaim(raw))) return null;
        const relays = Array.isArray(raw.recommendedRelays) ? normalizeNostrRelayUrls(raw.recommendedRelays) : [];
        return { pub: String(raw.ownerPub || raw.by), universeId: String(raw.universeId), recommendedRelays: relays };
    }

    async putTreeCodeClaim({ pair, code, universeId, recommendedRelays = null }) {
        const rec = await this.signTreeCodeClaim(pair, code, universeId, recommendedRelays);
        await this._publish(rec.sig);
        return rec;
    }

    async signForumMessage({ pair, message }) {
        const payload = {
            id: String(message.id),
            threadId: String(message.threadId),
            body: String(message.body || ''),
            createdAt: String(message.createdAt || ''),
            authorPub: String((message.author && message.author.pub) || ''),
            authorName: String((message.author && message.author.name) || ''),
            authorAvatar: String((message.author && message.author.avatar) || '💬'),
            parentId: String(message.parentId || '')
        };
        const inner = await this._signJsonPayload(pair, payload);
        return { ...message, sig: inner, author: message.author };
    }

    async verifyForumMessage({ message }) {
        try {
            if (!(message && message.sig)) return true;
            const authorPub = String((message.author && message.author.pub) || '');
            if (!authorPub) return false;
            const v = await this._verify(message.sig, authorPub);
            if (!v) return false;
            return (
                String(v.id) === String(message.id) &&
                String(v.threadId) === String(message.threadId) &&
                String(v.body) === String(message.body || '') &&
                String(v.createdAt) === String(message.createdAt || '') &&
                String(v.authorPub) === authorPub &&
                String(v.authorName) === String((message.author && message.author.name) || '') &&
                String(v.authorAvatar) === String((message.author && message.author.avatar) || '💬') &&
                String(v.parentId || '') === String(message.parentId || '')
            );
        } catch {
            return false;
        }
    }

    async signDeletion({ adminPair, kind, targetId }) {
        const payload = { kind: String(kind), targetId: String(targetId), at: new Date().toISOString() };
        return this._signJsonPayload(adminPair, payload);
    }

    async signDeletionBy({ pair, kind, targetId }) {
        return this.signDeletion({ adminPair: pair, kind, targetId });
    }

    async verifyDeletionRecord({ record, kind, targetId }) {
        try {
            const ev = record && record.sig && typeof record.sig === 'object' ? record.sig : null;
            if (!ev || !verifyEvent(ev)) return false;
            const by = String(record.by || tagValue(ev, 'pk') || ev.pubkey || '');
            if (!by) return false;
            const v = await this._verifyJsonPayloadEvent(ev);
            return !!(v && String(v.kind) === String(kind) && String(v.targetId) === String(targetId) && typeof v.at === 'string');
        } catch {
            return false;
        }
    }

    async loadForumSnapshot() {
        return { threads: [], messages: [] };
    }

    putUserProgress({ pub, universeId, userPub, record }) {
        void this._publishUserProgress(pub, universeId, userPub, record, this._relays());
    }

    async _publishUserProgress(pub, universeId, userPub, record, relays) {
        const w = this._authWriterPair();
        const ev = finalizeEvent(
            {
                kind: KIND_USER_PROGRESS,
                created_at: Math.floor(Date.now() / 1000),
                tags: [arbRootTag(pub, universeId), ['user', String(userPub)]],
                content: JSON.stringify(record)
            },
            pairSecretKey(w)
        );
        try {
            await Promise.all(this._pool.publish(relays, ev));
        } catch {
            /* ignore */
        }
    }

    putUserProgressReplicated({ pub, universeId, userPub, record, peers }) {
        const list = normalizeNostrRelayUrls(peers);
        if (!list.length) {
            this.putUserProgress({ pub, universeId, userPub, record });
            return;
        }
        void this._publishUserProgress(pub, universeId, userPub, record, list);
    }

    clearUserProgress({ pub, universeId, userPub }) {
        this.putUserProgress({ pub, universeId, userPub, record: null });
    }

    async getUserProgress({ pub, universeId, userPub }) {
        const evs = await this._query(
            {
                kinds: [KIND_USER_PROGRESS],
                '#user': [String(userPub)],
                limit: 20
            },
            6000
        );
        for (const ev of evs) {
            if (!hasArbRoot(ev, pub, universeId)) continue;
            try {
                return JSON.parse(ev.content || 'null');
            } catch {
                continue;
            }
        }
        return null;
    }

    addThread() {}
    addMessage() {}

    addThreadV2() {}
    addMessageV2() {}

    addThreadV3({ pub, universeId, placeId, thread }) {
        void this._forumPut(pub, universeId, 'threadV3', `${this._placeKey(placeId)}:${thread.id}`, thread);
    }

    _placeKey(placeId) {
        return placeId == null || placeId === '' ? '_general' : String(placeId);
    }

    async _forumPut(pub, universeId, bucket, key, obj) {
        const w = this._authWriterPair();
        const d = `arborito:forumv3:${bucket}:${String(pub)}:${String(universeId)}:${String(key)}`;
        const ev = finalizeEvent(
            {
                kind: KIND_FORUM_BUCKET,
                created_at: Math.floor(Date.now() / 1000),
                tags: [['d', d], arbRootTag(pub, universeId)],
                content: JSON.stringify(obj)
            },
            pairSecretKey(w)
        );
        await this._publish(ev);
    }

    async loadThreadsByPlaceV3({ pub, universeId, placeId }) {
        const pk = this._placeKey(placeId);
        const evs = await this._query(
            {
                kinds: [KIND_FORUM_BUCKET],
                limit: 400
            },
            12000
        );
        const out = [];
        const prefix = `arborito:forumv3:threadV3:${String(pub)}:${String(universeId)}:${pk}:`;
        for (const ev of evs) {
            const d = tagValue(ev, 'd');
            if (!d || !d.startsWith(prefix)) continue;
            if (!hasArbRoot(ev, pub, universeId)) continue;
            try {
                const t = JSON.parse(ev.content || 'null');
                if (t && typeof t === 'object' && t.id) out.push(t);
            } catch {
                /* ignore */
            }
        }
        return out;
    }

    putThreadPageRefV3({ pub, universeId, threadId, pageKey, ref }) {
        void this._forumPut(pub, universeId, 'page', `${threadId}:${pageKey}`, ref);
    }

    async loadThreadPageRefsV3({ pub, universeId, threadId }) {
        const evs = await this._query({ kinds: [KIND_FORUM_BUCKET], limit: 600 }, 8000);
        const map = new Map();
        const prefix = `arborito:forumv3:page:${String(pub)}:${String(universeId)}:${String(threadId)}:`;
        for (const ev of evs) {
            const d = tagValue(ev, 'd');
            if (!d || !d.startsWith(prefix)) continue;
            if (!hasArbRoot(ev, pub, universeId)) continue;
            const pk = d.slice(prefix.length);
            try {
                map.set(pk, JSON.parse(ev.content || 'null'));
            } catch {
                /* ignore */
            }
        }
        return map;
    }

    async loadThreadPageRefV3({ pub, universeId, threadId, pageKey }) {
        const m = await this.loadThreadPageRefsV3({ pub, universeId, threadId });
        return m.get(String(pageKey || '')) || null;
    }

    putForumSearchRefV3({ pub, universeId, pageKey, ref }) {
        void this._forumPut(pub, universeId, 'search', String(pageKey || ''), ref);
    }

    async loadForumSearchRefsV3({ pub, universeId }) {
        const evs = await this._query({ kinds: [KIND_FORUM_BUCKET], limit: 600 }, 8000);
        const map = new Map();
        const prefix = `arborito:forumv3:search:${String(pub)}:${String(universeId)}:`;
        for (const ev of evs) {
            const d = tagValue(ev, 'd');
            if (!d || !d.startsWith(prefix)) continue;
            if (!hasArbRoot(ev, pub, universeId)) continue;
            const pk = d.slice(prefix.length);
            try {
                map.set(pk, JSON.parse(ev.content || 'null'));
            } catch {
                /* ignore */
            }
        }
        return map;
    }

    async putForumModerationPolicyV3({ pub, universeId, adminPair, mode }) {
        const m = mode === 'strict' ? 'strict' : 'free';
        const uid = String(universeId || '');
        const payload = { v: 1, mode: m, universeId: uid, at: new Date().toISOString() };
        const ev = await this._finalize(adminPair, {
            kind: KIND_FORUM_BUCKET,
            tags: [arbRootTag(pub, universeId), ['d', `arborito:forumv3:policy:${pub}:${universeId}`]],
            content: JSON.stringify(payload)
        });
        await this._publish(ev);
    }

    async loadForumModerationPolicyV3({ pub, universeId }) {
        const ev = await this._get(
            {
                kinds: [KIND_FORUM_BUCKET],
                authors: [String(pub)],
                '#d': [`arborito:forumv3:policy:${pub}:${universeId}`],
                limit: 1
            },
            5000
        );
        if (!ev || !verifyEvent(ev)) return 'free';
        try {
            const v = JSON.parse(ev.content || 'null');
            if (!v || String(v.v) !== '1' || String(v.universeId) !== String(universeId)) return 'free';
            return v.mode === 'strict' ? 'strict' : 'free';
        } catch {
            return 'free';
        }
    }

    async signForumBanV3(pair, { ownerPub, universeId, targetPub, action = 'ban' }) {
        const a = String(action || '').toLowerCase() === 'unban' ? 'unban' : 'ban';
        const payload = {
            kind: 'forum_ban_v1',
            ownerPub: String(ownerPub),
            universeId: String(universeId),
            targetPub: String(targetPub),
            action: a,
            at: new Date().toISOString()
        };
        return this._signJsonPayload(pair, payload);
    }

    async _loadForumEditorSetOnce({ ownerPub, universeId }) {
        const k = `${String(ownerPub)}:${String(universeId)}`;
        const now = Date.now();
        if ((this._forumEditorsCache && this._forumEditorsCache.key) === k && now - (this._forumEditorsCache.t || 0) < 120_000) {
            return this._forumEditorsCache.set || new Set();
        }
        const set = new Set([String(ownerPub)]);
        try {
            const rows = await this.loadCollaboratorInvites({ ownerPub, universeId });
            for (const row of rows) {
                if (row.role === 'editor' && row.inviteePub) set.add(String(row.inviteePub));
            }
        } catch {
            /* ignore */
        }
        this._forumEditorsCache = { key: k, t: now, set };
        return set;
    }

    async verifyForumBanV3(record, ownerPub, universeId) {
        try {
            const ev = record && record.sig && typeof record.sig === 'object' ? record.sig : null;
            if (!ev || !verifyEvent(ev)) return false;
            const by = String(record.by || ev.pubkey || '');
            const allowed = await this._loadForumEditorSetOnce({ ownerPub, universeId });
            if (!allowed.has(by)) return false;
            const v = await this._verifyJsonPayloadEvent(ev);
            return (
                !!v &&
                String(v.kind) === 'forum_ban_v1' &&
                String(v.ownerPub) === String(ownerPub) &&
                String(v.universeId) === String(universeId) &&
                String(v.targetPub) === String(record.targetPub) &&
                (v.action === 'ban' || v.action === 'unban')
            );
        } catch {
            return false;
        }
    }

    async putForumBanV3({ ownerPub, universeId, pair, targetPub, action = 'ban' }) {
        const inner = await this.signForumBanV3(pair, { ownerPub, universeId, targetPub, action });
        const ev = await this._finalize(pair, {
            kind: KIND_FORUM_BUCKET,
            tags: [
                arbRootTag(ownerPub, universeId),
                ['d', `arborito:forumv3:ban:${ownerPub}:${universeId}:${targetPub}`]
            ],
            content: JSON.stringify({ targetPub, by: pair.pub, sig: inner })
        });
        await this._publish(ev);
        return { targetPub, by: pair.pub, sig: inner };
    }

    async loadForumBansV3({ ownerPub, universeId, max = 1200 }) {
        const evs = await this._query({ kinds: [KIND_FORUM_BUCKET], limit: Math.min(3000, max * 2) }, 8000);
        const banned = new Set();
        let scanned = 0;
        const prefix = `arborito:forumv3:ban:${String(ownerPub)}:${String(universeId)}:`;
        for (const ev of evs) {
            const d = tagValue(ev, 'd');
            if (!d || !d.startsWith(prefix)) continue;
            if (!hasArbRoot(ev, ownerPub, universeId)) continue;
            if (scanned++ > max) break;
            let rec;
            try {
                rec = JSON.parse(ev.content || 'null');
            } catch {
                continue;
            }
            if (!rec || typeof rec !== 'object') continue;
            const ok = await this.verifyForumBanV3({ ...rec, sig: rec.sig }, ownerPub, universeId);
            if (!ok) continue;
            const inner = await this._verifyJsonPayloadEvent(rec.sig);
            if (inner && inner.action === 'ban') banned.add(String(rec.targetPub));
            else banned.delete(String(rec.targetPub));
        }
        return banned;
    }

    putPendingForumMessageV3({ pub, universeId, messageId, record }) {
        void this._forumPut(pub, universeId, 'pending', String(messageId || '').trim(), record);
    }

    async loadPendingForumMessageV3({ pub, universeId, messageId }) {
        const mid = String(messageId || '').trim();
        if (!mid) return null;
        const ev = await this._get(
            {
                kinds: [KIND_FORUM_BUCKET],
                '#d': [`arborito:forumv3:pending:${String(pub)}:${String(universeId)}:${mid}`],
                limit: 1
            },
            4000
        );
        if (!ev) return null;
        try {
            return JSON.parse(ev.content || 'null');
        } catch {
            return null;
        }
    }

    async listPendingForumMessageIdsV3({ pub, universeId, max = 120 }) {
        const evs = await this._query({ kinds: [KIND_FORUM_BUCKET], limit: 400 }, 6000);
        const prefix = `arborito:forumv3:pending:${String(pub)}:${String(universeId)}:`;
        const out = [];
        const cap = Math.max(1, Math.min(500, Number(max) || 120));
        for (const ev of evs) {
            const d = tagValue(ev, 'd');
            if (!d || !d.startsWith(prefix)) continue;
            out.push(d.slice(prefix.length));
            if (out.length >= cap) break;
        }
        return out;
    }

    clearPendingForumMessageV3({ pub, universeId, messageId }) {
        void this._forumPut(pub, universeId, 'pending', String(messageId || '').trim(), null);
    }

    async putDeletedMessage({ pub, universeId, messageId, record }) {
        const ev = record && record.sig ? record.sig : null;
        const wrapped = { ...record, sig: ev };
        void this._forumPut(pub, universeId, 'delmsg', String(messageId), wrapped);
    }

    async deleteMessage({ pub, universeId, messageId, adminPair }) {
        const rec = await this.signDeletion({ adminPair, kind: 'delete_message', targetId: messageId });
        await this.putDeletedMessage({ pub, universeId, messageId, record: { by: adminPair.pub, sig: rec } });
    }

    async putDeletedThread({ pub, universeId, threadId, record }) {
        void this._forumPut(pub, universeId, 'delthr', String(threadId), record);
    }

    async deleteThread({ pub, universeId, threadId, adminPair }) {
        const rec = await this.signDeletion({ adminPair, kind: 'delete_thread', targetId: threadId });
        await this.putDeletedThread({ pub, universeId, threadId, record: { by: adminPair.pub, sig: rec } });
    }

    async putDeletedAccount({ pub, universeId, userPub, record }) {
        void this._forumPut(pub, universeId, 'delacct', String(userPub), record);
    }

    async deleteAccountByAdmin({ pub, universeId, userPub, adminPair }) {
        const rec = await this.signDeletion({ adminPair, kind: 'delete_account', targetId: userPub });
        await this.putDeletedAccount({ pub, universeId, userPub, record: { by: adminPair.pub, sig: rec } });
    }

    async deleteAccountSelf({ pub, universeId, pair }) {
        const userPub = String(pair.pub);
        const rec = await this.signDeletionBy({ pair, kind: 'delete_account', targetId: userPub });
        await this.putDeletedAccount({ pub, universeId, userPub, record: { by: pair.pub, sig: rec } });
    }

    async getDeletedAccountRecord({ pub, universeId, userPub }) {
        const ev = await this._get(
            {
                kinds: [KIND_FORUM_BUCKET],
                '#d': [`arborito:forumv3:delacct:${String(pub)}:${String(universeId)}:${String(userPub)}`],
                limit: 1
            },
            5000
        );
        if (!ev) return null;
        try {
            const raw = JSON.parse(ev.content || 'null');
            const ok = await this.verifyDeletionRecord({ record: raw, kind: 'delete_account', targetId: userPub });
            return ok ? raw : null;
        } catch {
            return null;
        }
    }

    startUniversePresence({ pub, universeId, onCount }) {
        const emit = (total) => {
            if (typeof onCount === 'function') onCount(total);
        };
        if (!this.available) {
            emit(0);
            return { stop: () => {}, ping: () => {} };
        }
        let sid = '';
        try {
            sid = sessionStorage.getItem('arborito-tree-presence-sid') || '';
            if (!sid) {
                sid = randomUUIDSafe();
                sessionStorage.setItem('arborito-tree-presence-sid', sid);
            }
        } catch {
            sid = `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
        }
        const w = this._authWriterPair();
        const ping = () => {
            const ev = this._finalize(w, {
                kind: KIND_PRESENCE_PING,
                created_at: Math.floor(Date.now() / 1000),
                tags: [arbRootTag(pub, universeId), ['sid', sid]],
                content: ''
            });
            void this._publish(ev);
        };
        ping();
        const hb = setInterval(ping, 20000);
        const runPoll = async () => {
            try {
                const since = Math.floor(Date.now() / 1000) - 90;
                const evs = await this._query(
                    {
                        kinds: [KIND_PRESENCE_PING],
                        since,
                        limit: 2000
                    },
                    4000
                );
                let total = 0;
                const seen = new Set();
                for (const ev of evs) {
                    if (!hasArbRoot(ev, pub, universeId)) continue;
                    const s = tagValue(ev, 'sid');
                    if (!s || seen.has(s)) continue;
                    seen.add(s);
                    total++;
                }
                emit(total);
            } catch {
                emit(0);
            }
        };
        runPoll();
        const pollIv = setInterval(runPoll, 14000);
        const stop = () => {
            clearInterval(hb);
            clearInterval(pollIv);
        };
        return { stop, ping };
    }

    // --- QR Signaling (desktop displays QR, mobile authorizes) ---

    /**
     * Desktop publishes its QR signal (replaceable, expires in ~5min)
     * @param {{ tempPair: {pub: string, priv: string}, sessionId: string, relays: string[] }}
     * @returns {Promise<import('../../vendor/nostr-tools/lib/types/core.js').Event | null>}
     */
    async publishQrSignalRequest({ tempPair, sessionId, relays = [] }) {
        if (!tempPair?.pub || !tempPair?.priv || !sessionId) return null;
        const payload = {
            v: 1,
            kind: 'qr_signal_request',
            sid: String(sessionId),
            rel: Array.isArray(relays) ? relays.slice(0, 5) : [],
            ts: Date.now()
        };
        const d = qrSignalDTag(tempPair.pub);
        const ev = await this._finalize(tempPair, {
            kind: KIND_QR_SIGNAL_REQUEST,
            tags: [['d', d], [TAG_APP, TAG_APP_VALUE]],
            content: JSON.stringify(payload)
        });
        await this._publish(ev);
        return ev;
    }

    /**
     * Mobile publishes authorization after scanning QR
     * @param {{ mobilePair: {pub: string, priv: string}, sessionId: string, desktopPubkey: string, username: string, secretHash: string }}
     * @returns {Promise<import('../../vendor/nostr-tools/lib/types/core.js').Event | null>}
     */
    async publishQrSignalAuth({ mobilePair, sessionId, desktopPubkey, username, secretHash }) {
        if (!mobilePair?.pub || !mobilePair?.priv || !sessionId || !desktopPubkey) return null;
        const payload = {
            v: 1,
            kind: 'qr_signal_auth',
            sid: String(sessionId),
            to: String(desktopPubkey),
            u: String(username || '').trim(),
            h: String(secretHash || '').trim(),
            ts: Date.now()
        };
        const d = qrAuthDTag(sessionId);
        const ev = await this._finalize(mobilePair, {
            kind: KIND_QR_SIGNAL_AUTH,
            tags: [['d', d], [TAG_APP, TAG_APP_VALUE]],
            content: JSON.stringify(payload)
        });
        await this._publish(ev);
        return ev;
    }

    /**
     * Desktop queries authorization from mobile
     * @param {string} sessionId
     * @param {number} [maxAgeMs]
     * @returns {Promise<{ username: string, secretHash: string, timestamp: number } | null>}
     */
    async queryQrSignalAuth(sessionId, maxAgeMs = 5 * 60 * 1000) {
        if (!sessionId) return null;
        const d = qrAuthDTag(sessionId);
        const since = Math.floor((Date.now() - maxAgeMs) / 1000);
        const evs = await this._query(
            {
                kinds: [KIND_QR_SIGNAL_AUTH],
                '#d': [d],
                since,
                limit: 5
            },
            4000
        );
        // Take the most recent one
        let best = null;
        for (const ev of evs) {
            if (!best || (ev.created_at || 0) > (best.created_at || 0)) best = ev;
        }
        if (!best) return null;
        try {
            const raw = JSON.parse(best.content || 'null');
            if (!raw || raw.kind !== 'qr_signal_auth') return null;
            return {
                username: String(raw.u || '').trim(),
                secretHash: String(raw.h || '').trim(),
                timestamp: Number(raw.ts) || best.created_at * 1000
            };
        } catch {
            return null;
        }
    }

    /**
     * Desktop cancels its QR signal (publishes empty/replaceable event)
     * @param {{ tempPair: {pub: string, priv: string} }}
     * @returns {Promise<import('../../vendor/nostr-tools/lib/types/core.js').Event | null>}
     */
    async revokeQrSignalRequest({ tempPair }) {
        if (!tempPair?.pub || !tempPair?.priv) return null;
        const d = qrSignalDTag(tempPair.pub);
        const ev = await this._finalize(tempPair, {
            kind: KIND_QR_SIGNAL_REQUEST,
            tags: [['d', d], [TAG_APP, TAG_APP_VALUE]],
            content: JSON.stringify({ revoked: true, ts: Date.now() })
        });
        await this._publish(ev);
        return ev;
    }
}
