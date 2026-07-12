import { DEMO_BRANCH_ID, DEMO_BRANCH_UNIVERSE } from '../../../core/demo/arborito-demo-ids.js';

/** True when the loaded curriculum is the bundled Arborito demo (fixed universe id). */
export function isArboritoDemoTree(store) {
    const raw = store?.state?.rawGraphData;
    const src = store?.state?.activeSource;
    const universeId = String(raw?.universeId || raw?.meta?.universeId || '').trim();
    if (universeId === DEMO_BRANCH_UNIVERSE) return true;
    const branchId =
        src?.type === 'branch'
            ? String(src.id || '')
            : String(src?.url || '').startsWith('branch://')
              ? String(src.url).slice('branch://'.length).split('/')[0]
              : '';
    return branchId === DEMO_BRANCH_ID;
}

export function isBundledDemoBranchId(branchId) {
    return String(branchId || '').trim() === DEMO_BRANCH_ID;
}
