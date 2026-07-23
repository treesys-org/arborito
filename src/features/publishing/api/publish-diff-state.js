import { diffTreeData } from '../../tree-graph/api/tree-diff.js';

export function resolvePublishDiffLocalId(modal, activeSource) {
    if (modal && typeof modal === 'object' && modal.branchId) return String(modal.branchId);
    const srcUrl = String(activeSource?.url || '');
    if (srcUrl.startsWith('branch://')) return srcUrl.slice('branch://'.length);
    return '';
}

export function computePublishDiffState(modal, activeSource, rawGraphData, userStore) {
    const localId = resolvePublishDiffLocalId(modal, activeSource);
    const us = userStore?.state;
    const entry =
        localId && us && Array.isArray(us.branches)
            ? us.branches.find((t) => String(t?.id) === String(localId))
            : null;
    const published = entry?.publishedSnapshot || null;
    const draft = rawGraphData || entry?.data || null;
    const d = diffTreeData(published, draft);
    const noBaseline = !published;
    const noChanges =
        !noBaseline && d.counts.added === 0 && d.counts.removed === 0 && d.counts.changed === 0;
    return { localId, entry, published, draft, d, noBaseline, noChanges };
}
