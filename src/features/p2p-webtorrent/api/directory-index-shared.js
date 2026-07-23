/**
 * Shared verification between the client (`NostrUniverseService`) and the Node aggregator script.
 */
import { verifyEvent } from '../../../../vendor/nostr-tools/lib/esm/pure.js';
import { KIND_TREE_DIRECTORY } from '../../nostr/api/nostr-spec.js';
import { verifyAppPow } from '../../nostr/api/nostr-pow.js';

/**
 * @param {import('../../nostr/api/client/core.js').Event | null} ev
 * @param {object} [record], directory row (optional; for field-by-field match checks)
 */
export async function verifyGlobalTreeDirectoryMetaNostr(ev, record) {
    try {
        if (!ev || typeof ev !== 'object' || !ev.sig) return false;
        if (!verifyEvent(ev)) return false;
        if (Number(ev.kind) !== KIND_TREE_DIRECTORY) return false;
        const v = JSON.parse(String(ev.content || 'null'));
        if (!v || typeof v !== 'object') return false;
        const kind = String(v.kind || '');
        const okKind = kind === 'tree_directory_v2';
        if (!okKind) return false;
        if (String(v.ownerPub || '') !== String(ev.pubkey || '')) return false;
        /* Anti-flood: listing a row in the public catalog requires a valid
         * proof-of-work bound to ownerPub/universeId (see nostr-pow.js).
         * Owner delists are exempt, removing your own row must stay free. */
        if (v.delisted !== true) {
            const powOk = verifyAppPow(
                'tree_directory_v2',
                String(v.ownerPub || ''),
                String(v.universeId || ''),
                'directory',
                String(ev.pubkey || ''),
                v.powNonce
            );
            if (!powOk) return false;
        }
        if (record && typeof record === 'object') {
            if (v.delisted === true || record.delisted === true) {
                return (
                    String(v.ownerPub) === String(record.ownerPub) &&
                    String(v.universeId) === String(record.universeId) &&
                    v.delisted === true &&
                    record.delisted === true
                );
            }
            return (
                String(v.ownerPub) === String(record.ownerPub) &&
                String(v.universeId) === String(record.universeId) &&
                String(v.title || '') === String(record.title || '') &&
                String(v.shareCode || '') === String(record.shareCode || '') &&
                String(v.description || '') === String(record.description || '') &&
                String(v.authorName || '') === String(record.authorName || '')
            );
        }
        return true;
    } catch {
        return false;
    }
}

/**
 * @param {object} record
 * @param {{ trustedPublishers?: string[] }} [opts]
 */
export async function verifyDirectoryIndexSnapshotNostr(record, opts = {}) {
    try {
        if (!record || typeof record !== 'object') return false;
        const ev = record.sig && typeof record.sig === 'object' && record.sig.id ? record.sig : null;
        if (!ev || !verifyEvent(ev)) return false;
        const by = String(record.by || ev.pubkey || '');
        if (!by) return false;
        /* Fail closed: snapshots are a *trusted shortcut* over the live event
         * stream, so with no trusted publisher configured they must be ignored
         *, otherwise anyone could publish a fake "top/recent" catalog. Clients
         * fall back to relay trigram search + the bounded crawl, both of which
         * verify every row (signature + PoW) individually. */
        const trusted = Array.isArray(opts.trustedPublishers) ? opts.trustedPublishers : [];
        if (!trusted.length || !trusted.includes(by)) return false;
        const header = JSON.parse(String(ev.content || 'null'));
        if (!header || typeof header !== 'object') return false;
        if (String(header.kind) !== 'directory_index_snapshot_v1') return false;
        const slot = String(header.slot || record.slot || '');
        if (slot !== 'recent' && slot !== 'top') return false;
        const chunkCount = Math.max(0, Math.floor(Number(header.chunkCount)) || 0);
        const entries = Array.isArray(record.entries)
            ? record.entries
            : Array.isArray(header.entries)
              ? header.entries
              : null;
        if (!Array.isArray(entries)) return false;
        if (chunkCount > 0 && !Array.isArray(record.entries)) return false;
        const cap = Number(header.maxEntries || record.maxEntries || 0);
        if (!cap || cap > 2500 || entries.length > cap) return false;
        return true;
    } catch {
        return false;
    }
}

/**
 * @param {import('../../nostr/api/client/core.js').Event} ev, `KIND_DIRECTORY_BUMP` event or pre-parsed body with explicit `pubkey`
 */
export async function verifyDirectoryBumpNostr(ev) {
    try {
        if (!ev || typeof ev !== 'object') return false;
        if (ev.sig && ev.id && Number(ev.kind) >= 0) {
            if (!verifyEvent(ev)) return false;
            const v = JSON.parse(String(ev.content || 'null'));
            if (!v || typeof v !== 'object') return false;
            return (
                String(v.kind) === 'directory_bump_v1' &&
                String(v.ownerPub) === String(ev.pubkey) &&
                typeof v.universeId === 'string' &&
                typeof v.bumpedAt === 'string'
            );
        }
        return false;
    } catch {
        return false;
    }
}
