import { computeBranchSetHashSync } from './branch-set-hash.js';

/**
 * Find a local composed tree whose branch set matches `hash`.
 * Falls back to computing hash from branchRefs when branchSetHash is missing.
 */
export function findLocalTreeWithSameHash(trees, hash, excludeId = '') {
    if (!hash) return null;
    return (Array.isArray(trees) ? trees : []).find((t) => {
        if (!t?.id || t.id === excludeId) return false;
        const stored = String(t?.branchSetHash || '').trim();
        if (stored) return stored === hash;
        const refs = Array.isArray(t.branchRefs) ? t.branchRefs : [];
        return refs.length > 0 && computeBranchSetHashSync(refs) === hash;
    });
}

/** @param {object[]} branchRefs */
export function findLocalTreeWithSameBranchRefs(trees, branchRefs, excludeId = '') {
    const hash = computeBranchSetHashSync(branchRefs);
    if (!hash) return null;
    return findLocalTreeWithSameHash(trees, hash, excludeId);
}

export function hasDuplicateBranchRefs(branchRefs) {
    const keys = (Array.isArray(branchRefs) ? branchRefs : [])
        .map((r) => String(r?.networkUrl || r?.sourceUrl || r?.branchId || r?.refId || '').trim())
        .filter(Boolean);
    return new Set(keys).size !== keys.length;
}
