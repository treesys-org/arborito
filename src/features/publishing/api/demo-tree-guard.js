import { DEMO_BRANCH_ID, DEMO_BRANCH_UNIVERSE } from '../../../core/demo/arborito-demo-ids.js';

/**
 * True when the loaded curriculum is the bundled Arborito demo (fixed branch id),
 * or a network/memory view of that same universe — not a user’s local fork.
 */
export function isArboritoDemoTree(store) {
    const src = store?.state?.activeSource;
    const branchId =
        src?.type === 'branch'
            ? String(src.id || '')
            : String(src?.url || '').startsWith('branch://')
              ? String(src.url).slice('branch://'.length).split('/')[0]
              : '';
    if (branchId === DEMO_BRANCH_ID) return true;
    /*
     * Local garden forks keep their own branch-… id. Never treat them as the
     * bundled demo even if curriculum metadata still mentions the demo universe.
     */
    if (branchId && branchId !== DEMO_BRANCH_ID && String(src?.url || '').startsWith('branch://')) {
        return false;
    }
    const raw = store?.state?.rawGraphData;
    const universeId = String(raw?.universeId || raw?.meta?.universeId || '').trim();
    return universeId === DEMO_BRANCH_UNIVERSE;
}

export function isBundledDemoBranchId(branchId) {
    return String(branchId || '').trim() === DEMO_BRANCH_ID;
}
