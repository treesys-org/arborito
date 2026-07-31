/** Stable ids for the bundled Arborito demo branch (restored after reseteverything). */
export const DEMO_SEED_KEY = 'arborito-demo-seeded-v29';
export const DEMO_SEED_VERSION = 'v29';
export const DEMO_BRANCH_ID = 'branch-arborito-demo';
export const DEMO_BRANCH_UNIVERSE = 'arborito-demo';

/** True only for the bundled tutorial branch — not for garden copies. */
export function isBundledArboritoDemoBranch(branchOrId) {
    const id =
        typeof branchOrId === 'string' || typeof branchOrId === 'number'
            ? branchOrId
            : branchOrId?.id;
    return String(id || '') === DEMO_BRANCH_ID;
}
