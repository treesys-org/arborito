/**
 * In-memory cache of composed-tree graphs so reopen matches branch:// speed
 * (skip re-clone/prefix of every member on each open).
 */

import { deepCloneJson } from '../../../shared/lib/deep-clone-json.js';

const MAX_ENTRIES = 12;

/** @type {Map<string, { graphJson: object, singleBranch: boolean, virtualRootId: string|null }>} */
const cache = new Map();

/** Latest fingerprint painted for each treeId — reopen without waiting on hydrate/IDB. */
/** @type {Map<string, string>} */
const lastFingerprintByTreeId = new Map();

/** Stable ids for in-memory branch.data objects (recency bumps must not bust the cache). */
const dataObjectTokens = new WeakMap();
let dataObjectSeq = 1;

function tokenForData(data) {
    if (!data || typeof data !== 'object') return '0';
    let t = dataObjectTokens.get(data);
    if (!t) {
        t = String(dataObjectSeq++);
        dataObjectTokens.set(data, t);
    }
    return t;
}

/**
 * Fingerprint for a composed playlist + member content identity.
 * @param {import('../../../core/store.js').Store} store
 * @param {{ id?: string, updated?: number, name?: string, branchRefs?: object[] }} treeEntry
 * @param {string} lang
 * @param {Array<{ ref: object, data?: object }|null>} [offlinePayloads]
 */
export function buildComposedGraphFingerprint(store, treeEntry, lang, offlinePayloads = null) {
    const treeId = String(treeEntry?.id || '');
    const refs = Array.isArray(treeEntry?.branchRefs) ? treeEntry.branchRefs : [];
    const parts = [
        treeId,
        String(treeEntry?.updated || 0),
        String(treeEntry?.name || ''),
        String(lang || '').toUpperCase(),
        String(refs.length),
    ];
    const branches = store.userStore?.state?.branches || [];
    for (let i = 0; i < refs.length; i++) {
        const ref = refs[i] || {};
        const payload = Array.isArray(offlinePayloads) ? offlinePayloads[i] : null;
        const resolved = payload?.ref || ref;
        const branchId = String(resolved.branchId || ref.branchId || '').trim();
        const refId = String(resolved.refId || ref.refId || branchId || '');
        const src = String(resolved.sourceUrl || ref.sourceUrl || '').trim();
        let branch = branchId ? branches.find((b) => String(b.id) === branchId) : null;
        if (!branch && src.startsWith('branch://')) {
            const id = src.slice('branch://'.length).split('/')[0];
            branch = branches.find((b) => String(b.id) === id) || null;
        }
        const data = payload?.data || branch?.data;
        const skel = payload?.skeleton ? '1' : '0';
        parts.push(`${refId}:${branchId}:${tokenForData(data)}:${skel}`);
    }
    return parts.join('|');
}

/**
 * @param {string} fingerprint
 * @returns {{ graphJson: object, singleBranch: boolean, virtualRootId: string|null }|null}
 */
export function getComposedGraphCache(fingerprint) {
    const key = String(fingerprint || '');
    if (!key || !cache.has(key)) return null;
    const hit = cache.get(key);
    /* LRU: re-insert as newest */
    cache.delete(key);
    cache.set(key, hit);
    try {
        return {
            graphJson: deepCloneJson(hit.graphJson),
            singleBranch: !!hit.singleBranch,
            virtualRootId: hit.virtualRootId || null,
        };
    } catch {
        cache.delete(key);
        return null;
    }
}

/**
 * Last in-memory graph for a playlist id (same session reopen).
 * @param {string} treeId
 * @returns {{ fingerprint: string, graphJson: object, singleBranch: boolean, virtualRootId: string|null }|null}
 */
export function getLatestComposedGraphCacheForTree(treeId) {
    const id = String(treeId || '').trim();
    if (!id) return null;
    const fp = lastFingerprintByTreeId.get(id);
    if (!fp) return null;
    const hit = getComposedGraphCache(fp);
    if (!hit) {
        lastFingerprintByTreeId.delete(id);
        return null;
    }
    return { fingerprint: fp, ...hit };
}

/**
 * @param {string} fingerprint
 * @param {{ graphJson: object, singleBranch: boolean, virtualRootId: string|null }} value
 *   `graphJson` is stored by reference — caller must not mutate it afterward.
 */
export function putComposedGraphCache(fingerprint, value) {
    const key = String(fingerprint || '');
    if (!key || !value?.graphJson || typeof value.graphJson !== 'object') return;
    try {
        const entry = {
            graphJson: value.graphJson,
            singleBranch: !!value.singleBranch,
            virtualRootId: value.virtualRootId || null,
        };
        if (cache.has(key)) cache.delete(key);
        cache.set(key, entry);
        const treeId = key.split('|')[0];
        if (treeId) lastFingerprintByTreeId.set(treeId, key);
        while (cache.size > MAX_ENTRIES) {
            const oldest = cache.keys().next().value;
            cache.delete(oldest);
            if (oldest) {
                const oldestTree = String(oldest).split('|')[0];
                if (oldestTree && lastFingerprintByTreeId.get(oldestTree) === oldest) {
                    lastFingerprintByTreeId.delete(oldestTree);
                }
            }
        }
    } catch {
        /* ignore */
    }
}

/** Drop cached graphs for a tree id (playlist edit / delete). */
export function invalidateComposedGraphCache(treeId) {
    const id = String(treeId || '');
    if (!id) return;
    lastFingerprintByTreeId.delete(id);
    const prefix = `${id}|`;
    for (const key of [...cache.keys()]) {
        if (key === id || key.startsWith(prefix)) cache.delete(key);
    }
}
