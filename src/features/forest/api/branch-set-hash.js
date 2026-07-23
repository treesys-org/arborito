/**
 * Stable fingerprint for a composed tree's branch reference set (dedup / spam).
 * @param {Array<{ branchId?: string, sourceUrl?: string, networkUrl?: string, refId?: string }>} branchRefs
 */
export async function computeBranchSetHash(branchRefs) {
    const refs = Array.isArray(branchRefs) ? branchRefs : [];
    const keys = refs
        .map((r) => {
            const net = String(r?.networkUrl || '').trim();
            const src = String(r?.sourceUrl || '').trim();
            const bid = String(r?.branchId || r?.refId || '').trim();
            return net || src || bid;
        })
        .filter(Boolean)
        .sort();
    const payload = keys.join('|');
    if (!payload) return '';
    const data = new TextEncoder().encode(payload);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

/** Sync fallback when subtle crypto unavailable (tests). */
export function computeBranchSetHashSync(branchRefs) {
    const refs = Array.isArray(branchRefs) ? branchRefs : [];
    const keys = refs
        .map((r) => String(r?.networkUrl || r?.sourceUrl || r?.branchId || r?.refId || '').trim())
        .filter(Boolean)
        .sort();
    let h = 0;
    const s = keys.join('|');
    for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    return `sync-${(h >>> 0).toString(16)}`;
}
