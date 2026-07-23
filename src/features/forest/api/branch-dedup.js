import { isBundledDemoBranchId } from '../../publishing/api/demo-tree-guard.js';

/**
 * Detect local branches with identical curriculum content.
 * The bundled demo branch is never treated as a reusable duplicate: imports and
 * copies must land on a new editable `branch-<uuid>` entry.
 */

/** Strip volatile identity fields so content-only comparison stays stable. */
export function normalizeBranchDataForHash(data) {
    if (!data || typeof data !== 'object') return null;
    const copy = JSON.parse(JSON.stringify(data));
    delete copy.universeId;
    delete copy.generatedAt;
    if (copy.meta && typeof copy.meta === 'object') {
        const m = { ...copy.meta };
        delete m.publishedNetworkUrl;
        delete m.nostrBundleFormat;
        if (Object.keys(m).length) copy.meta = m;
        else delete copy.meta;
    }
    return copy;
}

/** @param {object} data @param {(obj: object) => string} hashJson */
export function computeBranchContentHash(data, hashJson) {
    const norm = normalizeBranchDataForHash(data);
    if (!norm || typeof hashJson !== 'function') return '';
    return hashJson(norm);
}

/**
 * @param {object[]} branches
 * @param {{ contentHash?: string, publishedNetworkUrl?: string, sourceUniverseId?: string, hashJson?: (obj: object) => string }} opts
 */
export function findLocalBranchDuplicate(branches, opts = {}) {
    const list = Array.isArray(branches) ? branches : [];
    const hashJson = opts.hashJson;

    const reusable = (b) => b && !isBundledDemoBranchId(b.id);

    const pubUrl = String(opts.publishedNetworkUrl || '').trim();
    if (pubUrl) {
        const hit = list.find(
            (b) => reusable(b) && String(b?.publishedNetworkUrl || '').trim() === pubUrl
        );
        if (hit) return hit;
    }

    const srcUid = String(opts.sourceUniverseId || '').trim();
    if (srcUid) {
        const hit = list.find(
            (b) => reusable(b) && String(b?.data?.universeId || '').trim() === srcUid
        );
        if (hit) return hit;
    }

    const hash = String(opts.contentHash || '').trim();
    if (!hash) return null;

    return (
        list.find((b) => {
            if (!reusable(b)) return false;
            const stored = String(b?.contentHash || b?.draftHash || '').trim();
            if (stored && stored === hash) return true;
            if (b?.data && typeof hashJson === 'function') {
                return computeBranchContentHash(b.data, hashJson) === hash;
            }
            return false;
        }) || null
    );
}
