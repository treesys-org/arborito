/**
 * Shared verification between the client (`NostrUniverseService`) and the Node aggregator script.
 */
import { verifyEvent } from '../../vendor/nostr-tools/lib/esm/pure.js';
import { KIND_TREE_DIRECTORY } from '../config/nostr-spec.js';

/**
 * @param {import('../../vendor/nostr-tools/lib/types/core.js').Event | null} ev
 * @param {object} [record] — directory row (optional; for field-by-field match checks)
 */
export async function verifyGlobalTreeDirectoryMetaNostr(ev, record) {
    try {
        if (!ev || typeof ev !== 'object' || !ev.sig) return false;
        if (!verifyEvent(ev)) return false;
        if (Number(ev.kind) !== KIND_TREE_DIRECTORY) return false;
        const v = JSON.parse(String(ev.content || 'null'));
        if (!v || typeof v !== 'object') return false;
        const kind = String(v.kind || '');
        const okKind = kind === 'tree_directory_v1' || kind === 'tree_directory_v2';
        if (!okKind) return false;
        if (String(v.ownerPub || '') !== String(ev.pubkey || '')) return false;
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
        const trusted = Array.isArray(opts.trustedPublishers) ? opts.trustedPublishers : [];
        if (trusted.length && !trusted.includes(by)) return false;
        const v = JSON.parse(String(ev.content || 'null'));
        if (!v || typeof v !== 'object') return false;
        if (String(v.kind) !== 'directory_index_snapshot_v1') return false;
        const slot = String(v.slot || '');
        if (slot !== 'recent' && slot !== 'top') return false;
        if (!Array.isArray(v.entries)) return false;
        const cap = Number(v.maxEntries || 0);
        if (!cap || cap > 2500 || v.entries.length > cap) return false;
        return true;
    } catch {
        return false;
    }
}

/**
 * @param {import('../../vendor/nostr-tools/lib/types/core.js').Event} ev — `KIND_DIRECTORY_BUMP` event or pre-parsed body with explicit `pubkey`
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
