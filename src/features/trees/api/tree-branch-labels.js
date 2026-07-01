import { getArboritoStore as store } from '../../../core/store-singleton.js';

/**
 * Resolve human-readable branch names from tree branchRefs.
 * @param {object[]} branchRefs
 * @param {object[]} [branches]
 */
export function resolveBranchRefDisplayNames(branchRefs, branches = null) {
    const refs = Array.isArray(branchRefs) ? branchRefs : [];
    const local = branches || store.userStore?.state?.branches || [];
    return refs
        .map((ref) => {
            const bid = String(ref?.branchId || ref?.refId || '').trim();
            const hit = local.find((b) => String(b?.id || '') === bid);
            return String(hit?.name || ref?.displayName || bid || '').trim();
        })
        .filter(Boolean);
}

/**
 * Plain-text summary: "A · B · +2 more"
 * @param {string[]} names
 * @param {object} [ui]
 * @param {{ max?: number }} [opts]
 */
export function formatBranchNamesSummary(names, ui = {}, { max = 3 } = {}) {
    const arr = Array.isArray(names) ? names : [];
    const cap = Math.max(1, Number(max) || 3);
    const shown = arr.slice(0, cap);
    if (!shown.length) return '';
    let text = shown.join(' · ');
    const extra = arr.length - shown.length;
    if (extra > 0) {
        const tpl = ui.sourcesTreeBranchesMore || '+{{n}} more';
        text += ` · ${tpl.replace(/\{\{n\}\}/g, String(extra))}`;
    }
    return text;
}
