import { DEMO_BRANCH_ID } from '../../../core/demo/arborito-demo-ids.js';
import { getArboritoStore } from '../../../core/store-singleton.js';

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

/**
 * Before register: enable auto-sync and mark whether local courses should upload after signup.
 * UI must call this instead of touching the store singleton.
 * @param {{ state?: object, persist?: () => void } | null | undefined} userStore
 * @returns {boolean} true when at least one local branch will sync after register
 */
export function armRegisterLocalBranchSync(userStore) {
    const store = getArboritoStore();
    const hasLocal = listLocalSyncableBranchIds(userStore).length > 0;
    setAutoSyncLocalBranches(userStore, true);
    if (store) store._pendingSyncLocalBranchesOnRegister = hasLocal;
    return hasLocal;
}

/** Clear the post-register local-sync flag (e.g. register failed). */
export function disarmRegisterLocalBranchSync() {
    try {
        const store = getArboritoStore();
        if (store) store._pendingSyncLocalBranchesOnRegister = false;
    } catch {
        /* ignore */
    }
}
