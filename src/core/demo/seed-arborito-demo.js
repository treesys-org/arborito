/**
 * Seed bundled Arborito demo branch on first boot and after reseteverything.
 */

import { buildDemoBranchEntry } from './load-arborito-demo.js';
import { DEMO_BRANCH_ID, DEMO_SEED_KEY, DEMO_SEED_VERSION } from './arborito-demo-ids.js';

function readSeedVersion() {
    try {
        return localStorage.getItem(DEMO_SEED_KEY) || '';
    } catch {
        return '';
    }
}

function writeSeedVersion() {
    try {
        localStorage.setItem(DEMO_SEED_KEY, DEMO_SEED_VERSION);
    } catch {
        /* ignore */
    }
}

/**
 * @param {import('../user-store/index.js').UserStore} userStore
 * @returns {boolean}
 */
export function maybeSeedArboritoDemo(userStore) {
    if (!userStore?.state) return false;

    const branches = userStore.state.branches || [];
    const idx = branches.findIndex((b) => String(b.id) === DEMO_BRANCH_ID);
    const missing = idx < 0;
    const outdated = readSeedVersion() !== DEMO_SEED_VERSION;

    if (!missing && !outdated) return false;

    const entry = buildDemoBranchEntry();
    if (idx >= 0) {
        userStore.state.branches[idx] = entry;
    } else {
        userStore.state.branches.push(entry);
    }
    userStore.markBranchDirty?.(DEMO_BRANCH_ID);
    userStore.state.branches = [...userStore.state.branches];
    userStore.notifyCatalogChanged?.();
    userStore.persist?.();
    writeSeedVersion();
    return true;
}

/**
 * Default local boot source when nothing else is active (offline / first visit).
 * @param {import('../user-store/index.js').UserStore | null | undefined} userStore
 */
export function bundledDemoBootSource(userStore) {
    const entry = (userStore?.state?.branches || []).find(
        (b) => String(b?.id) === DEMO_BRANCH_ID && b?.data
    );
    if (!entry) return null;
    return {
        id: DEMO_BRANCH_ID,
        name: entry.name || 'Arborito demo',
        url: `branch://${DEMO_BRANCH_ID}`,
        type: 'branch',
        isTrusted: true,
    };
}
