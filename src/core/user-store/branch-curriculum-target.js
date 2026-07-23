import { getArboritoStore } from '../store-singleton.js';

/**
 * Active branch id when viewing a local composed tree (mirrors FileSystemService
 * without importing it — avoids a circular module edge).
 */
function activeComposedBranchId(store, src) {
    if (!src || src.type !== 'composed-tree') return '';
    const ctx = store?.state?.treeContext;
    const refKey = ctx?.activeBranchRefId
        ? String(ctx.activeBranchRefId)
        : ctx?.singleBranch && ctx?.branchRefId
          ? String(ctx.branchRefId)
          : '';
    if (!refKey) return '';
    const treeId = String(src.treeId || src.id || '').trim()
        || (String(src.url || '').startsWith('tree://')
            ? String(src.url).slice('tree://'.length)
            : '');
    const entry = treeId ? store?.userStore?.getTree?.(treeId) : null;
    const ref = (entry?.branchRefs || []).find(
        (r) => String(r.refId || '') === refKey || String(r.branchId || '') === refKey
    );
    return ref ? String(ref.branchId || ref.refId || '') : refKey;
}

/**
 * Which in-memory curriculum object should receive local branch CRUD while the
 * learner is viewing the live draft vs a saved snapshot (`localArchiveReleaseId`).
 * @param {object | null | undefined} treeEntry
 * @returns {{ languages: Record<string, object>, isSnapshot: boolean, snapshotId?: string } | null}
 */
export function resolveMutableBranchCurriculum(treeEntry) {
    if (!treeEntry) return null;

    const store = getArboritoStore();
    const src = store?.state?.activeSource;
    const branchId = String(treeEntry.id || '');
    const branchUrl = String(src?.url || '');
    const urlBranchId = branchUrl.startsWith('branch://')
        ? branchUrl.slice('branch://'.length).split('/')[0]
        : '';
    const composedBranchId = activeComposedBranchId(store, src);
    const onThisBranch =
        (urlBranchId && urlBranchId === branchId) ||
        (src?.type === 'branch' && String(src.id || '') === branchId) ||
        (src?.type === 'archive' && urlBranchId === branchId) ||
        (src?.type === 'composed-tree' && composedBranchId === branchId);

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
