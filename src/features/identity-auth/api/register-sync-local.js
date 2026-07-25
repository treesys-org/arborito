import { DEMO_BRANCH_ID } from '../../../core/demo/arborito-demo-ids.js';

/**
 * Local authored branches that can upload as encrypted account drafts.
 * Bundled demo is excluded (local-only; never republish over student progress).
 * @param {{ state?: { branches?: Array<{ id?: string }> } } | null | undefined} userStore
 * @returns {string[]}
 */
export function listLocalSyncableBranchIds(userStore) {
    const branches = Array.isArray(userStore?.state?.branches) ? userStore.state.branches : [];
    const out = [];
    for (const b of branches) {
        const id = String(b?.id || '').trim();
        if (!id || id === DEMO_BRANCH_ID) continue;
        out.push(id);
    }
    return out;
}

/** @param {{ state?: { autoSyncLocalBranches?: boolean } } | null | undefined} userStore */
export function isAutoSyncLocalBranchesEnabled(userStore) {
    return !!userStore?.state?.autoSyncLocalBranches;
}

/**
 * Persist the “auto-sync local courses” preference (Profile + register).
 * @param {{ state?: object, persist?: () => void } | null | undefined} userStore
 * @param {boolean} on
 */
export function setAutoSyncLocalBranches(userStore, on) {
    if (!userStore?.state) return;
    userStore.state.autoSyncLocalBranches = !!on;
    try {
        userStore.persist?.();
    } catch {
        /* ignore */
    }
}
