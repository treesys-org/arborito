/**
 * Branch id/url normalization for persisted storage and one-time catalog migration.
 */

/** @param {string} id */
export function migrateLegacyBranchId(id) {
    const s = String(id || '').trim();
    if (!s) return s;
    if (s.startsWith('local-')) return `branch-${s.slice('local-'.length)}`;
    return s;
}

/** @param {string} url */
export function migrateLegacyBranchUrl(url) {
    const u = String(url || '').trim();
    if (!u) return u;
    if (u.startsWith('local://')) {
        const rest = u.slice('local://'.length);
        const slash = rest.indexOf('/');
        const rawId = slash >= 0 ? rest.slice(0, slash) : rest;
        const tail = slash >= 0 ? rest.slice(slash) : '';
        return `branch://${migrateLegacyBranchId(rawId)}${tail}`;
    }
    if (u.startsWith('branch://')) {
        const rest = u.slice('branch://'.length);
        const slash = rest.indexOf('/');
        const rawId = slash >= 0 ? rest.slice(0, slash) : rest;
        if (rawId.startsWith('local-')) {
            const tail = slash >= 0 ? rest.slice(slash) : '';
            return `branch://${migrateLegacyBranchId(rawId)}${tail}`;
        }
    }
    return u;
}

/** @param {object|null|undefined} source */
export function normalizeBranchActiveSource(source) {
    if (!source || typeof source !== 'object') return source;
    const next = { ...source };
    if (next.type === 'local') next.type = 'branch';
    if (next.id) next.id = migrateLegacyBranchId(next.id);
    if (next.url) next.url = migrateLegacyBranchUrl(next.url);
    return next;
}

/** @param {object} entry branch catalog row */
export function normalizeBranchCatalogEntry(entry) {
    if (!entry?.id) return entry;
    const id = migrateLegacyBranchId(entry.id);
    const next = id === entry.id ? { ...entry } : { ...entry, id };
    if (next.data && typeof next.data === 'object') {
        next.data = { ...next.data };
        if (next.data.universeId) next.data.universeId = migrateLegacyBranchId(next.data.universeId);
    }
    return next;
}

/** @param {object[]} branchRefs */
export function normalizeComposedTreeBranchRefs(branchRefs) {
    if (!Array.isArray(branchRefs)) return branchRefs;
    return branchRefs.map((ref) => {
        if (!ref || typeof ref !== 'object') return ref;
        const next = { ...ref };
        if (next.branchId) next.branchId = migrateLegacyBranchId(next.branchId);
        if (next.refId && String(next.refId).startsWith('local-')) {
            next.refId = migrateLegacyBranchId(next.refId);
        }
        if (next.sourceUrl) next.sourceUrl = migrateLegacyBranchUrl(next.sourceUrl);
        return next;
    });
}
