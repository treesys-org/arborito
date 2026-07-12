import { getArboritoStore } from '../store-singleton.js';

/**
 * Which in-memory curriculum object should receive local branch CRUD while the
 * learner is viewing the live draft vs a saved snapshot (`localArchiveReleaseId`).
 * @param {object | null | undefined} treeEntry
 * @returns {{ languages: Record<string, object>, isSnapshot: boolean, snapshotId?: string } | null}
 */
export function resolveMutableBranchCurriculum(treeEntry) {
    if (!treeEntry) return null;

    const src = getArboritoStore()?.state?.activeSource;
    const branchId = String(treeEntry.id || '');
    const branchUrl = String(src?.url || '');
    const urlBranchId = branchUrl.startsWith('branch://')
        ? branchUrl.slice('branch://'.length).split('/')[0]
        : '';
    const onThisBranch =
        (urlBranchId && urlBranchId === branchId) ||
        (src?.type === 'branch' && String(src.id || '') === branchId) ||
        (src?.type === 'archive' && urlBranchId === branchId);

    if (!onThisBranch) {
        if (!treeEntry.data?.languages) return null;
        return { languages: treeEntry.data.languages, isSnapshot: false };
    }

    const snapId =
        src?.localArchiveReleaseId != null ? String(src.localArchiveReleaseId).trim() : '';
    if (snapId && treeEntry.releaseSnapshots?.[snapId]) {
        const snap = treeEntry.releaseSnapshots[snapId];
        if (!snap.languages || typeof snap.languages !== 'object') snap.languages = {};
        return { languages: snap.languages, isSnapshot: true, snapshotId: snapId };
    }

    if (!treeEntry.data) return null;
    if (!treeEntry.data.languages || typeof treeEntry.data.languages !== 'object') {
        treeEntry.data.languages = {};
    }
    return { languages: treeEntry.data.languages, isSnapshot: false };
}
